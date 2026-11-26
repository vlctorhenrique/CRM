import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TenantRecord, UserRecord } from '../src/db/schema/index.js'
import { createTestContext, loginAs, seedTenant, seedUser, type TestContext } from './helpers.js'

describe('templates de mensagem', () => {
  let context: TestContext
  let tenant: TenantRecord
  let admin: UserRecord
  let sdr: UserRecord
  let adminCookie: string
  let sdrCookie: string
  let templateId: string

  beforeAll(async () => {
    context = await createTestContext()
    tenant = await seedTenant(context.db, { slug: 'templates-test' })
    admin = await seedUser(context.db, { tenantId: tenant.id, role: 'admin' })
    sdr = await seedUser(context.db, { tenantId: tenant.id, role: 'sdr' })
    adminCookie = (await loginAs(context.app, admin.email)).cookie
    sdrCookie = (await loginAs(context.app, sdr.email)).cookie
  })

  afterAll(async () => {
    await context.close()
  })

  it('cria rascunho derivando variáveis conhecidas', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/templates',
      headers: { cookie: adminCookie },
      payload: {
        name: 'Boas-vindas',
        body: 'Olá {{nome}}, tudo bem na {{clinica}}?',
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().template.status).toBe('draft')
    expect(response.json().template.variables).toEqual(['nome', 'clinica'])
    templateId = response.json().template.id
  })

  it('rejeita variável desconhecida e nome duplicado', async () => {
    const unknown = await context.app.inject({
      method: 'POST',
      url: '/v1/templates',
      headers: { cookie: adminCookie },
      payload: { name: 'Inválido', body: 'Olá {{diagnostico}}' },
    })
    expect(unknown.statusCode).toBe(422)
    expect(unknown.json().error.code).toBe('UNKNOWN_TEMPLATE_VARIABLE')

    const duplicate = await context.app.inject({
      method: 'POST',
      url: '/v1/templates',
      headers: { cookie: adminCookie },
      payload: { name: 'Boas-vindas', body: 'Olá {{nome}}' },
    })
    expect(duplicate.statusCode).toBe(409)
  })

  it('bloqueia escrita para SDR e permite leitura', async () => {
    const denied = await context.app.inject({
      method: 'POST',
      url: '/v1/templates',
      headers: { cookie: sdrCookie },
      payload: { name: 'SDR', body: 'Olá' },
    })
    expect(denied.statusCode).toBe(403)

    const list = await context.app.inject({
      method: 'GET',
      url: '/v1/templates',
      headers: { cookie: sdrCookie },
    })
    expect(list.statusCode).toBe(200)
    expect(list.json().total).toBeGreaterThanOrEqual(1)
  })

  it('valida transições e trava corpo de template aprovado', async () => {
    const approved = await context.app.inject({
      method: 'PATCH',
      url: `/v1/templates/${templateId}`,
      headers: { cookie: adminCookie },
      payload: { status: 'approved' },
    })
    expect(approved.statusCode).toBe(200)
    expect(approved.json().template.status).toBe('approved')

    const locked = await context.app.inject({
      method: 'PATCH',
      url: `/v1/templates/${templateId}`,
      headers: { cookie: adminCookie },
      payload: { body: 'Olá {{nome}}!' },
    })
    expect(locked.statusCode).toBe(409)
    expect(locked.json().error.code).toBe('APPROVED_TEMPLATE_LOCKED')

    const backToPending = await context.app.inject({
      method: 'PATCH',
      url: `/v1/templates/${templateId}`,
      headers: { cookie: adminCookie },
      payload: { body: 'Oi {{nome}}, tudo bem?', status: 'pending' },
    })
    expect(backToPending.statusCode).toBe(200)
    expect(backToPending.json().template.variables).toEqual(['nome'])

    const invalid = await context.app.inject({
      method: 'PATCH',
      url: `/v1/templates/${templateId}`,
      headers: { cookie: adminCookie },
      payload: { status: 'completed' },
    })
    expect(invalid.statusCode).toBe(422)
  })

  it('filtra por status e retorna 404 para id inexistente', async () => {
    const filtered = await context.app.inject({
      method: 'GET',
      url: '/v1/templates?status=pending&search=Boas',
      headers: { cookie: adminCookie },
    })
    expect(filtered.statusCode).toBe(200)
    expect(filtered.json().total).toBe(1)

    const missing = await context.app.inject({
      method: 'GET',
      url: `/v1/templates/${randomUUID()}`,
      headers: { cookie: adminCookie },
    })
    expect(missing.statusCode).toBe(404)
  })
})
