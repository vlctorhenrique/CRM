import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TenantRecord, UserRecord } from '../src/db/schema/index.js'
import {
  createTestContext,
  loginAs,
  seedTenant,
  seedUser,
  seedWhatsAppAccount,
  type TestContext,
} from './helpers.js'

describe('fluxo headless', () => {
  let context: TestContext
  let tenant: TenantRecord
  let admin: UserRecord
  let cookie: string

  beforeAll(async () => {
    context = await createTestContext()
    tenant = await seedTenant(context.db, { slug: 'e2e-demo' })
    admin = await seedUser(context.db, { tenantId: tenant.id, role: 'admin' })
    await seedWhatsAppAccount(context.db, { tenantId: tenant.id })
    const login = await loginAs(context.app, admin.email)
    cookie = login.cookie
  })

  afterAll(async () => {
    await context.close()
  })

  it('percorre login, inbound, lead, dashboard, configuração e envio manual', async () => {
    const login = await loginAs(context.app, admin.email)
    expect(login.statusCode).toBe(200)
    expect(login.cookie).toContain('crm_access=')

    const simulated = await context.app.inject({
      method: 'POST',
      url: '/v1/dev/simulate-inbound',
      headers: { cookie },
      payload: {
        phone: '11988887777',
        name: 'Marina E2E',
        text: 'Quero harmonização facial',
      },
    })

    expect(simulated.statusCode).toBe(200)
    const leadId = simulated.json().leadId as string
    expect(leadId).toBeTypeOf('string')

    const detail = await context.app.inject({
      method: 'GET',
      url: `/v1/leads/${leadId}`,
      headers: { cookie },
    })
    expect(detail.statusCode).toBe(200)
    expect(detail.json().lead.name).toBe('Marina E2E')
    expect(detail.json().whatsapp.windowOpen).toBe(true)

    const dashboard = await context.app.inject({
      method: 'GET',
      url: '/v1/dashboard/summary',
      headers: { cookie },
    })
    expect(dashboard.statusCode).toBe(200)
    expect(dashboard.json().totalLeads).toBeGreaterThanOrEqual(1)
    expect(dashboard.json().unreadConversations).toBeGreaterThanOrEqual(1)

    const account = await context.app.inject({
      method: 'GET',
      url: '/v1/whatsapp/account',
      headers: { cookie },
    })
    expect(account.statusCode).toBe(200)
    expect(account.json().account.mode).toBe('dry-run')

    const updated = await context.app.inject({
      method: 'PATCH',
      url: `/v1/leads/${leadId}`,
      headers: { cookie },
      payload: { status: 'qualifying' },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json().lead.status).toBe('qualifying')

    const sent = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${leadId}/messages`,
      headers: { cookie },
      payload: { body: 'Olá! Vou te ajudar com a harmonização.' },
    })
    expect(sent.statusCode).toBe(201)
    expect(sent.json().message.status).toBe('sent')
  })
})
