import { randomUUID } from 'node:crypto'
import type { AuthUser } from '@crm/shared'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TenantRecord, UserRecord } from '../src/db/schema/index.js'
import { conversations, leads, messages, notifications } from '../src/db/schema/index.js'
import { enqueueAiInsight, processAiInsights } from '../src/modules/ai/ai.service.js'
import {
  createTestContext,
  loginAs,
  seedTenant,
  seedUser,
  seedWhatsAppAccount,
  type TestContext,
  testConfig,
} from './helpers.js'

describe('IA assistiva', () => {
  let context: TestContext
  let tenant: TenantRecord
  let admin: UserRecord
  let sdr: UserRecord
  let adminCookie: string
  let sdrCookie: string
  let leadId: string
  let conversationId: string
  let whatsappAccountId: string

  beforeAll(async () => {
    context = await createTestContext()
    tenant = await seedTenant(context.db, { slug: 'ai-test' })
    admin = await seedUser(context.db, { tenantId: tenant.id, role: 'admin' })
    sdr = await seedUser(context.db, { tenantId: tenant.id, role: 'sdr' })
    adminCookie = (await loginAs(context.app, admin.email)).cookie
    sdrCookie = (await loginAs(context.app, sdr.email)).cookie
    const account = await seedWhatsAppAccount(context.db, { tenantId: tenant.id })
    whatsappAccountId = account.id

    const created = await context.app.inject({
      method: 'POST',
      url: '/v1/leads',
      headers: { cookie: adminCookie },
      payload: { name: 'Ana IA', phone: '11922221111', ownerUserId: admin.id },
    })
    leadId = created.json().lead.id as string
    conversationId = randomUUID()

    await context.db.insert(conversations).values({
      id: conversationId,
      tenantId: tenant.id,
      leadId,
      whatsappAccountId: account.id,
      status: 'open',
      humanTakeover: false,
      unreadCount: 0,
      aiEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await context.db.insert(messages).values({
      id: randomUUID(),
      tenantId: tenant.id,
      conversationId,
      leadId,
      whatsappAccountId: account.id,
      direction: 'inbound',
      type: 'text',
      status: 'received',
      providerMessageId: 'ai-inbound-1',
      body: 'Quero botox no rosto, nunca fiz tratamento antes',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  afterAll(async () => {
    await context.close()
  })

  it('enfileira de forma idempotente e processa com fallback', async () => {
    const first = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${leadId}/ai-insights`,
      headers: { cookie: adminCookie },
      payload: { type: 'extraction' },
    })
    expect(first.statusCode).toBe(201)
    expect(first.json().insight.status).toBe('pending')
    const insightId = first.json().insight.id as string

    const second = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${leadId}/ai-insights`,
      headers: { cookie: adminCookie },
      payload: { type: 'extraction' },
    })
    expect(second.json().insight.id).toBe(insightId)

    const run = await processAiInsights(context.db, testConfig())
    expect(run.completed).toBe(1)

    const listed = await context.app.inject({
      method: 'GET',
      url: `/v1/leads/${leadId}/ai-insights`,
      headers: { cookie: adminCookie },
    })
    expect(listed.json().insights).toHaveLength(1)
    expect(listed.json().insights[0].status).toBe('completed')
    expect(listed.json().insights[0].confidence).toBeGreaterThan(0)
    expect(listed.json().insights[0].model).toBe('fallback')
    expect(listed.json().insights[0].result.procedure).toBe('Botox')
    expect(listed.json().insights[0].result.silent).toBe(true)

    const [updatedLead] = await context.db
      .select()
      .from(leads)
      .where(and(eq(leads.tenantId, tenant.id), eq(leads.id, leadId)))
    expect(updatedLead?.interestProcedure).toBe('Botox')
    expect(updatedLead?.bodyRegion).toBe('Facial')
    expect(updatedLead?.previousTreatment).toBe('nao')
  })

  it('notifica a SDR quando a mensagem exige atendimento humano', async () => {
    await context.db.insert(messages).values({
      id: randomUUID(),
      tenantId: tenant.id,
      conversationId,
      leadId,
      whatsappAccountId,
      direction: 'inbound',
      type: 'text',
      status: 'received',
      providerMessageId: 'ai-price-1',
      body: 'Quanto custa o botox?',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const created = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${leadId}/ai-insights`,
      headers: { cookie: adminCookie },
      payload: { type: 'extraction' },
    })
    expect(created.statusCode).toBe(201)
    const insightId = created.json().insight.id as string

    expect((await processAiInsights(context.db, testConfig())).completed).toBe(1)

    const listed = await context.app.inject({
      method: 'GET',
      url: `/v1/leads/${leadId}/ai-insights`,
      headers: { cookie: adminCookie },
    })
    expect(listed.json().insights[0].result.classification).toBe('pricing_question')
    expect(listed.json().insights[0].result.requiresSdr).toBe(true)

    const alerts = await context.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.tenantId, tenant.id), eq(notifications.entityId, insightId)))
    expect(alerts.some((alert) => alert.title === 'Dúvida encaminhada à SDR')).toBe(true)
  })

  it('respeita RBAC e modo desligado', async () => {
    const forbidden = await context.app.inject({
      method: 'PATCH',
      url: `/v1/conversations/${conversationId}/ai`,
      headers: { cookie: sdrCookie },
      payload: { aiEnabled: true },
    })
    expect(forbidden.statusCode).toBe(403)

    const enabled = await context.app.inject({
      method: 'PATCH',
      url: `/v1/conversations/${conversationId}/ai`,
      headers: { cookie: adminCookie },
      payload: { aiEnabled: true },
    })
    expect(enabled.statusCode).toBe(200)
    expect(enabled.json().conversation.aiEnabled).toBe(true)

    const queued = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${leadId}/ai-insights`,
      headers: { cookie: adminCookie },
      payload: { type: 'extraction' },
    })
    expect(queued.statusCode).toBe(201)
    await processAiInsights(context.db, testConfig())
    const active = await context.app.inject({
      method: 'GET',
      url: `/v1/leads/${leadId}/ai-insights`,
      headers: { cookie: adminCookie },
    })
    expect(active.json().insights[0].result.silent).toBe(false)

    await expect(
      enqueueAiInsight(
        context.db,
        {
          user: {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: 'admin',
            status: 'active',
            lastLoginAt: null,
            createdAt: admin.createdAt.toISOString(),
          } satisfies AuthUser,
        },
        tenant.id,
        leadId,
        'summary',
        {
          ...testConfig(),
          aiMode: 'off',
        },
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'AI_DISABLED' })

    const hidden = await context.app.inject({
      method: 'GET',
      url: `/v1/leads/${leadId}/ai-insights`,
      headers: { cookie: sdrCookie },
    })
    expect(hidden.statusCode).toBe(404)

    const unused = await context.db
      .select()
      .from(messages)
      .where(and(eq(messages.tenantId, tenant.id), eq(messages.leadId, leadId)))
    expect(unused.length).toBe(2)
  })
})
