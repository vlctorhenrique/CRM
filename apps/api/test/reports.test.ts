import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TenantRecord, UserRecord } from '../src/db/schema/index.js'
import { conversations, messages } from '../src/db/schema/index.js'
import {
  createTestContext,
  loginAs,
  seedTenant,
  seedUser,
  seedWhatsAppAccount,
  type TestContext,
} from './helpers.js'

describe('relatórios', () => {
  let context: TestContext
  let tenant: TenantRecord
  let admin: UserRecord
  let sdr: UserRecord
  let adminCookie: string
  let sdrCookie: string

  beforeAll(async () => {
    context = await createTestContext()
    tenant = await seedTenant(context.db, { slug: 'reports-test' })
    admin = await seedUser(context.db, { tenantId: tenant.id, role: 'admin' })
    sdr = await seedUser(context.db, { tenantId: tenant.id, role: 'sdr' })
    adminCookie = (await loginAs(context.app, admin.email)).cookie
    sdrCookie = (await loginAs(context.app, sdr.email)).cookie
    const account = await seedWhatsAppAccount(context.db, { tenantId: tenant.id })

    for (const [name, phone, owner] of [
      ['Admin Lead', '11911110001', admin.id],
      ['SDR Lead', '11911110002', sdr.id],
    ] as const) {
      const lead = await context.app.inject({
        method: 'POST',
        url: '/v1/leads',
        headers: { cookie: adminCookie },
        payload: { name, phone, ownerUserId: owner },
      })
      const leadId = lead.json().lead.id as string
      const conversationId = randomUUID()

      await context.db.insert(conversations).values({
        id: conversationId,
        tenantId: tenant.id,
        leadId,
        whatsappAccountId: account.id,
        status: 'open',
        humanTakeover: false,
        unreadCount: 0,
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
        providerMessageId: `report-${phone}`,
        body: 'Olá',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await context.app.inject({
        method: 'POST',
        url: '/v1/appointments',
        headers: { cookie: adminCookie },
        payload: {
          leadId,
          scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
          ownerUserId: owner,
        },
      })
    }
  })

  afterAll(async () => {
    await context.close()
  })

  it('agrega indicadores por tenant', async () => {
    const summary = await context.app.inject({
      method: 'GET',
      url: '/v1/reports/summary',
      headers: { cookie: adminCookie },
    })
    expect(summary.statusCode).toBe(200)
    expect(summary.json().leads.total).toBe(2)
    expect(summary.json().appointments.total).toBe(2)
    expect(summary.json().messaging.inbound).toBe(2)
    expect(summary.json().period.from).toBeTypeOf('string')
  })

  it('limita dados do SDR aos próprios leads', async () => {
    const summary = await context.app.inject({
      method: 'GET',
      url: '/v1/reports/summary',
      headers: { cookie: sdrCookie },
    })
    expect(summary.json().leads.total).toBe(1)
    expect(summary.json().appointments.total).toBe(1)
    expect(summary.json().messaging.inbound).toBe(1)
  })

  it('expõe relatórios de cadências e agendamentos', async () => {
    const cadences = await context.app.inject({
      method: 'GET',
      url: '/v1/reports/cadences',
      headers: { cookie: adminCookie },
    })
    expect(cadences.statusCode).toBe(200)
    expect(cadences.json().items).toBeInstanceOf(Array)

    const appointments = await context.app.inject({
      method: 'GET',
      url: '/v1/reports/appointments',
      headers: { cookie: adminCookie },
    })
    expect(appointments.statusCode).toBe(200)
    expect(appointments.json().items).toHaveLength(1)
    expect(appointments.json().items[0].total).toBe(2)
  })

  it('reporta indicadores do piloto com isolamento por responsável', async () => {
    const adminReport = await context.app.inject({
      method: 'GET',
      url: '/v1/reports/pilot',
      headers: { cookie: adminCookie },
    })
    expect(adminReport.statusCode).toBe(200)
    expect(adminReport.json().leads).toBe(2)
    expect(adminReport.json().appointments).toBe(2)
    expect(adminReport.json().optOuts).toBe(0)
    expect(adminReport.json().firstResponseMinutes).toBeNull()

    const sdrReport = await context.app.inject({
      method: 'GET',
      url: '/v1/reports/pilot',
      headers: { cookie: sdrCookie },
    })
    expect(sdrReport.json().leads).toBe(1)
    expect(sdrReport.json().appointments).toBe(1)
  })
})
