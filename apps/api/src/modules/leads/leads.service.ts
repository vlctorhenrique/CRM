import { randomUUID } from 'node:crypto'
import {
  type AuthUser,
  type ConversationView,
  type CreateLeadInput,
  isValidPhone,
  type LeadDetail,
  type LeadDetailResponse,
  type LeadListItem,
  type LeadListResponse,
  type LeadStatus,
  type MessageView,
  normalizePhone,
  type SendMessageInput,
  type UpdateLeadInput,
} from '@crm/shared'
import { and, asc, count, desc, eq, ilike, inArray, or } from 'drizzle-orm'
import type { AppConfig } from '../../config/env.js'
import type { AppDatabase } from '../../db/client.js'
import { conversations, leads, messages, users, whatsappAccounts } from '../../db/schema/index.js'
import { recordAudit } from '../../lib/audit.js'
import { AppError, forbidden, notFound } from '../../lib/errors.js'
import { sendWhatsAppText } from '../whatsapp/whatsapp.client.js'

export interface AuditMetadata {
  ip: string | null
  userAgent: string | null
}

export interface LeadListFilters {
  search?: string | undefined
  status?: LeadStatus | undefined
  limit: number
  offset: number
}

interface LeadAccessContext {
  user: AuthUser
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  )
}

function canManageAssignment(user: AuthUser): boolean {
  return user.role === 'admin' || user.role === 'manager'
}

function leadIsVisible(user: AuthUser, ownerUserId: string | null): boolean {
  return user.role !== 'sdr' || ownerUserId === user.id
}

async function assertOwnerExists(
  db: AppDatabase,
  tenantId: string,
  ownerUserId: string,
): Promise<void> {
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, ownerUserId), eq(users.tenantId, tenantId), eq(users.status, 'active')))
    .limit(1)

  if (!owner) {
    throw new AppError(
      422,
      'INVALID_OWNER',
      'O responsável informado não está ativo nesta clínica.',
    )
  }
}

async function findLeadRow(db: AppDatabase, tenantId: string, leadId: string) {
  const [row] = await db
    .select({
      lead: leads,
      ownerName: users.name,
    })
    .from(leads)
    .leftJoin(users, eq(leads.ownerUserId, users.id))
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)))
    .limit(1)

  return row ?? null
}

function toLeadDetail(
  row: NonNullable<Awaited<ReturnType<typeof findLeadRow>>>,
  conversation: { id: string; unreadCount: number } | null,
): LeadDetail {
  const lead = row.lead

  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phoneNormalized,
    phoneRaw: lead.phoneRaw,
    status: lead.status,
    source: lead.source,
    ownerUserId: lead.ownerUserId,
    ownerName: row.ownerName,
    interestProcedure: lead.interestProcedure,
    objective: lead.objective,
    bodyRegion: lead.bodyRegion,
    previousTreatment: lead.previousTreatment,
    notes: lead.notes,
    consentStatus: lead.consentStatus,
    consentEvidence: lead.consentEvidence,
    consentAt: toIso(lead.consentAt),
    consentTextVersion: lead.consentTextVersion,
    optOutAt: toIso(lead.optOutAt),
    lastContactAt: toIso(lead.lastContactAt),
    initialMessageSentAt: toIso(lead.initialMessageSentAt),
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    conversationId: conversation?.id ?? null,
    unreadCount: conversation?.unreadCount ?? 0,
  }
}

interface ConversationRow {
  id: string
  leadId: string
  leadName: string | null
  phone: string
  status: 'open' | 'closed'
  humanTakeover: boolean
  unreadCount: number
  lastMessagePreview: string | null
  lastMessageAt: Date | null
  lastInboundAt: Date | null
  assignedUserId: string | null
  assignedUserName: string | null
  accountId: string | null
  accountDisplayPhone: string | null
  accountStatus: 'connected' | 'disconnected' | 'error' | null
}

