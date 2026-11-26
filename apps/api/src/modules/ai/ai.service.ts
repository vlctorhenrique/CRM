import { randomUUID } from 'node:crypto'
import type { AiInsightType, AiInsightView, AuthUser } from '@crm/shared'
import { and, count, desc, eq, gte, isNull, lte, or } from 'drizzle-orm'
import type { AppConfig } from '../../config/env.js'
import type { AppDatabase } from '../../db/client.js'
import { aiInsights, conversations, leads, messages, notifications } from '../../db/schema/index.js'
import { AppError, notFound } from '../../lib/errors.js'
import { extractLeadInfo } from '../ai/extraction.js'

export interface AiContext {
  user: AuthUser
}

function toView(row: typeof aiInsights.$inferSelect): AiInsightView {
  return {
    id: row.id,
    leadId: row.leadId,
    type: row.type as AiInsightType,
    status: row.status,
    result: row.result ?? null,
    confidence: row.confidence,
    model: row.model,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function canManage(user: AuthUser): boolean {
  return user.role === 'admin' || user.role === 'manager'
}

export async function listAiInsights(
  db: AppDatabase,
  context: AiContext,
  tenantId: string,
  leadId: string,
): Promise<AiInsightView[]> {
  const [lead] = await db
    .select({ ownerUserId: leads.ownerUserId })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)))
    .limit(1)

  if (!lead || (!canManage(context.user) && lead.ownerUserId !== context.user.id)) {
    throw notFound('Lead não encontrado.')
  }

  const rows = await db
    .select()
    .from(aiInsights)
    .where(and(eq(aiInsights.tenantId, tenantId), eq(aiInsights.leadId, leadId)))
    .orderBy(desc(aiInsights.createdAt))
    .limit(50)

  return rows.map(toView)
}

