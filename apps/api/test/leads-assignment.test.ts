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

describe('fila de atribuição e consentimento', () => {
  let context: TestContext
  let tenant: TenantRecord
  let admin: UserRecord
  let sdr: UserRecord
  let otherSdr: UserRecord
  let adminCookie: string
  let sdrCookie: string
  let otherCookie: string

  let unassignedId: string
  let ownId: string
  let otherId: string

  beforeAll(async () => {
    context = await createTestContext()
    tenant = await seedTenant(context.db, { slug: 'leads-assignment' })
    admin = await seedUser(context.db, { tenantId: tenant.id, role: 'admin' })
    sdr = await seedUser(context.db, { tenantId: tenant.id, role: 'sdr' })
    otherSdr = await seedUser(context.db, { tenantId: tenant.id, role: 'sdr' })
    await seedWhatsAppAccount(context.db, { tenantId: tenant.id })

    adminCookie = (await loginAs(context.app, admin.email)).cookie
    sdrCookie = (await loginAs(context.app, sdr.email)).cookie
    otherCookie = (await loginAs(context.app, otherSdr.email)).cookie

    const create = async (name: string, phone: string, ownerUserId: string | null) => {
      const response = await context.app.inject({
        method: 'POST',
        url: '/v1/leads',
        headers: { cookie: adminCookie },
        payload: { name, phone, ownerUserId },
      })
      expect(response.statusCode).toBe(201)
      return response.json().lead.id as string
    }

    unassignedId = await create('Lead Fila', '11911111111', null)
    ownId = await create('Lead Próprio', '11922222222', sdr.id)
    otherId = await create('Lead Alheio', '11933333333', otherSdr.id)
  })

  afterAll(async () => {
    await context.close()
  })

  it('lista próprios leads e não atribuídos para SDR', async () => {
    const all = await context.app.inject({
      method: 'GET',
      url: '/v1/leads',
      headers: { cookie: sdrCookie },
    })
    expect(all.statusCode).toBe(200)
    expect(all.json().total).toBe(2)

    const mine = await context.app.inject({
      method: 'GET',
      url: '/v1/leads?assignment=mine',
      headers: { cookie: sdrCookie },
    })
    expect(mine.json().items.map((item: { id: string }) => item.id)).toEqual([ownId])

    const unassigned = await context.app.inject({
      method: 'GET',
      url: '/v1/leads?assignment=unassigned',
      headers: { cookie: sdrCookie },
    })
    expect(unassigned.json().items.map((item: { id: string }) => item.id)).toEqual([unassignedId])
  })

  it('assume lead não atribuído de forma idempotente e bloqueia dono diferente', async () => {
    const claimed = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${unassignedId}/claim`,
      headers: { cookie: sdrCookie },
    })
    expect(claimed.statusCode).toBe(200)
    expect(claimed.json().lead.ownerUserId).toBe(sdr.id)

    const again = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${unassignedId}/claim`,
      headers: { cookie: sdrCookie },
    })
    expect(again.statusCode).toBe(200)
    expect(again.json().lead.ownerUserId).toBe(sdr.id)

    const conflict = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${unassignedId}/claim`,
      headers: { cookie: otherCookie },
    })
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json().error.code).toBe('LEAD_ALREADY_CLAIMED')
  })

  it('libera lead apenas para administrador ou responsável', async () => {
    const forbidden = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${ownId}/release`,
      headers: { cookie: otherCookie },
    })
    expect(forbidden.statusCode).toBe(404)

    const released = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${ownId}/release`,
      headers: { cookie: adminCookie },
    })
    expect(released.statusCode).toBe(200)
    expect(released.json().lead.ownerUserId).toBeNull()
  })

  it('registra consentimento com evidência e bloqueia envio após revogação', async () => {
    const invalid = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${unassignedId}/consent`,
      headers: { cookie: sdrCookie },
      payload: { status: 'granted', evidence: '', textVersion: 'v1' },
    })
    expect(invalid.statusCode).toBe(422)

    const hidden = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${otherId}/consent`,
      headers: { cookie: sdrCookie },
      payload: { status: 'granted', evidence: 'Contato telefônico', textVersion: 'v1' },
    })
    expect(hidden.statusCode).toBe(404)

    const granted = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${unassignedId}/consent`,
      headers: { cookie: sdrCookie },
      payload: { status: 'granted', evidence: 'Contato telefônico', textVersion: 'v1' },
    })
    expect(granted.statusCode).toBe(200)
    expect(granted.json().lead.consentStatus).toBe('granted')

    const revoked = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${unassignedId}/consent`,
      headers: { cookie: adminCookie },
      payload: { status: 'revoked', evidence: 'Solicitação do contato', textVersion: 'v1' },
    })
    expect(revoked.statusCode).toBe(200)
    expect(revoked.json().lead.consentStatus).toBe('revoked')
    expect(revoked.json().lead.optOutAt).not.toBeNull()

    const blocked = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${unassignedId}/messages`,
      headers: { cookie: adminCookie },
      payload: { body: 'Não deveria enviar' },
    })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().error.code).toBe('LEAD_OPT_OUT')
  })
})