function toConversationView(row: ConversationRow): ConversationView {
  return {
    id: row.id,
    leadId: row.leadId,
    leadName: row.leadName,
    phone: row.phone,
    status: row.status,
    humanTakeover: row.humanTakeover,
    unreadCount: row.unreadCount,
    lastMessagePreview: row.lastMessagePreview,
    lastMessageAt: toIso(row.lastMessageAt),
    lastInboundAt: toIso(row.lastInboundAt),
    assignedUserId: row.assignedUserId,
    assignedUserName: row.assignedUserName,
  }
}

async function findConversationRow(
  db: AppDatabase,
  tenantId: string,
  leadId: string,
): Promise<ConversationRow | null> {
  const [row] = await db
    .select({
      id: conversations.id,
      leadId: conversations.leadId,
      leadName: leads.name,
      phone: leads.phoneNormalized,
      status: conversations.status,
      humanTakeover: conversations.humanTakeover,
      unreadCount: conversations.unreadCount,
      lastMessagePreview: conversations.lastMessagePreview,
      lastMessageAt: conversations.lastMessageAt,
      lastInboundAt: conversations.lastInboundAt,
      assignedUserId: leads.ownerUserId,
      assignedUserName: users.name,
      accountId: whatsappAccounts.id,
      accountDisplayPhone: whatsappAccounts.displayPhoneNumber,
      accountStatus: whatsappAccounts.status,
    })
    .from(conversations)
    .innerJoin(leads, eq(conversations.leadId, leads.id))
    .leftJoin(users, eq(leads.ownerUserId, users.id))
    .leftJoin(whatsappAccounts, eq(conversations.whatsappAccountId, whatsappAccounts.id))
    .where(and(eq(conversations.tenantId, tenantId), eq(conversations.leadId, leadId)))
    .orderBy(desc(conversations.lastMessageAt), desc(conversations.createdAt))
    .limit(1)

  return row ?? null
}

function toMessageView(row: {
  message: typeof messages.$inferSelect
  senderName: string | null
}): MessageView {
  return {
    id: row.message.id,
    direction: row.message.direction,
    type: row.message.type as MessageView['type'],
    status: row.message.status,
    body: row.message.body,
    providerMessageId: row.message.providerMessageId,
    senderName: row.senderName,
    errorMessage: row.message.errorMessage,
    providerTimestamp: toIso(row.message.providerTimestamp),
    createdAt: row.message.createdAt.toISOString(),
  }
}

async function loadMessages(
  db: AppDatabase,
  tenantId: string,
  conversationId: string,
): Promise<MessageView[]> {
  const rows = await db
    .select({
      message: messages,
      senderName: users.name,
    })
    .from(messages)
    .leftJoin(users, eq(messages.senderUserId, users.id))
    .where(and(eq(messages.tenantId, tenantId), eq(messages.conversationId, conversationId)))
    .orderBy(desc(messages.createdAt))
    .limit(100)

  return rows.reverse().map(toMessageView)
}