export async function enqueueAiInsight(
  db: AppDatabase,
  context: AiContext,
  tenantId: string,
  leadId: string,
  type: AiInsightType,
  config: AppConfig,
  messageId: string | null = null,
): Promise<AiInsightView> {
  if (config.aiMode === 'off') {
    throw new AppError(409, 'AI_DISABLED', 'A IA está desabilitada neste ambiente.')
  }

  const [lead] = await db
    .select({ ownerUserId: leads.ownerUserId })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)))
    .limit(1)

  if (!lead || (!canManage(context.user) && lead.ownerUserId !== context.user.id)) {
    throw notFound('Lead não encontrado.')
  }

  if (messageId) {
    const [existing] = await db
      .select()
      .from(aiInsights)
      .where(
        and(
          eq(aiInsights.tenantId, tenantId),
          eq(aiInsights.messageId, messageId),
          eq(aiInsights.type, type),
        ),
      )
      .limit(1)

    if (existing) {
      return toView(existing)
    }
  } else {
    const [pending] = await db
      .select()
      .from(aiInsights)
      .where(
        and(
          eq(aiInsights.tenantId, tenantId),
          eq(aiInsights.leadId, leadId),
          eq(aiInsights.type, type),
          isNull(aiInsights.messageId),
        ),
      )
      .orderBy(desc(aiInsights.createdAt))
      .limit(1)

    if (pending && (pending.status === 'pending' || pending.status === 'processing')) {
      return toView(pending)
    }
  }

  const [row] = await db
    .insert(aiInsights)
    .values({
      id: randomUUID(),
      tenantId,
      leadId,
      conversationId: null,
      messageId,
      type,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()

  if (!row) {
    throw new AppError(500, 'AI_INSIGHT_CREATE_FAILED', 'Não foi possível enfileirar a análise.')
  }

  return toView(row)
}

async function fallbackExtraction(text: string) {
  return extractLeadInfo(text)
}

async function llmExtraction(
  config: AppConfig,
  text: string,
): Promise<ReturnType<typeof extractLeadInfo>> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.aiApiKey ?? ''}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.aiModel ?? 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Extraia procedimento, objetivo, região do corpo, tratamento anterior, resumo e confiança (0-1) como JSON.',
        },
        { role: 'user', content: text },
      ],
    }),
    signal: AbortSignal.timeout(config.aiTimeoutMs),
  })

  if (!response.ok) {
    throw new Error(`LLM respondeu ${response.status}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const raw = payload.choices?.[0]?.message?.content
  const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}

  return {
    procedure: typeof parsed.procedure === 'string' ? parsed.procedure : null,
    objective: typeof parsed.objective === 'string' ? parsed.objective : null,
    bodyRegion: typeof parsed.bodyRegion === 'string' ? parsed.bodyRegion : null,
    previousTreatment:
      typeof parsed.previousTreatment === 'boolean' ? parsed.previousTreatment : null,
    summary: typeof parsed.summary === 'string' ? parsed.summary : text.slice(0, 280),
    confidence:
      typeof parsed.confidence === 'number' ? Math.min(Math.max(parsed.confidence, 0), 1) : 0.5,
  }
}

async function notifyOwner(
  db: AppDatabase,
  tenantId: string,
  leadId: string,
  insightId: string,
): Promise<void> {
  const [lead] = await db
    .select({ ownerUserId: leads.ownerUserId })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)))
    .limit(1)

  if (!lead?.ownerUserId) {
    return
  }

  await db.insert(notifications).values({
    id: randomUUID(),
    tenantId,
    userId: lead.ownerUserId,
    type: 'ai_insight',
    title: 'Insight de IA disponível',
    body: 'Uma nova análise assistiva foi concluída para um lead.',
    entityType: 'ai_insight',
    entityId: insightId,
    createdAt: new Date(),
  })
}

export async function processAiInsights(
  db: AppDatabase,
  config: AppConfig,
  now = new Date(),
): Promise<{ processed: number; completed: number; failed: number }> {
  const result = { processed: 0, completed: 0, failed: 0 }

  if (config.aiMode === 'off') {
    return result
  }

  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const [dailyRow] = await db
    .select({ total: count() })
    .from(aiInsights)
    .where(and(eq(aiInsights.status, 'completed'), gte(aiInsights.createdAt, todayStart)))

  if (Number(dailyRow?.total ?? 0) >= config.aiDailyLimit) {
    return result
  }

  const due = await db
    .select()
    .from(aiInsights)
    .where(
      and(
        eq(aiInsights.status, 'pending'),
        or(isNull(aiInsights.nextAttemptAt), lte(aiInsights.nextAttemptAt, now)),
      ),
    )
    .limit(20)

  for (const insight of due) {
    const [locked] = await db
      .update(aiInsights)
      .set({ status: 'processing', attempts: insight.attempts + 1, updatedAt: now })
      .where(and(eq(aiInsights.id, insight.id), eq(aiInsights.status, 'pending')))
      .returning()

    if (!locked) {
      continue
    }

    result.processed += 1

    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, locked.leadId), eq(leads.tenantId, locked.tenantId)))
      .limit(1)
    const [message] = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, locked.tenantId),
          eq(messages.leadId, locked.leadId),
          eq(messages.direction, 'inbound'),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(1)

    if (!lead || !message?.body) {
      await db
        .update(aiInsights)
        .set({ status: 'failed', error: 'Sem mensagem para analisar', updatedAt: now })
        .where(eq(aiInsights.id, locked.id))
      result.failed += 1
      continue
    }

    let extraction: ReturnType<typeof extractLeadInfo>
    let model = 'fallback'
    let errorMessage: string | null = null

    try {
      if (config.aiMode === 'llm' && config.aiApiKey) {
        extraction = await llmExtraction(config, message.body)
        model = config.aiModel ?? 'llm'
      } else {
        extraction = await fallbackExtraction(message.body)
      }
    } catch (error) {
      extraction = await fallbackExtraction(message.body)
      model = 'fallback'
      errorMessage = error instanceof Error ? error.message.slice(0, 500) : 'Falha no LLM'
    }

    await db
      .update(aiInsights)
      .set({
        status: 'completed',
        result: extraction as unknown as Record<string, unknown>,
        confidence: Math.round(extraction.confidence * 100),
        model,
        error: errorMessage,
        updatedAt: now,
      })
      .where(eq(aiInsights.id, locked.id))

    await notifyOwner(db, locked.tenantId, locked.leadId, locked.id)
    result.completed += 1
  }

  return result
}

export async function setConversationAi(
  db: AppDatabase,
  context: AiContext,
  tenantId: string,
  conversationId: string,
  enabled: boolean,
): Promise<{ conversationId: string; aiEnabled: boolean }> {
  if (!canManage(context.user)) {
    throw new AppError(403, 'FORBIDDEN', 'Apenas administradores e gerentes podem alterar IA.')
  }

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)))
    .limit(1)

  if (!conversation) {
    throw notFound('Conversa não encontrada.')
  }

  await db
    .update(conversations)
    .set({ aiEnabled: enabled, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))

  return { conversationId, aiEnabled: enabled }
}
