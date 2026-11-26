import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TenantRecord, UserRecord } from '../src/db/schema/index.js'
import { cadenceTasks } from '../src/db/schema/index.js'
import {
  createTestContext,
  loginAs,
  seedTenant,
  seedUser,
  seedWhatsAppAccount,
  type TestContext,
} from './helpers.js'

describe('cadências e inscrições', () => {
  let context: TestContext
  let tenant: TenantRecord
  let admin: UserRecord
  let adminCookie: string
  let templateIds: string[]
  let cadenceId: string
  let leadId: string
  let enrollmentId: string

  beforeAll(async () => {
    context = await createTestContext()
    tenant = await seedTenant(context.db, { slug: 'cadences-test' })
    admin = await seedUser(context.db, { tenantId: tenant.id, role: 'admin' })
    await seedWhatsAppAccount(context.db, { tenantId: tenant.id })
    adminCookie = (await loginAs(context.app, admin.email)).cookie

    templateIds = []
    for (const name of ['Cadência 1', 'Cadência 2']) {
      const created = await context.app.inject({
        method: 'POST',
        url: '/v1/templates',
        headers: { cookie: adminCookie },
        payload: { name, body: `Olá {{nome}}, mensagem ${name}` },
      })
      expect(created.statusCode).toBe(201)
      const id = created.json().template.id as string
      templateIds.push(id)
      const approved = await context.app.inject({
        method: 'PATCH',
        url: `/v1/templates/${id}`,
        headers: { cookie: adminCookie },
        payload: { status: 'approved' },
      })
      expect(approved.statusCode).toBe(200)
    }

    const createdLead = await context.app.inject({
      method: 'POST',
      url: '/v1/leads',
      headers: { cookie: adminCookie },
      payload: { name: 'Lead Cadência', phone: '11977777777', ownerUserId: admin.id },
    })
    leadId = createdLead.json().lead.id as string

    const consent = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${leadId}/consent`,
      headers: { cookie: adminCookie },
      payload: { status: 'granted', evidence: 'Contato telefônico', textVersion: 'v1' },
    })
    expect(consent.statusCode).toBe(200)
  })

  afterAll(async () => {
    await context.close()
  })

  it('cria cadência em rascunho e exige templates aprovados', async () => {
    const draftTemplate = await context.app.inject({
      method: 'POST',
      url: '/v1/templates',
      headers: { cookie: adminCookie },
      payload: { name: 'Rascunho', body: 'Olá {{nome}}' },
    })
    const invalid = await context.app.inject({
      method: 'POST',
      url: '/v1/cadences',
      headers: { cookie: adminCookie },
      payload: {
        name: 'Inválida',
        steps: [{ templateId: draftTemplate.json().template.id, delayHours: 0 }],
      },
    })
    expect(invalid.statusCode).toBe(409)
    expect(invalid.json().error.code).toBe('TEMPLATE_NOT_APPROVED')

    const created = await context.app.inject({
      method: 'POST',
      url: '/v1/cadences',
      headers: { cookie: adminCookie },
      payload: {
        name: 'Reengajamento',
        description: 'Dois toques',
        steps: [
          { templateId: templateIds[0], delayHours: 0 },
          { templateId: templateIds[1], delayHours: 24 },
        ],
      },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().cadence.status).toBe('draft')
    expect(created.json().cadence.steps).toHaveLength(2)
    cadenceId = created.json().cadence.id
  })

  it('ativa a cadência e bloqueia edição de passos', async () => {
    const activated = await context.app.inject({
      method: 'PATCH',
      url: `/v1/cadences/${cadenceId}`,
      headers: { cookie: adminCookie },
      payload: { status: 'active' },
    })
    expect(activated.statusCode).toBe(200)
    expect(activated.json().cadence.status).toBe('active')

    const locked = await context.app.inject({
      method: 'PATCH',
      url: `/v1/cadences/${cadenceId}`,
      headers: { cookie: adminCookie },
      payload: { steps: [{ templateId: templateIds[0], delayHours: 2 }] },
    })
    expect(locked.statusCode).toBe(409)
    expect(locked.json().error.code).toBe('CADENCE_STEPS_LOCKED')
  })

  it('inscreve lead elegível, cria tarefas e evita duplicidade', async () => {
    const enrolled = await context.app.inject({
      method: 'POST',
      url: `/v1/cadences/${cadenceId}/enroll`,
      headers: { cookie: adminCookie },
      payload: { leadId },
    })
    expect(enrolled.statusCode).toBe(201)
    expect(enrolled.json().enrollment.status).toBe('active')
    expect(enrolled.json().enrollment.nextSendAt).not.toBeNull()
    enrollmentId = enrolled.json().enrollment.id

    const tasks = await context.db
      .select()
      .from(cadenceTasks)
      .where(and(eq(cadenceTasks.tenantId, tenant.id), eq(cadenceTasks.enrollmentId, enrollmentId)))
    expect(tasks).toHaveLength(2)
    expect(tasks.every((task) => task.status === 'pending')).toBe(true)

    const duplicate = await context.app.inject({
      method: 'POST',
      url: `/v1/cadences/${cadenceId}/enroll`,
      headers: { cookie: adminCookie },
      payload: { leadId },
    })
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json().error.code).toBe('ALREADY_ENROLLED')
  })

  it('bloqueia lead sem consentimento', async () => {
    const createdLead = await context.app.inject({
      method: 'POST',
      url: '/v1/leads',
      headers: { cookie: adminCookie },
      payload: { name: 'Sem Consentimento', phone: '11966666666', ownerUserId: admin.id },
    })
    const refused = await context.app.inject({
      method: 'POST',
      url: `/v1/cadences/${cadenceId}/enroll`,
      headers: { cookie: adminCookie },
      payload: { leadId: createdLead.json().lead.id },
    })
    expect(refused.statusCode).toBe(409)
    expect(refused.json().error.code).toBe('CONSENT_REQUIRED')
  })

  it('pausa, retoma e cancela inscrição', async () => {
    const list = await context.app.inject({
      method: 'GET',
      url: '/v1/cadence-enrollments',
      headers: { cookie: adminCookie },
    })
    expect(list.json().total).toBe(1)

    const paused = await context.app.inject({
      method: 'PATCH',
      url: `/v1/cadence-enrollments/${enrollmentId}`,
      headers: { cookie: adminCookie },
      payload: { status: 'paused', reason: 'Pausado pelo SDR' },
    })
    expect(paused.statusCode).toBe(200)
    expect(paused.json().enrollment.status).toBe('paused')

    const pendingAfterPause = await context.db
      .select()
      .from(cadenceTasks)
      .where(
        and(
          eq(cadenceTasks.tenantId, tenant.id),
          eq(cadenceTasks.enrollmentId, enrollmentId),
          eq(cadenceTasks.status, 'pending'),
        ),
      )
    expect(pendingAfterPause).toHaveLength(0)

    const resumed = await context.app.inject({
      method: 'PATCH',
      url: `/v1/cadence-enrollments/${enrollmentId}`,
      headers: { cookie: adminCookie },
      payload: { status: 'active' },
    })
    expect(resumed.statusCode).toBe(200)
    expect(resumed.json().enrollment.status).toBe('active')

    const cancelled = await context.app.inject({
      method: 'PATCH',
      url: `/v1/cadence-enrollments/${enrollmentId}`,
      headers: { cookie: adminCookie },
      payload: { status: 'cancelled' },
    })
    expect(cancelled.statusCode).toBe(422)

    const validCancel = await context.app.inject({
      method: 'PATCH',
      url: `/v1/cadence-enrollments/${enrollmentId}`,
      headers: { cookie: adminCookie },
      payload: { status: 'cancelled', reason: 'Lead cancelou' },
    })
    expect(validCancel.statusCode).toBe(200)
    expect(validCancel.json().enrollment.status).toBe('cancelled')
  })

  it('retorna 404 para cadência inexistente', async () => {
    const missing = await context.app.inject({
      method: 'GET',
      url: `/v1/cadences/${randomUUID()}`,
      headers: { cookie: adminCookie },
    })
    expect(missing.statusCode).toBe(404)
  })
})
