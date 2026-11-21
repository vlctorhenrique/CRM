import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { isValidPhone, type MessageStatus, type MessageType, normalizePhone } from '@crm/shared'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { AppConfig } from '../../config/env.js'
import type { AppDatabase } from '../../db/client.js'
import {
  conversations,
  leads,
  messages,
  type WhatsAppAccountRecord,
  webhookEvents,
  whatsappAccounts,
} from '../../db/schema/index.js'
import { recordAudit } from '../../lib/audit.js'
import { AppError } from '../../lib/errors.js'
import { sendWhatsAppText } from './whatsapp.client.js'

const messageSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    timestamp: z.string().regex(/^\d+$/),
    type: z.string().min(1),
    text: z.object({ body: z.string() }).optional(),
    button: z.object({ text: z.string() }).optional(),
    interactive: z
      .object({
        button_reply: z.object({ title: z.string() }).optional(),
        list_reply: z.object({ title: z.string() }).optional(),
      })
      .optional(),
    image: z.object({ caption: z.string().optional() }).optional(),
    video: z.object({ caption: z.string().optional() }).optional(),
    document: z.object({ caption: z.string().optional() }).optional(),
  })
  .passthrough()

const statusSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(['sent', 'delivered', 'read', 'failed']),
    timestamp: z.string().regex(/^\d+$/),
    recipient_id: z.string().optional(),
    errors: z
      .array(
        z
          .object({
            code: z.number().optional(),
            title: z.string().optional(),
            message: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough()

const contactSchema = z
  .object({
    wa_id: z.string().min(1),
    profile: z.object({ name: z.string().optional() }).optional(),
  })
  .passthrough()

const webhookSchema = z
  .object({
    object: z.literal('whatsapp_business_account'),
    entry: z.array(
      z
        .object({
          changes: z.array(
            z
              .object({
                field: z.string(),
                value: z
                  .object({
                    metadata: z
                      .object({
                        display_phone_number: z.string().optional(),
                        phone_number_id: z.string().min(1),
                      })
                      .passthrough(),
                    contacts: z.array(contactSchema).optional(),
                    messages: z.array(messageSchema).optional(),
                    statuses: z.array(statusSchema).optional(),
                  })
                  .passthrough(),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough()

type WebhookPayload = z.infer<typeof webhookSchema>
type WebhookMessage = z.infer<typeof messageSchema>
type WebhookStatus = z.infer<typeof statusSchema>

export interface WebhookProcessResult {
  processed: number
  ignored: number
}

export interface WebhookDeps {
  db: AppDatabase
  config: AppConfig
}

function safeSignatureEquals(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8')
  const receivedBuffer = Buffer.from(received, 'utf8')

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer)
}

export function isValidWebhookSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) {
    return false
  }

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  return safeSignatureEquals(expected, signatureHeader.slice('sha256='.length))
}

function parseProviderDate(timestamp: string): Date {
  const parsed = new Date(Number(timestamp) * 1000)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function extractText(message: WebhookMessage): string | null {
  if (message.text?.body) {
    return message.text.body
  }

  if (message.button?.text) {
    return message.button.text
  }

  const interactiveTitle =
    message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title

  if (interactiveTitle) {
    return interactiveTitle
  }

  return message.image?.caption ?? message.video?.caption ?? message.document?.caption ?? null
}

function resolveMessageType(type: string): MessageType {
  const allowed: MessageType[] = [
    'text',
    'image',
    'audio',
    'video',
    'document',
    'sticker',
    'location',
    'contacts',
    'button',
    'interactive',
    'reaction',
    'other',
  ]

  return allowed.includes(type as MessageType) ? (type as MessageType) : 'other'
}

function messagePreview(text: string | null, type: MessageType): string {
  if (text) {
    return text.slice(0, 240)
  }

  const labels: Partial<Record<MessageType, string>> = {
    image: 'Imagem recebida',
    audio: 'Áudio recebido',
    video: 'Vídeo recebido',
    document: 'Documento recebido',
    sticker: 'Figurinha recebida',
    location: 'Localização recebida',
    contacts: 'Contato recebido',
  }

  return labels[type] ?? 'Mensagem recebida'
}

function normalizedText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function isOptOutMessage(value: string): boolean {
  const text = normalizedText(value)

  const patterns = [
    /\bparar\b/,
    /\bdescadastrar\b/,
    /\bremover da lista\b/,
    /\bsair da lista\b/,
    /\bnao quero (mais )?(receber|mensagens|contato)\b/,
    /\bnao me (mande|envie|contate) mais\b/,
  ]

  return patterns.some((pattern) => pattern.test(text))
}

async function claimEvent(
  db: AppDatabase,
  input: {
    tenantId: string | null
    eventKey: string
    eventType: string
    payload: Record<string, unknown>
  },
): Promise<boolean> {
  const [created] = await db
    .insert(webhookEvents)
    .values({
      id: randomUUID(),
      tenantId: input.tenantId,
      eventKey: input.eventKey,
      eventType: input.eventType,
      status: 'pending',
      payload: input.payload,
      receivedAt: new Date(),
    })
    .onConflictDoNothing({ target: webhookEvents.eventKey })
    .returning({ id: webhookEvents.id })

  if (created) {
    return true
  }

  const [existing] = await db
    .select({ status: webhookEvents.status })
    .from(webhookEvents)
    .where(eq(webhookEvents.eventKey, input.eventKey))
    .limit(1)

  if (existing?.status !== 'failed') {
    return false
  }

  const [reclaimed] = await db
    .update(webhookEvents)
    .set({ status: 'pending', error: null, processedAt: null })
    .where(and(eq(webhookEvents.eventKey, input.eventKey), eq(webhookEvents.status, 'failed')))
    .returning({ id: webhookEvents.id })

  return Boolean(reclaimed)
}

async function finishEvent(
  db: AppDatabase,
  eventKey: string,
  status: 'processed' | 'ignored' | 'failed',
  error: string | null = null,
): Promise<void> {
  await db
    .update(webhookEvents)
    .set({ status, error, processedAt: new Date() })
    .where(eq(webhookEvents.eventKey, eventKey))
}

async function findOrCreateLead(
  db: AppDatabase,
  input: {
    tenantId: string
    name: string | null
    phone: string
    rawPhone: string
    now: Date
    optOut: boolean
  },
) {
  const [existing] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.tenantId, input.tenantId), eq(leads.phoneNormalized, input.phone)))
    .limit(1)

  if (existing) {
    const updates: Partial<typeof leads.$inferInsert> = {
      lastContactAt: input.now,
      updatedAt: input.now,
    }

    if (!existing.name && input.name) {
      updates.name = input.name
    }

    if (input.optOut && !existing.optOutAt) {
      updates.status = 'opt_out'
      updates.consentStatus = 'revoked'
      updates.optOutAt = input.now
    }

    const [updated] = await db
      .update(leads)
      .set(updates)
      .where(and(eq(leads.id, existing.id), eq(leads.tenantId, input.tenantId)))
      .returning()

    return { lead: updated ?? existing, created: false }
  }

  const [created] = await db
    .insert(leads)
    .values({
      id: randomUUID(),
      tenantId: input.tenantId,
      name: input.name,
      phoneNormalized: input.phone,
      phoneRaw: input.rawPhone,
      source: 'whatsapp',
      status: input.optOut ? 'opt_out' : 'first_contact',
      consentStatus: input.optOut ? 'revoked' : 'unknown',
      consentEvidence: 'Contato iniciado pelo cliente no WhatsApp',
      optOutAt: input.optOut ? input.now : null,
      lastContactAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing({ target: [leads.tenantId, leads.phoneNormalized] })
    .returning()

  if (created) {
    return { lead: created, created: true }
  }

  const [raced] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.tenantId, input.tenantId), eq(leads.phoneNormalized, input.phone)))
    .limit(1)

  if (!raced) {
    throw new Error('Não foi possível criar ou localizar o lead.')
  }

  return { lead: raced, created: false }
}

async function findOrCreateConversation(
  db: AppDatabase,
  input: {
    tenantId: string
    leadId: string
    accountId: string
    preview: string
    now: Date
  },
) {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.leadId, input.leadId),
        eq(conversations.whatsappAccountId, input.accountId),
      ),
    )
    .limit(1)

  if (existing) {
    const [updated] = await db
      .update(conversations)
      .set({
        unreadCount: existing.unreadCount + 1,
        lastMessagePreview: input.preview,
        lastMessageAt: input.now,
        lastInboundAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(conversations.id, existing.id))
      .returning()

    return updated ?? existing
  }

  const [created] = await db
    .insert(conversations)
    .values({
      id: randomUUID(),
      tenantId: input.tenantId,
      leadId: input.leadId,
      whatsappAccountId: input.accountId,
      status: 'open',
      humanTakeover: false,
      unreadCount: 1,
      lastMessagePreview: input.preview,
      lastMessageAt: input.now,
      lastInboundAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing({
      target: [conversations.leadId, conversations.whatsappAccountId],
    })
    .returning()

  if (created) {
    return created
  }

  const [raced] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.leadId, input.leadId),
        eq(conversations.whatsappAccountId, input.accountId),
      ),
    )
    .limit(1)

  if (!raced) {
    throw new Error('Não foi possível criar ou localizar a conversa.')
  }

  return raced
}

async function processInboundMessage(
  deps: WebhookDeps,
  account: WhatsAppAccountRecord,
  message: WebhookMessage,
  contactName: string | null,
): Promise<void> {
  const { db, config } = deps
  const [alreadyStored] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.providerMessageId, message.id))
    .limit(1)

  if (alreadyStored) {
    return
  }

  const phone = normalizePhone(message.from)

  if (!isValidPhone(phone)) {
    throw new AppError(400, 'INVALID_WHATSAPP_PHONE', 'Telefone recebido do WhatsApp é inválido.')
  }

  const text = extractText(message)
  const type = resolveMessageType(message.type)
  const preview = messagePreview(text, type)
  const now = new Date()
  const optOut = text ? isOptOutMessage(text) : false
  const { lead, created } = await findOrCreateLead(db, {
    tenantId: account.tenantId,
    name: contactName,
    phone,
    rawPhone: message.from,
    now,
    optOut,
  })

  const conversation = await findOrCreateConversation(db, {
    tenantId: account.tenantId,
    leadId: lead.id,
    accountId: account.id,
    preview,
    now,
  })

  const [stored] = await db
    .insert(messages)
    .values({
      id: randomUUID(),
      tenantId: account.tenantId,
      conversationId: conversation.id,
      leadId: lead.id,
      whatsappAccountId: account.id,
      direction: 'inbound',
      type,
      status: 'received',
      providerMessageId: message.id,
      body: text,
      errorMessage: null,
      providerTimestamp: parseProviderDate(message.timestamp),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: messages.providerMessageId })
    .returning({ id: messages.id })

  if (!stored) {
    return
  }

  if (created) {
    await recordAudit(db, {
      tenantId: account.tenantId,
      actorUserId: null,
      action: 'lead.created_from_whatsapp',
      entityType: 'lead',
      entityId: lead.id,
      metadata: { phone, conversationId: conversation.id },
    })
  }

  if (optOut) {
    await recordAudit(db, {
      tenantId: account.tenantId,
      actorUserId: null,
      action: 'lead.opt_out',
      entityType: 'lead',
      entityId: lead.id,
      metadata: { phone, messageId: message.id },
    })
    return
  }

  if (lead.initialMessageSentAt || config.whatsappMode === 'disabled') {
    return
  }

  const initialMessage = account.initialMessage?.trim() || config.whatsappInitialMessage

  if (!initialMessage) {
    return
  }

  const [claimedLead] = await db
    .update(leads)
    .set({ initialMessageSentAt: now, updatedAt: now })
    .where(and(eq(leads.id, lead.id), isNull(leads.initialMessageSentAt)))
    .returning({ id: leads.id })

  if (!claimedLead) {
    return
  }

  const sendResult = await sendWhatsAppText(config, account, phone, initialMessage)

  await db.insert(messages).values({
    id: randomUUID(),
    tenantId: account.tenantId,
    conversationId: conversation.id,
    leadId: lead.id,
    whatsappAccountId: account.id,
    direction: 'outbound',
    type: 'text',
    status: sendResult.status,
    providerMessageId: sendResult.providerMessageId,
    body: initialMessage,
    senderUserId: null,
    errorMessage: sendResult.errorMessage,
    providerTimestamp: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  await db
    .update(conversations)
    .set({
      lastMessagePreview: initialMessage.slice(0, 240),
      lastMessageAt: new Date(),
      updatedAt: new Date(),
      humanTakeover: false,
    })
    .where(eq(conversations.id, conversation.id))

  await recordAudit(db, {
    tenantId: account.tenantId,
    actorUserId: null,
    action:
      sendResult.status === 'sent' ? 'lead.initial_message_sent' : 'lead.initial_message_failed',
    entityType: 'lead',
    entityId: lead.id,
    metadata: {
      phone,
      dryRun: sendResult.dryRun,
      error: sendResult.errorMessage,
    },
  })
}

function statusRank(status: MessageStatus): number {
  switch (status) {
    case 'pending':
    case 'received':
      return 0
    case 'failed':
      return 1
    case 'sent':
      return 2
    case 'delivered':
      return 3
    case 'read':
      return 4
    default:
      return 0
  }
}

async function processStatusUpdate(
  deps: WebhookDeps,
  account: WhatsAppAccountRecord,
  status: WebhookStatus,
): Promise<boolean> {
  const { db } = deps
  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.tenantId, account.tenantId), eq(messages.providerMessageId, status.id)))
    .limit(1)

  if (!message) {
    return false
  }

  const nextStatus = status.status as MessageStatus

  if (nextStatus !== 'failed' && statusRank(nextStatus) < statusRank(message.status)) {
    return true
  }

  const errorMessage =
    nextStatus === 'failed'
      ? status.errors
          ?.map((error) => [error.title, error.message].filter(Boolean).join(': '))
          .filter(Boolean)
          .join(' | ') || 'A Cloud API informou falha no envio.'
      : null

  await db
    .update(messages)
    .set({
      status: nextStatus,
      errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(messages.id, message.id))

  return true
}

