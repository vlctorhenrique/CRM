import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import type { TenantRecord, UserRecord } from '../src/db/schema/index.js'
import {
  createTestContext,
  loginAs,
  seedTenant,
  seedUser,
  seedWhatsAppAccount,
  type TestContext,
  testConfig,
} from './helpers.js'

describe('simulador de inbound', () => {
  let context: TestContext
  let tenant: TenantRecord
  let user: UserRecord
  let cookie: string

  beforeAll(async () => {
    context = await createTestContext()
    tenant = await seedTenant(context.db, { slug: 'dev-simulator' })
    user = await seedUser(context.db, { tenantId: tenant.id, role: 'admin' })
    await seedWhatsAppAccount(context.db, { tenantId: tenant.id })
    const login = await loginAs(context.app, user.email)
    cookie = login.cookie
  })

  afterAll(async () => {
    await context.close()
  })

  it('cria lead e conversa sem assinatura da Meta', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/dev/simulate-inbound',
      headers: { cookie },
      payload: {
        phone: '(11) 99999-8888',
        name: 'Ana Simulada',
        text: 'Quero saber sobre botox',
      },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.processed).toBe(1)
    expect(body.leadId).toBeTypeOf('string')

    const list = await context.app.inject({
      method: 'GET',
      url: '/v1/leads',
      headers: { cookie },
    })
    expect(list.statusCode).toBe(200)
    const leads = list.json()
    expect(leads.total).toBe(1)
    expect(leads.items[0]).toMatchObject({
      name: 'Ana Simulada',
      phone: '+5511999998888',
      source: 'whatsapp',
      status: 'first_contact',
    })

    const detail = await context.app.inject({
      method: 'GET',
      url: `/v1/leads/${body.leadId}`,
      headers: { cookie },
    })
    expect(detail.statusCode).toBe(200)
    const detailBody = detail.json()
    expect(detailBody.lead.id).toBe(body.leadId)
    expect(detailBody.messages.length).toBeGreaterThanOrEqual(2)
  })

  it('reaproveita o lead em nova mensagem do mesmo telefone', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/dev/simulate-inbound',
      headers: { cookie },
      payload: {
        phone: '+55 11 99999-8888',
        text: 'Ainda quero saber valores',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().processed).toBe(1)

    const list = await context.app.inject({
      method: 'GET',
      url: '/v1/leads',
      headers: { cookie },
    })
    expect(list.json().total).toBe(1)
  })

  it('retorna 404 quando o simulador está desligado', async () => {
    const app = await buildApp({
      config: { ...testConfig(), devSimulatorEnabled: false },
      db: context.db,
      redis: null,
    })
    await app.ready()

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/dev/simulate-inbound',
        headers: { cookie },
        payload: { phone: '11999998888', text: 'teste' },
      })
      expect(response.statusCode).toBe(404)
    } finally {
      await app.close()
    }
  })
})
