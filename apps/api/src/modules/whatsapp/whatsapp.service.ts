import { randomUUID } from 'node:crypto'
import type { UpdateWhatsAppAccountInput, WhatsAppAccountView } from '@crm/shared'
import { and, eq } from 'drizzle-orm'
import type { AppConfig } from '../../config/env.js'
import type { AppDatabase } from '../../db/client.js'
import { type WhatsAppAccountRecord, whatsappAccounts } from '../../db/schema/index.js'
import { recordAudit } from '../../lib/audit.js'
import { AppError, notFound } from '../../lib/errors.js'

interface AuditMetadata {
  ip: string | null
  userAgent: string | null
}

function toView(account: WhatsAppAccountRecord, config: AppConfig): WhatsAppAccountView {
  return {
    id: account.id,
    phoneNumberId: account.phoneNumberId,
    wabaId: account.wabaId,
    displayPhoneNumber: account.displayPhoneNumber,
    status: account.status,
    initialMessage: account.initialMessage,
    aiEnabled: account.aiEnabled,
    mode: config.whatsappMode,
    credentialsConfigured: Boolean(config.whatsappAccessToken),
    updatedAt: account.updatedAt.toISOString(),
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  )
}

export async function getWhatsAppAccount(
  db: AppDatabase,
  config: AppConfig,
  tenantId: string,
): Promise<WhatsAppAccountView | null> {
  const [account] = await db
    .select()
    .from(whatsappAccounts)
    .where(eq(whatsappAccounts.tenantId, tenantId))
    .limit(1)

  return account ? toView(account, config) : null
}

export async function updateWhatsAppAccount(
  db: AppDatabase,
  config: AppConfig,
  tenantId: string,
  actorUserId: string,
  input: UpdateWhatsAppAccountInput,
  metadata: AuditMetadata,
): Promise<WhatsAppAccountView> {
  const [account] = await db
    .select()
    .from(whatsappAccounts)
    .where(eq(whatsappAccounts.tenantId, tenantId))
    .limit(1)

  if (!account) {
    throw notFound('Número de WhatsApp não configurado para esta clínica.')
  }

  const values: Partial<typeof whatsappAccounts.$inferInsert> = {
    updatedAt: new Date(),
  }

  if (input.phoneNumberId !== undefined) values.phoneNumberId = input.phoneNumberId
  if (input.wabaId !== undefined) values.wabaId = input.wabaId
  if (input.displayPhoneNumber !== undefined) {
    values.displayPhoneNumber = input.displayPhoneNumber
  }
  if (input.initialMessage !== undefined) values.initialMessage = input.initialMessage
  if (input.aiEnabled !== undefined) values.aiEnabled = input.aiEnabled
  if (input.status !== undefined) values.status = input.status

  try {
    const [updated] = await db
      .update(whatsappAccounts)
      .set(values)
      .where(and(eq(whatsappAccounts.id, account.id), eq(whatsappAccounts.tenantId, tenantId)))
      .returning()

    if (!updated) {
      throw notFound('Número de WhatsApp não configurado para esta clínica.')
    }

    await recordAudit(db, {
      tenantId,
      actorUserId,
      action: 'whatsapp.account_updated',
      entityType: 'whatsapp_account',
      entityId: updated.id,
      metadata: { fields: Object.keys(input) },
      ip: metadata.ip,
      userAgent: metadata.userAgent,
    })

    return toView(updated, config)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        409,
        'PHONE_NUMBER_ID_IN_USE',
        'Este phone number ID já está vinculado a outra clínica.',
      )
    }

    throw error
  }
}

export async function ensureWhatsAppAccount(
  db: AppDatabase,
  tenantId: string,
  input: {
    phoneNumberId: string
    displayPhoneNumber: string
    status?: 'connected' | 'disconnected' | 'error'
    initialMessage: string
  },
): Promise<WhatsAppAccountRecord> {
  const [existing] = await db
    .select()
    .from(whatsappAccounts)
    .where(eq(whatsappAccounts.tenantId, tenantId))
    .limit(1)

  if (existing) {
    return existing
  }

  const now = new Date()
  const [account] = await db
    .insert(whatsappAccounts)
    .values({
      id: randomUUID(),
      tenantId,
      phoneNumberId: input.phoneNumberId,
      displayPhoneNumber: input.displayPhoneNumber,
      status: input.status ?? 'disconnected',
      initialMessage: input.initialMessage,
      aiEnabled: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!account) {
    throw new Error('Falha ao configurar o número de WhatsApp.')
  }

  return account
}
