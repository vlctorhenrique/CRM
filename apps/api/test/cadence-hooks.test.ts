import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TenantRecord, UserRecord } from '../src/db/schema/index.js'
import { cadenceEnrollments, cadenceTasks } from '../src/db/schema/index.js'
import {
  createTestContext,
  loginAs,
  seedTenant,
  seedUser,
  seedWhatsAppAccount,
  signWebhookPayload,
  type TestContext,
} from './helpers.js'

const PHONE_NUMBER_ID = 'test-phone-number-id'

function inboundWebhookBody(input: {
  from: string
  id: string
  text: string
  name: string
}): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-test',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '5511900000000',
                phone_number_id: PHONE_NUMBER_ID,
              },
              contacts: [{ profile: { name: input.name }, wa_id: input.from }],
              messages: [
                {
                  from: input.from,
                  id: input.id,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: input.text },
                },
              ],
            },
          },
        ],
      },
    ],
  })
}

describe('hooks de cadência no webhook', () => {
  let context: TestContext
  let tenant: TenantRecord
  let admin: UserRecord
  let cookie: string
  let cadenceId: string

  const createLeadAndEnroll = async (name: string, phone: string) => {
    const created = await context.app.inject({
      method: 'POST',
      url: '/v1/leads',
      headers: { cookie },
      payload: { name, phone, ownerUserId: admin.id },
    })
    const leadId = created.json().lead.id as string
    await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${leadId}/consent`,
      headers: { cookie },
      payload: { status: 'granted', evidence: 'Contato telefônico', textVersion: 'v1' },
    })
    const enrollment = await context.app.inject({
      method: 'POST',
      url: `/v1/cadences/${cadenceId}/enroll`,
      headers: { cookie },
      payload: { leadId },
    })
    expect(enrollment.statusCode).toBe(201)
    return { leadId, enrollmentId: enrollment.json().enrollment.id as string }
  }

  beforeAll(async () => {
    context = await createTestContext()
    tenant = await seedTenant(context.db, { slug: 'cadence-hooks' })
    admin = await seedUser(context.db, { tenantId: tenant.id, role: 'admin' })
    await seedWhatsAppAccount(context.db, {
      tenantId: tenant.id,
      phoneNumberId: PHONE_NUMBER_ID,
    })
    cookie = (await loginAs(context.app, admin.email)).cookie

    const template = await context.app.inject({
      method: 'POST',
      url: '/v1/templates',
      headers: { cookie },
      payload: { name: 'Hook', body: 'Olá {{nome}}' },
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
      payload: { name: 'Hook Cadence', steps: [{ templateId, delayHours: 24 }] },
    })
    cadenceId = cadence.json().cadence.id as string
    await context.app.inject({
      method: 'PATCH',
      url: `/v1/cadences/${cadenceId}`,
      headers: { cookie },
      payload: { status: 'active' },
    })
  })

  afterAll(async () => {
    await context.close()
  })

  it('cancela inscrição e tarefas quando o lead pede opt-out', async () => {
    const { enrollmentId } = await createLeadAndEnroll('Opt Out', '11933330001')
    const payload = inboundWebhookBody({
      from: '5511933330001',
      id: randomUUID(),
      text: 'PARAR',
      name: 'Opt Out',
    })
    const response = await context.app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signWebhookPayload(payload),
      },
      payload,
    })
    expect(response.statusCode).toBe(200)

    const [enrollment] = await context.db
      .select()
      .from(cadenceEnrollments)
      .where(eq(cadenceEnrollments.id, enrollmentId))
    expect(enrollment?.status).toBe('cancelled')

    const tasks = await context.db
      .select()
      .from(cadenceTasks)
      .where(and(eq(cadenceTasks.tenantId, tenant.id), eq(cadenceTasks.enrollmentId, enrollmentId)))
    expect(tasks.every((task) => task.status === 'cancelled')).toBe(true)
  })

  it('pausa inscrição quando o lead responde', async () => {
    const { enrollmentId } = await createLeadAndEnroll('Resposta', '11933330002')
    const payload = inboundWebhookBody({
      from: '5511933330002',
      id: randomUUID(),
      text: 'Olá, tenho interesse',
      name: 'Resposta',
    })
    const response = await context.app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signWebhookPayload(payload),
      },
      payload,
    })
    expect(response.statusCode).toBe(200)

    const [enrollment] = await context.db
      .select()
      .from(cadenceEnrollments)
      .where(eq(cadenceEnrollments.id, enrollmentId))
    expect(enrollment?.status).toBe('paused')
    expect(enrollment?.pauseReason).toBe('Resposta humana recebida')
  })
})
