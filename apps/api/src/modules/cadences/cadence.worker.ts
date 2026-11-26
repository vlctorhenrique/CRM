import { randomUUID } from 'node:crypto'
import { and, eq, isNull, lt, lte, or } from 'drizzle-orm'
import type { AppConfig } from '../../config/env.js'
import type { AppDatabase } from '../../db/client.js'
import {
  cadenceEnrollments,
  cadenceSteps,
  cadenceTasks,
  conversations,
  leads,
  messages,
  messageTemplates,
  notifications,
  tenants,
  whatsappAccounts,
} from '../../db/schema/index.js'
import { sendWhatsAppText } from '../whatsapp/whatsapp.client.js'
import {
  formatZonedDateKey,
  getZonedDateParts,
  isWithinBusinessHours,
  nextAllowedTime,
} from './business-hours.js'
import { renderTemplate, type TemplateValues } from './template-render.js'

const LOCK_TIMEOUT_MS = 60_000
const BACKOFF_MINUTES = [5, 15, 60]

export interface CadenceRunResult {
  processed: number
  sent: number
  failed: number
}

async function notify(
  db: AppDatabase,
  tenantId: string,
  userId: string | null,
  type: 'cadence_completed' | 'cadence_failed',
  title: string,
  body: string,
  enrollmentId: string,
): Promise<void> {
  if (!userId) {
    return
  }

  await db.insert(notifications).values({
    id: randomUUID(),
    tenantId,
    userId,
    type,
    title,
    body,
    entityType: 'cadence_enrollment',
    entityId: enrollmentId,
    createdAt: new Date(),
  })
}

async function markTaskCancelled(
  db: AppDatabase,
  taskId: string,
  reason: string,
  now: Date,
): Promise<void> {
  await db
    .update(cadenceTasks)
    .set({ status: 'cancelled', error: reason, lockedAt: null, updatedAt: now })
    .where(eq(cadenceTasks.id, taskId))
}

async function advanceEnrollment(
  db: AppDatabase,
  tenantId: string,
  enrollmentId: string,
): Promise<void> {
  const pending = await db
    .select({
      position: cadenceSteps.position,
      scheduledAt: cadenceTasks.scheduledAt,
    })
    .from(cadenceTasks)
    .innerJoin(cadenceSteps, eq(cadenceTasks.stepId, cadenceSteps.id))
    .where(
      and(
        eq(cadenceTasks.tenantId, tenantId),
        eq(cadenceTasks.enrollmentId, enrollmentId),
        eq(cadenceTasks.status, 'pending'),
      ),
    )
    .orderBy(cadenceSteps.position)

  if (pending.length === 0) {
    await db
      .update(cadenceEnrollments)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(cadenceEnrollments.id, enrollmentId))
    return
  }

  await db
    .update(cadenceEnrollments)
    .set({
      currentStep: pending[0]?.position ?? 0,
      nextSendAt: pending[0]?.scheduledAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(cadenceEnrollments.id, enrollmentId))
}

async function failTask(
  db: AppDatabase,
  task: typeof cadenceTasks.$inferSelect,
  message: string,
  attempts: number,
  now: Date,
): Promise<boolean> {
  const final = attempts >= task.maxAttempts
  const backoff = BACKOFF_MINUTES[Math.min(Math.max(attempts - 1, 0), BACKOFF_MINUTES.length - 1)]
  const nextAttemptAt = final ? null : new Date(now.getTime() + (backoff ?? 5) * 60_000)

  await db
    .update(cadenceTasks)
    .set({
      status: final ? 'failed' : 'pending',
      attempts,
      error: message.slice(0, 500),
      lockedAt: null,
      nextAttemptAt,
      updatedAt: now,
    })
    .where(eq(cadenceTasks.id, task.id))

  if (final) {
    await notify(
      db,
      task.tenantId,
      null,
      'cadence_failed',
      'Falha na cadência',
      'Um passo da cadência falhou após todas as tentativas.',
      task.enrollmentId,
    )
  }

  return final
}

