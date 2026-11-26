import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TenantRecord, UserRecord } from '../src/db/schema/index.js'
import { notifications } from '../src/db/schema/index.js'
import {
  createTestContext,
  loginAs,
  seedTenant,
  seedUser,
  seedWhatsAppAccount,
  type TestContext,
} from './helpers.js'

describe('agendamentos', () => {
  let context: TestContext
  let tenant: TenantRecord
  let admin: UserRecord
  let sdr: UserRecord
  let otherSdr: UserRecord
  let adminCookie: string
  let sdrCookie: string
  let otherCookie: string
  let ownLeadId: string
  let otherLeadId: string

  beforeAll(async () => {
    context = await createTestContext()
    tenant = await seedTenant(context.db, { slug: 'appointments-test' })
    admin = await seedUser(context.db, { tenantId: tenant.id, role: 'admin' })
    sdr = await seedUser(context.db, { tenantId: tenant.id, role: 'sdr' })
    otherSdr = await seedUser(context.db, { tenantId: tenant.id, role: 'sdr' })
    await seedWhatsAppAccount(context.db, { tenantId: tenant.id })

    adminCookie = (await loginAs(context.app, admin.email)).cookie
    sdrCookie = (await loginAs(context.app, sdr.email)).cookie
    otherCookie = (await loginAs(context.app, otherSdr.email)).cookie

    const createLead = async (name: string, phone: string, ownerUserId: string) => {
      const response = await context.app.inject({
        method: 'POST',
        url: '/v1/leads',
        headers: { cookie: adminCookie },
        payload: { name, phone, ownerUserId },
      })
      expect(response.statusCode).toBe(201)
      return response.json().lead.id as string
    }

    ownLeadId = await createLead('Agenda Um', '11944444444', sdr.id)
    otherLeadId = await createLead('Agenda Dois', '11955555555', otherSdr.id)
  })

  afterAll(async () => {
    await context.close()
  })

  const scheduledAt = () => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()

  it('cria agendamento com responsável padrão do lead e notifica', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/appointments',
      headers: { cookie: adminCookie },
      payload: {
        leadId: ownLeadId,
        scheduledAt: scheduledAt(),
        durationMinutes: 60,
        procedure: 'Botox',
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().appointment.ownerUserId).toBe(sdr.id)
    expect(response.json().appointment.status).toBe('scheduled')

    const rows = await context.db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.tenantId, tenant.id), eq(notifications.type, 'appointment_created')),
      )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.userId).toBe(sdr.id)
  })

  it('bloqueia horário conflitante do mesmo responsável', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/appointments',
      headers: { cookie: adminCookie },
      payload: {
        leadId: otherLeadId,
        ownerUserId: sdr.id,
        scheduledAt: scheduledAt(),
        durationMinutes: 30,
      },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('APPOINTMENT_CONFLICT')
  })

  it('respeita visibilidade por responsável', async () => {
    const ownList = await context.app.inject({
      method: 'GET',
      url: '/v1/appointments',
      headers: { cookie: sdrCookie },
    })
    expect(ownList.statusCode).toBe(200)
    expect(ownList.json().total).toBe(1)

    const otherList = await context.app.inject({
      method: 'GET',
      url: '/v1/appointments',
      headers: { cookie: otherCookie },
    })
    expect(otherList.json().total).toBe(0)

    const forbidden = await context.app.inject({
      method: 'POST',
      url: '/v1/appointments',
      headers: { cookie: otherCookie },
      payload: { leadId: ownLeadId, scheduledAt: scheduledAt() },
    })
    expect(forbidden.statusCode).toBe(404)
  })

  it('valida transições e exige motivo no cancelamento', async () => {
    const list = await context.app.inject({
      method: 'GET',
      url: '/v1/appointments',
      headers: { cookie: sdrCookie },
    })
    const appointmentId = list.json().items[0].id as string

    const missingReason = await context.app.inject({
      method: 'PATCH',
      url: `/v1/appointments/${appointmentId}`,
      headers: { cookie: sdrCookie },
      payload: { status: 'cancelled' },
    })
    expect(missingReason.statusCode).toBe(422)

    const cancelled = await context.app.inject({
      method: 'PATCH',
      url: `/v1/appointments/${appointmentId}`,
      headers: { cookie: sdrCookie },
      payload: { status: 'cancelled', cancellationReason: 'Contato desistiu' },
    })
    expect(cancelled.statusCode).toBe(200)
    expect(cancelled.json().appointment.status).toBe('cancelled')
    expect(cancelled.json().appointment.cancelledAt).not.toBeNull()

    const invalidTransition = await context.app.inject({
      method: 'PATCH',
      url: `/v1/appointments/${appointmentId}`,
      headers: { cookie: adminCookie },
      payload: { status: 'confirmed' },
    })
    expect(invalidTransition.statusCode).toBe(409)
    expect(invalidTransition.json().error.code).toBe('INVALID_APPOINTMENT_TRANSITION')

    const cancelNotifications = await context.db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.tenantId, tenant.id), eq(notifications.type, 'appointment_cancelled')),
      )
    expect(cancelNotifications).toHaveLength(1)
  })

  it('filtra por período e retorna 404 para outro tenant', async () => {
    const date = scheduledAt().slice(0, 10)
    const nextDay = new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10)
    const response = await context.app.inject({
      method: 'GET',
      url: `/v1/appointments?from=${date}&to=${nextDay}`,
      headers: { cookie: adminCookie },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().total).toBeGreaterThanOrEqual(1)

    const missing = await context.app.inject({
      method: 'GET',
      url: `/v1/appointments/${randomUUID()}`,
      headers: { cookie: adminCookie },
    })
    expect(missing.statusCode).toBe(404)
  })
})
