import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TenantRecord, UserRecord } from '../src/db/schema/index.js'
import {
  cadenceEnrollments,
  cadenceTasks,
  conversations,
  messages,
  tenants,
} from '../src/db/schema/index.js'
import { processCadenceDueTasks } from '../src/modules/cadences/cadence.worker.js'
import {
  createTestContext,
  loginAs,
  seedTenant,
  seedUser,
  seedWhatsAppAccount,
  type TestContext,
  testConfig,
} from './helpers.js'

describe('worker de cadências', () => {
  let context: TestContext
  let tenant: TenantRecord
  let admin: UserRecord
  let cookie: string

  beforeAll(async () => {
    context = await createTestContext()
    tenant = await seedTenant(context.db, { slug: 'cadence-worker' })
    admin = await seedUser(context.db, { tenantId: tenant.id, role: 'admin' })
    cookie = (await loginAs(context.app, admin.email)).cookie

    await context.db
      .update(tenants)
      .set({
        businessHours: {
          days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
            weekday,
            enabled: true,
            start: '00:00',
            end: '23:59',
          })),
          holidays: [],
        },
      })
      .where(eq(tenants.id, tenant.id))

    const account = await seedWhatsAppAccount(context.db, { tenantId: tenant.id })
    const createdLead = await context.app.inject({
      method: 'POST',
      url: '/v1/leads',
      headers: { cookie },
      payload: { name: 'Lead Worker', phone: '11988881111', ownerUserId: admin.id },
    })
    const leadId = createdLead.json().lead.id as string

    await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${leadId}/consent`,
      headers: { cookie },
      payload: { status: 'granted', evidence: 'Contato telefônico', textVersion: 'v1' },
    })

    await context.db.insert(conversations).values({
      id: randomUUID(),
      tenantId: tenant.id,
      leadId,
      whatsappAccountId: account.id,
      status: 'open',
      humanTakeover: false,
      unreadCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const template = await context.app.inject({
      method: 'POST',
      url: '/v1/templates',
      headers: { cookie },
      payload: { name: 'Worker', body: 'Olá {{nome}}, tudo bem na {{clinica}}?' },
    })
    const templateId = template.json().template.id as string
    await context.app.inject({
      method: 'PATCH',
      url: `/v1/templates/${templateId}`,
      headers: { cookie },
      payload: { status: 'approved' },
    })

    const cadence = await context.app.inject({
      method: 'POST',
      url: '/v1/cadences',
      headers: { cookie },
      payload: {
        name: 'Cadência Worker',
        steps: [{ templateId, delayHours: 0 }],
      },
    })
    const cadenceId = cadence.json().cadence.id as string
    await context.app.inject({
      method: 'PATCH',
      url: `/v1/cadences/${cadenceId}`,
      headers: { cookie },
      payload: { status: 'active' },
    })
    await context.app.inject({
      method: 'POST',
      url: `/v1/cadences/${cadenceId}/enroll`,
      headers: { cookie },
      payload: { leadId },
    })
  })

  afterAll(async () => {
    await context.close()
  })

  it('envia tarefa vencida uma única vez e conclui a inscrição', async () => {
    const first = await processCadenceDueTasks(context.db, testConfig())
    expect(first.sent).toBe(1)

    const sentTasks = await context.db
      .select()
      .from(cadenceTasks)
      .where(and(eq(cadenceTasks.tenantId, tenant.id), eq(cadenceTasks.status, 'sent')))
    expect(sentTasks).toHaveLength(1)
    expect(sentTasks[0]?.providerMessageId).toContain('dry-run-')

    const outbound = await context.db
      .select()
      .from(messages)
      .where(and(eq(messages.tenantId, tenant.id), eq(messages.direction, 'outbound')))
    expect(outbound).toHaveLength(1)
    expect(outbound[0]?.body).toContain('Lead Worker')

    const enrollments = await context.db
      .select()
      .from(cadenceEnrollments)
      .where(eq(cadenceEnrollments.tenantId, tenant.id))
    expect(enrollments[0]?.status).toBe('completed')

    const second = await processCadenceDueTasks(context.db, testConfig())
    expect(second.processed).toBe(0)
    expect(second.sent).toBe(0)
  })
})