export async function listLeads(
  db: AppDatabase,
  context: LeadAccessContext,
  tenantId: string,
  filters: LeadListFilters,
): Promise<LeadListResponse> {
  const conditions = [eq(leads.tenantId, tenantId)]

  if (context.user.role === 'sdr') {
    conditions.push(eq(leads.ownerUserId, context.user.id))
  }

  if (filters.status) {
    conditions.push(eq(leads.status, filters.status))
  }

  if (filters.search) {
    const pattern = `%${filters.search}%`
    conditions.push(
      or(
        ilike(leads.name, pattern),
        ilike(leads.phoneNormalized, pattern),
        ilike(leads.phoneRaw, pattern),
        ilike(leads.interestProcedure, pattern),
      )!,
    )
  }

  const where = and(...conditions)

  const [totalRow] = await db.select({ total: count() }).from(leads).where(where)

  const rows = await db
    .select({
      lead: leads,
      ownerName: users.name,
    })
    .from(leads)
    .leftJoin(users, eq(leads.ownerUserId, users.id))
    .where(where)
    .orderBy(desc(leads.lastContactAt), desc(leads.createdAt))
    .limit(filters.limit)
    .offset(filters.offset)

  const leadIds = rows.map((row) => row.lead.id)
  const conversationMap = new Map<
    string,
    { unreadCount: number; lastMessagePreview: string | null; lastMessageAt: Date | null }
  >()

  if (leadIds.length > 0) {
    const conversationRows = await db
      .select({
        leadId: conversations.leadId,
        unreadCount: conversations.unreadCount,
        lastMessagePreview: conversations.lastMessagePreview,
        lastMessageAt: conversations.lastMessageAt,
      })
      .from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), inArray(conversations.leadId, leadIds)))
      .orderBy(desc(conversations.lastMessageAt), desc(conversations.createdAt))

    for (const conversation of conversationRows) {
      if (!conversationMap.has(conversation.leadId)) {
        conversationMap.set(conversation.leadId, {
          unreadCount: conversation.unreadCount,
          lastMessagePreview: conversation.lastMessagePreview,
          lastMessageAt: conversation.lastMessageAt,
        })
      }
    }
  }

  const items: LeadListItem[] = rows.map(({ lead, ownerName }) => {
    const conversation = conversationMap.get(lead.id)

    return {
      id: lead.id,
      name: lead.name,
      phone: lead.phoneNormalized,
      status: lead.status,
      source: lead.source,
      ownerUserId: lead.ownerUserId,
      ownerName,
      interestProcedure: lead.interestProcedure,
      consentStatus: lead.consentStatus,
      optOutAt: toIso(lead.optOutAt),
      lastContactAt: toIso(lead.lastContactAt),
      createdAt: lead.createdAt.toISOString(),
      unreadCount: conversation?.unreadCount ?? 0,
      lastMessagePreview: conversation?.lastMessagePreview ?? null,
      lastMessageAt: toIso(conversation?.lastMessageAt),
    }
  })

  return { items, total: Number(totalRow?.total ?? 0) }
}

export async function getLeadDetails(
  db: AppDatabase,
  config: AppConfig,
  context: LeadAccessContext,
  tenantId: string,
  leadId: string,
): Promise<LeadDetailResponse> {
  const row = await findLeadRow(db, tenantId, leadId)

  if (!row || !leadIsVisible(context.user, row.lead.ownerUserId)) {
    throw notFound('Lead não encontrado.')
  }

  const conversationRow = await findConversationRow(db, tenantId, leadId)
  const conversation = conversationRow ? toConversationView(conversationRow) : null
  const messageItems = conversationRow ? await loadMessages(db, tenantId, conversationRow.id) : []

  const windowExpiresAt = conversationRow?.lastInboundAt
    ? new Date(conversationRow.lastInboundAt.getTime() + 24 * 60 * 60 * 1000)
    : null

  return {
    lead: toLeadDetail(row, conversationRow),
    conversation,
    messages: messageItems,
    whatsapp: conversationRow?.accountId
      ? {
          displayPhoneNumber: conversationRow.accountDisplayPhone ?? '',
          status: conversationRow.accountStatus ?? 'disconnected',
          mode: config.whatsappMode,
          windowOpen: windowExpiresAt ? windowExpiresAt.getTime() > Date.now() : false,
          windowExpiresAt: toIso(windowExpiresAt),
        }
      : null,
  }
}