export async function processCadenceDueTasks(
  db: AppDatabase,
  config: AppConfig,
  now = new Date(),
): Promise<CadenceRunResult> {
  const result: CadenceRunResult = { processed: 0, sent: 0, failed: 0 }
  const lockBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS)

  const due = await db
    .select()
    .from(cadenceTasks)
    .where(
      and(
        eq(cadenceTasks.status, 'pending'),
        lte(cadenceTasks.scheduledAt, now),
        or(isNull(cadenceTasks.nextAttemptAt), lte(cadenceTasks.nextAttemptAt, now)),
        or(isNull(cadenceTasks.lockedAt), lt(cadenceTasks.lockedAt, lockBefore)),
      ),
    )
    .limit(20)

  for (const task of due) {
    const [locked] = await db
      .update(cadenceTasks)
      .set({ status: 'processing', lockedAt: now, updatedAt: now })
      .where(
        and(
          eq(cadenceTasks.id, task.id),
          eq(cadenceTasks.tenantId, task.tenantId),
          eq(cadenceTasks.status, 'pending'),
        ),
      )
      .returning()

    if (!locked) {
      continue
    }

    result.processed += 1

    const [enrollment] = await db
      .select()
      .from(cadenceEnrollments)
      .where(
        and(
          eq(cadenceEnrollments.id, locked.enrollmentId),
          eq(cadenceEnrollments.tenantId, locked.tenantId),
        ),
      )
      .limit(1)

    if (enrollment?.status !== 'active') {
      await markTaskCancelled(db, locked.id, 'Inscrição não está ativa', now)
      continue
    }

    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, locked.leadId), eq(leads.tenantId, locked.tenantId)))
      .limit(1)

    if (lead?.consentStatus !== 'granted' || lead.optOutAt) {
      await markTaskCancelled(db, locked.id, 'Lead sem consentimento ou com opt-out', now)
      await db
        .update(cadenceEnrollments)
        .set({ status: 'cancelled', cancelReason: 'Lead inelegível', updatedAt: now })
        .where(eq(cadenceEnrollments.id, enrollment.id))
      continue
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, locked.tenantId)).limit(1)
    const [step] = await db
      .select()
      .from(cadenceSteps)
      .where(and(eq(cadenceSteps.id, locked.stepId), eq(cadenceSteps.tenantId, locked.tenantId)))
      .limit(1)
    const [template] = step
      ? await db
          .select()
          .from(messageTemplates)
          .where(
            and(
              eq(messageTemplates.id, step.templateId),
              eq(messageTemplates.tenantId, locked.tenantId),
            ),
          )
          .limit(1)
      : []
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(eq(conversations.tenantId, locked.tenantId), eq(conversations.leadId, locked.leadId)),
      )
      .limit(1)
    const [account] = conversation
      ? await db
          .select()
          .from(whatsappAccounts)
          .where(
            and(
              eq(whatsappAccounts.id, conversation.whatsappAccountId),
              eq(whatsappAccounts.tenantId, locked.tenantId),
            ),
          )
          .limit(1)
      : []

    if (!tenant || !template || !conversation || !account) {
      if (await failTask(db, locked, 'Dados da cadência incompletos', locked.attempts + 1, now)) {
        result.failed += 1
      }
      continue
    }

    if (!isWithinBusinessHours(now, tenant.businessHours, tenant.timezone)) {
      const nextAt = nextAllowedTime(now, tenant.businessHours, tenant.timezone)
      await db
        .update(cadenceTasks)
        .set({ scheduledAt: nextAt, lockedAt: null, updatedAt: now })
        .where(eq(cadenceTasks.id, locked.id))
      continue
    }

    const parts = getZonedDateParts(locked.scheduledAt, tenant.timezone)
    const values: TemplateValues = {
      nome: lead.name ?? 'cliente',
      procedimento: lead.interestProcedure ?? 'tratamento',
      clinica: tenant.name,
      data: formatZonedDateKey(locked.scheduledAt, tenant.timezone),
      horario: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
    }
    const rendered = renderTemplate(template.body, values)

    if (rendered.errors.length > 0) {
      if (await failTask(db, locked, 'Template inválido', locked.attempts + 1, now)) {
        result.failed += 1
      }
      continue
    }

    const sent = await sendWhatsAppText(config, account, lead.phoneNormalized, rendered.text)

    await db.insert(messages).values({
      id: randomUUID(),
      tenantId: locked.tenantId,
      conversationId: conversation.id,
      leadId: lead.id,
      whatsappAccountId: account.id,
      direction: 'outbound',
      type: 'text',
      status: sent.status === 'sent' ? 'sent' : 'failed',
      providerMessageId: sent.providerMessageId,
      body: rendered.text,
      errorMessage: sent.errorMessage,
      providerTimestamp: sent.status === 'sent' ? now : null,
      createdAt: now,
      updatedAt: now,
    })

    if (sent.status === 'sent') {
      await db
        .update(cadenceTasks)
        .set({
          status: 'sent',
          sentAt: now,
          providerMessageId: sent.providerMessageId,
          lockedAt: null,
          error: null,
          updatedAt: now,
        })
        .where(eq(cadenceTasks.id, locked.id))
      result.sent += 1
      await advanceEnrollment(db, locked.tenantId, locked.enrollmentId)
    } else if (
      await failTask(
        db,
        locked,
        sent.errorMessage ?? 'Falha ao enviar mensagem',
        locked.attempts + 1,
        now,
      )
    ) {
      result.failed += 1
    }
  }

  return result
}

export function startCadenceWorker(options: {
  db: AppDatabase
  config: AppConfig
  log: {
    info: (value: object, message: string) => void
    error: (value: object, message: string) => void
  }
}): { stop: () => Promise<void> } {
  if (!options.config.cadenceWorkerEnabled) {
    return { stop: async () => {} }
  }

  let running = false

  const tick = async (): Promise<void> => {
    if (running) {
      return
    }

    running = true

    try {
      const result = await processCadenceDueTasks(options.db, options.config)
      options.log.info(result, 'Worker de cadências concluiu execução')
    } catch (error) {
      options.log.error({ error: String(error) }, 'Falha no worker de cadências')
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => {
    void tick()
  }, options.config.cadenceWorkerIntervalMs)

  return {
    stop: async () => {
      clearInterval(timer)
    },
  }
}