export function parseWebhookPayload(payload: unknown): WebhookPayload {
  const parsed = webhookSchema.safeParse(payload)

  if (!parsed.success) {
    throw new AppError(400, 'INVALID_WEBHOOK_PAYLOAD', 'Payload de webhook inválido.', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }

  return parsed.data
}

export async function processWebhookPayload(
  deps: WebhookDeps,
  payload: WebhookPayload,
): Promise<WebhookProcessResult> {
  const { db } = deps
  let processed = 0
  let ignored = 0

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') {
        continue
      }

      const value = change.value
      const [account] = await db
        .select()
        .from(whatsappAccounts)
        .where(eq(whatsappAccounts.phoneNumberId, value.metadata.phone_number_id))
        .limit(1)

      const contactNames = new Map<string, string>()

      for (const contact of value.contacts ?? []) {
        if (contact.profile?.name) {
          contactNames.set(contact.wa_id, contact.profile.name)
        }
      }

      for (const message of value.messages ?? []) {
        const eventKey = `message:${message.id}`
        const claimed = await claimEvent(db, {
          tenantId: account?.tenantId ?? null,
          eventKey,
          eventType: 'message',
          payload: message,
        })

        if (!claimed) {
          ignored += 1
          continue
        }

        if (!account) {
          await finishEvent(db, eventKey, 'ignored', 'Número do WhatsApp não configurado.')
          ignored += 1
          continue
        }

        try {
          await processInboundMessage(
            deps,
            account,
            message,
            contactNames.get(message.from) ?? null,
          )
          await finishEvent(db, eventKey, 'processed')
          processed += 1
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : 'Falha ao processar mensagem recebida.'
          await finishEvent(db, eventKey, 'failed', messageText)
          throw error
        }
      }

      for (const status of value.statuses ?? []) {
        const eventKey = `status:${status.id}:${status.status}:${status.timestamp}`
        const claimed = await claimEvent(db, {
          tenantId: account?.tenantId ?? null,
          eventKey,
          eventType: 'status',
          payload: status,
        })

        if (!claimed) {
          ignored += 1
          continue
        }

        if (!account) {
          await finishEvent(db, eventKey, 'ignored', 'Número do WhatsApp não configurado.')
          ignored += 1
          continue
        }

        try {
          const found = await processStatusUpdate(deps, account, status)

          await finishEvent(
            db,
            eventKey,
            found ? 'processed' : 'ignored',
            found ? null : 'Mensagem não encontrada para atualização de status.',
          )
          processed += found ? 1 : 0
          ignored += found ? 0 : 1
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : 'Falha ao processar status do WhatsApp.'
          await finishEvent(db, eventKey, 'failed', messageText)
          throw error
        }
      }
    }
  }

  return { processed, ignored }
}