export async function createLead(
  db: AppDatabase,
  context: LeadAccessContext,
  tenantId: string,
  input: CreateLeadInput,
  metadata: AuditMetadata,
): Promise<LeadDetail> {
  const phone = normalizePhone(input.phone)

  if (!isValidPhone(phone)) {
    throw new AppError(422, 'INVALID_PHONE', 'Informe um telefone válido com DDD e país.')
  }

  let ownerUserId = input.ownerUserId ?? null

  if (context.user.role === 'sdr') {
    ownerUserId = context.user.id
  } else if (ownerUserId) {
    await assertOwnerExists(db, tenantId, ownerUserId)
  }

  const [existing] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.phoneNormalized, phone)))
    .limit(1)

  if (existing) {
    throw new AppError(409, 'LEAD_ALREADY_EXISTS', 'Já existe um lead com este telefone.', {
      leadId: existing.id,
    })
  }

  const now = new Date()

  try {
    const [created] = await db
      .insert(leads)
      .values({
        id: randomUUID(),
        tenantId,
        name: input.name,
        phoneNormalized: phone,
        phoneRaw: input.phone,
        source: input.source,
        status: 'new',
        ownerUserId,
        interestProcedure: input.interestProcedure || null,
        objective: input.objective || null,
        bodyRegion: input.bodyRegion || null,
        previousTreatment: input.previousTreatment || null,
        notes: input.notes || null,
        consentStatus: 'unknown',
        consentEvidence: 'Cadastro manual realizado pela equipe',
        lastContactAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (!created) {
      throw new Error('Falha ao criar lead.')
    }

    await recordAudit(db, {
      tenantId,
      actorUserId: context.user.id,
      action: 'lead.created',
      entityType: 'lead',
      entityId: created.id,
      metadata: { phone, source: input.source },
      ip: metadata.ip,
      userAgent: metadata.userAgent,
    })

    const owner = ownerUserId
      ? await db.select({ name: users.name }).from(users).where(eq(users.id, ownerUserId)).limit(1)
      : []

    return toLeadDetail(
      {
        lead: created,
        ownerName: owner[0]?.name ?? null,
      },
      null,
    )
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'LEAD_ALREADY_EXISTS', 'Já existe um lead com este telefone.')
    }

    throw error
  }
}

export async function updateLead(
  db: AppDatabase,
  context: LeadAccessContext,
  tenantId: string,
  leadId: string,
  input: UpdateLeadInput,
  metadata: AuditMetadata,
): Promise<LeadDetail> {
  const row = await findLeadRow(db, tenantId, leadId)

  if (!row || !leadIsVisible(context.user, row.lead.ownerUserId)) {
    throw notFound('Lead não encontrado.')
  }

  if (input.ownerUserId !== undefined && !canManageAssignment(context.user)) {
    throw forbidden('Apenas administradores e gerentes podem alterar o responsável.')
  }

  if (input.ownerUserId) {
    await assertOwnerExists(db, tenantId, input.ownerUserId)
  }

  const now = new Date()
  const values: Partial<typeof leads.$inferInsert> = { updatedAt: now }

  if (input.name !== undefined) values.name = input.name
  if (input.status !== undefined) values.status = input.status
  if (input.ownerUserId !== undefined) values.ownerUserId = input.ownerUserId
  if (input.interestProcedure !== undefined) values.interestProcedure = input.interestProcedure
  if (input.objective !== undefined) values.objective = input.objective
  if (input.bodyRegion !== undefined) values.bodyRegion = input.bodyRegion
  if (input.previousTreatment !== undefined) values.previousTreatment = input.previousTreatment
  if (input.notes !== undefined) values.notes = input.notes
  if (input.consentTextVersion !== undefined) {
    values.consentTextVersion = input.consentTextVersion
  }

  if (input.consentStatus !== undefined) {
    values.consentStatus = input.consentStatus
    values.consentAt = input.consentStatus === 'unknown' ? null : now
    values.consentEvidence =
      input.consentStatus === 'granted'
        ? 'Consentimento registrado manualmente pela equipe'
        : row.lead.consentEvidence
  }

  if (input.status === 'opt_out') {
    values.optOutAt = row.lead.optOutAt ?? now
    values.consentStatus = 'revoked'
    values.consentAt = row.lead.consentAt ?? now
  }

  await db
    .update(leads)
    .set(values)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)))

  await recordAudit(db, {
    tenantId,
    actorUserId: context.user.id,
    action: 'lead.updated',
    entityType: 'lead',
    entityId: leadId,
    metadata: { fields: Object.keys(input) },
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  })

  const updated = await findLeadRow(db, tenantId, leadId)
  const conversation = await findConversationRow(db, tenantId, leadId)

  if (!updated) {
    throw notFound('Lead não encontrado.')
  }

  return toLeadDetail(updated, conversation)
}

