import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { processAiInsights } from '../src/modules/ai/ai.service.js'
import {
  createTestContext,
  loginAs,
  seedTenant,
  seedUser,
  seedWhatsAppAccount,
  signWebhookPayload,
  type TestContext,
  testConfig,
} from './helpers.js'

const PHONE_NUMBER_ID = 'acceptance-phone-number-id'
const FROM = '5511999990001'

function inboundPayload(messageId: string, body: string): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-acceptance',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+55 11 90000-0000',
                phone_number_id: PHONE_NUMBER_ID,
              },
              contacts: [{ wa_id: FROM, profile: { name: 'Lead Aceitação' } }],
              messages: [
                {
                  id: messageId,
                  from: FROM,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  })
}

describe('critérios de aceitação do MVP', () => {
  let context: TestContext
  let adminCookie: string
  let leadId: string
  let conversationId: string

  const sendInbound = async (messageId: string, body: string) => {
    const payload = inboundPayload(messageId, body)

    return context.app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signWebhookPayload(payload),
      },
      payload,
    })
  }

  const detail = async () => {
    const response = await context.app.inject({
      method: 'GET',
      url: `/v1/leads/${leadId}`,
      headers: { cookie: adminCookie },
    })
    return response.json()
  }

  beforeAll(async () => {
    context = await createTestContext()
    const tenant = await seedTenant(context.db, { slug: 'acceptance-test' })
    const admin = await seedUser(context.db, { tenantId: tenant.id, role: 'admin' })
    adminCookie = (await loginAs(context.app, admin.email)).cookie
    await seedWhatsAppAccount(context.db, {
      tenantId: tenant.id,
      phoneNumberId: PHONE_NUMBER_ID,
    })

    expect(
      (await sendInbound(randomUUID(), 'Quero botox no rosto, nunca fiz tratamento')).statusCode,
    ).toBe(200)
    const created = await context.app.inject({
      method: 'GET',
      url: '/v1/leads?limit=20',
      headers: { cookie: adminCookie },
    })
    const lead = created
      .json()
      .items.find((item: { phone: string }) => item.phone === `+${FROM}`) as
      | { id: string }
      | undefined
    expect(lead).toBeDefined()
    leadId = lead?.id ?? ''
    conversationId = (await detail()).conversation?.id ?? ''
    await processAiInsights(context.db, testConfig())
  })

  afterAll(async () => {
    await context.close()
  })

  it('envia o primeiro atendimento apenas uma vez para o mesmo lead', async () => {
    const second = await sendInbound(randomUUID(), 'Tenho interesse em agendar')
    expect(second.statusCode).toBe(200)

    const data = await detail()
    expect(data.lead.initialMessageSentAt).not.toBeNull()
    expect(
      data.messages.filter((message: { direction: string }) => message.direction === 'outbound'),
    ).toHaveLength(1)
    expect(
      data.messages.filter((message: { direction: string }) => message.direction === 'inbound'),
    ).toHaveLength(2)
  })

  it('registra somente dados informados e mantém a IA silenciosa no atendimento humano', async () => {
    const before = await context.app.inject({
      method: 'GET',
      url: `/v1/leads/${leadId}/ai-insights`,
      headers: { cookie: adminCookie },
    })
    const completed = before
      .json()
      .insights.find(
        (insight: { result: { procedure?: string } | null }) => insight.result?.procedure,
      )
    expect(completed?.result.procedure).toBe('Botox')
    expect(completed?.result.bodyRegion).toBe('Facial')
    expect(completed?.result.previousTreatment).toBe(false)

    const toggled = await context.app.inject({
      method: 'PATCH',
      url: `/v1/conversations/${conversationId}/ai`,
      headers: { cookie: adminCookie },
      payload: { aiEnabled: false },
    })
    expect(toggled.statusCode).toBe(200)

    expect((await sendInbound(randomUUID(), 'Quanto custa?')).statusCode).toBe(200)
    expect((await processAiInsights(context.db, testConfig())).completed).toBeGreaterThan(0)

    const after = await context.app.inject({
      method: 'GET',
      url: `/v1/leads/${leadId}/ai-insights`,
      headers: { cookie: adminCookie },
    })
    const priced = after
      .json()
      .insights.find(
        (insight: { result: { classification?: string } | null }) =>
          insight.result?.classification === 'pricing_question',
      )
    expect(priced?.result.silent).toBe(true)
    expect(priced?.result.requiresSdr).toBe(true)

    const messages = (await detail()).messages as Array<{ direction: string }>
    expect(messages.filter((message) => message.direction === 'outbound')).toHaveLength(1)
  })

  it('não inscreve lead em cadência sem seleção e bloqueia envio após opt-out', async () => {
    const template = await context.app.inject({
      method: 'POST',
      url: '/v1/templates',
      headers: { cookie: adminCookie },
      payload: { name: 'Aceitação', body: 'Olá {{nome}}, tudo bem?' },
    })
    const templateId = template.json().template.id as string
    await context.app.inject({
      method: 'PATCH',
      url: `/v1/templates/${templateId}`,
      headers: { cookie: adminCookie },
      payload: { status: 'approved' },
    })

    const cadence = await context.app.inject({
      method: 'POST',
      url: '/v1/cadences',
      headers: { cookie: adminCookie },
      payload: { name: 'Cadência Aceitação', steps: [{ templateId, delayHours: 0 }] },
    })
    const cadenceId = cadence.json().cadence.id as string
    await context.app.inject({
      method: 'PATCH',
      url: `/v1/cadences/${cadenceId}`,
      headers: { cookie: adminCookie },
      payload: { status: 'active' },
    })

    const consent = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${leadId}/consent`,
      headers: { cookie: adminCookie },
      payload: { status: 'granted', evidence: 'Aceitação no WhatsApp', textVersion: 'v1' },
    })
    expect(consent.statusCode).toBe(200)

    const eligible = await context.app.inject({
      method: 'GET',
      url: '/v1/cadence-eligible-leads',
      headers: { cookie: adminCookie },
    })
    expect(
      eligible
        .json()
        .items.some(
          (item: { leadId: string; eligible: boolean }) => item.leadId === leadId && item.eligible,
        ),
    ).toBe(true)

    const before = await context.app.inject({
      method: 'GET',
      url: `/v1/cadence-enrollments?leadId=${leadId}`,
      headers: { cookie: adminCookie },
    })
    expect(before.json().total).toBe(0)

    const confirmed = await context.app.inject({
      method: 'POST',
      url: `/v1/cadences/${cadenceId}/enroll-batch`,
      headers: { cookie: adminCookie },
      payload: { leadIds: [leadId], preview: false },
    })
    expect(confirmed.json().enrolled).toBe(1)

    const revoked = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${leadId}/consent`,
      headers: { cookie: adminCookie },
      payload: { status: 'revoked', evidence: 'Pedido do titular', textVersion: 'v1' },
    })
    expect(revoked.statusCode).toBe(200)

    const send = await context.app.inject({
      method: 'POST',
      url: `/v1/leads/${leadId}/messages`,
      headers: { cookie: adminCookie },
      payload: { body: 'Mensagem após opt-out' },
    })
    expect(send.statusCode).toBe(409)
    expect(send.json().error.code).toBe('LEAD_OPT_OUT')
  })
})
