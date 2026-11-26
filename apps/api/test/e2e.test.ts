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

    const claimed = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${leadId}/claim`,
      headers: { cookie },
    })
    expect(claimed.statusCode).toBe(200)
    expect(claimed.json().lead.ownerUserId).toBe(admin.id)

    const appointment = await context.app.inject({
      method: 'POST',
      url: '/v1/appointments',
      headers: { cookie },
      payload: {
        leadId,
        scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        procedure: 'Harmonização facial',
      },
    })
    expect(appointment.statusCode).toBe(201)
    const appointmentId = appointment.json().appointment.id as string

    const appointments = await context.app.inject({
      method: 'GET',
      url: `/v1/appointments?leadId=${leadId}`,
      headers: { cookie },
    })
    expect(appointments.statusCode).toBe(200)
    expect(appointments.json().total).toBe(1)

    const confirmed = await context.app.inject({
      method: 'PATCH',
      url: `/v1/appointments/${appointmentId}`,
      headers: { cookie },
      payload: { status: 'confirmed' },
    })
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json().appointment.status).toBe('confirmed')

    await context.app.inject({
      method: 'PATCH',
      url: `/v1/leads/${leadId}`,
      headers: { cookie },
      payload: { status: 'scheduled' },
    })

    const finalDashboard = await context.app.inject({
      method: 'GET',
      url: '/v1/dashboard/summary',
      headers: { cookie },
    })
    expect(finalDashboard.json().scheduled).toBeGreaterThanOrEqual(1)

    const second = await context.app.inject({
      method: 'POST',
      url: '/v1/dev/simulate-inbound',
      headers: { cookie },
      payload: {
        phone: '11977776666',
        name: 'Bianca E2E',
        text: 'Quero saber sobre preenchimento',
      },
    })
    const secondId = second.json().leadId as string

    const consent = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${secondId}/consent`,
      headers: { cookie },
      payload: { status: 'granted', evidence: 'Contato no simulador', textVersion: 'v1' },
    })
    expect(consent.statusCode).toBe(200)

    const template = await context.app.inject({
      method: 'POST',
      url: '/v1/templates',
      headers: { cookie },
      payload: { name: 'E2E', body: 'Olá {{nome}}, tudo bem?' },
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
      payload: { name: 'E2E Cadence', steps: [{ templateId, delayHours: 24 }] },
    })
    const cadenceId = cadence.json().cadence.id as string
    await context.app.inject({
      method: 'PATCH',
      url: `/v1/cadences/${cadenceId}`,
      headers: { cookie },
      payload: { status: 'active' },
    })

    const enrolled = await context.app.inject({
      method: 'POST',
      url: `/v1/cadences/${cadenceId}/enroll`,
      headers: { cookie },
      payload: { leadId: secondId },
    })
    expect(enrolled.statusCode).toBe(201)

    const enrollments = await context.app.inject({
      method: 'GET',
      url: `/v1/cadence-enrollments?leadId=${secondId}`,
      headers: { cookie },
    })
    expect(enrollments.json().total).toBe(1)

    const notifications = await context.app.inject({
      method: 'GET',
      url: '/v1/notifications',
      headers: { cookie },
    })
    expect(notifications.statusCode).toBe(200)
  })
})