export async function markConversationRead(
  db: AppDatabase,
  context: LeadAccessContext,
  tenantId: string,
  leadId: string,
): Promise<void> {
  const row = await findLeadRow(db, tenantId, leadId)

  if (!row || !leadIsVisible(context.user, row.lead.ownerUserId)) {
    throw notFound('Lead não encontrado.')
  }

  await db
    .update(conversations)
    .set({ unreadCount: 0, updatedAt: new Date() })
    .where(and(eq(conversations.tenantId, tenantId), eq(conversations.leadId, leadId)))
}

export async function sendLeadMessage(
  db: AppDatabase,
  config: AppConfig,
  context: LeadAccessContext,
  tenantId: string,
  leadId: string,
  input: SendMessageInput,
  metadata: AuditMetadata,
): Promise<MessageView> {
  if (config.whatsappMode === 'disabled') {
    throw new AppError(
      503,
      'WHATSAPP_DISABLED',
      'O envio pelo WhatsApp está desabilitado neste ambiente.',
    )
  }

  const row = await findLeadRow(db, tenantId, leadId)

  if (!row || !leadIsVisible(context.user, row.lead.ownerUserId)) {
    throw notFound('Lead não encontrado.')
  }

  if (row.lead.optOutAt) {
    throw new AppError(
      409,
      'LEAD_OPT_OUT',
      'Este contato solicitou o descadastramento e não pode receber mensagens.',
    )
  }

  const conversationRow = await findConversationRow(db, tenantId, leadId)

  if (!conversationRow?.accountId) {
    throw new AppError(
      409,
      'NO_WHATSAPP_CONVERSATION',
      'Este lead ainda não possui conversa no WhatsApp.',
    )
  }

  const [account] = await db
    .select()
    .from(whatsappAccounts)
    .where(
      and(
        eq(whatsappAccounts.id, conversationRow.accountId),
        eq(whatsappAccounts.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (!account) {
    throw new AppError(409, 'WHATSAPP_ACCOUNT_NOT_FOUND', 'Número de WhatsApp não configurado.')
  }

  const windowExpiresAt = conversationRow.lastInboundAt
    ? new Date(conversationRow.lastInboundAt.getTime() + 24 * 60 * 60 * 1000)
    : null

  if (!windowExpiresAt || windowExpiresAt.getTime() <= Date.now()) {
    throw new AppError(
      422,
      'OUTSIDE_SERVICE_WINDOW',
      'A janela de 24 horas expirou. Use um template aprovado para retomar o contato.',
    )
  }

  const now = new Date()
  const result = await sendWhatsAppText(config, account, row.lead.phoneNormalized, input.body)

  const [stored] = await db
    .insert(messages)
    .values({
      id: randomUUID(),
      tenantId,
      conversationId: conversationRow.id,
      leadId,
      whatsappAccountId: account.id,
      direction: 'outbound',
      type: 'text',
      status: result.status,
      providerMessageId: result.providerMessageId,
      body: input.body,
      senderUserId: context.user.id,
      errorMessage: result.errorMessage,
      providerTimestamp: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  await db
    .update(conversations)
    .set({
      lastMessagePreview: input.body.slice(0, 240),
      lastMessageAt: now,
      unreadCount: 0,
      humanTakeover: true,
      updatedAt: now,
    })
    .where(eq(conversations.id, conversationRow.id))

  const statusesToHumanService: LeadStatus[] = ['new', 'first_contact', 'qualifying', 'waiting_sdr']

  if (statusesToHumanService.includes(row.lead.status)) {
    await db
      .update(leads)
      .set({ status: 'human_service', updatedAt: now })
      .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)))
  }

  await recordAudit(db, {
    tenantId,
    actorUserId: context.user.id,
    action: result.status === 'sent' ? 'lead.message_sent' : 'lead.message_failed',
    entityType: 'lead',
    entityId: leadId,
    metadata: { messageId: stored?.id, dryRun: result.dryRun, error: result.errorMessage },
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  })

  if (result.status === 'failed' || !stored) {
    throw new AppError(
      502,
      'WHATSAPP_SEND_FAILED',
      result.errorMessage ?? 'Não foi possível enviar a mensagem pelo WhatsApp.',
    )
  }

  return toMessageView({ message: stored, senderName: context.user.name })
}
