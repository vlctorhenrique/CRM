import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TenantRecord, UserRecord } from '../src/db/schema/index.js'
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
const VERIFY_TOKEN = 'test-verify-token'

interface WebhookMessageInput {
  from: string
  id: string
  text: string
  name?: string
  timestamp?: string
}

function inboundWebhookBody(message: WebhookMessageInput): string {
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
              contacts: [
                {
                  profile: { name: message.name ?? 'Contato Teste' },
                  wa_id: message.from,
                },
              ],
              messages: [
                {
                  from: message.from,
                  id: message.id,
                  timestamp: message.timestamp ?? String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: message.text },
                },
              ],
            },
          },
        ],
      },
    ],
  })
}

function statusWebhookBody(status: {
  id: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
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
              statuses: [
                {
                  id: status.id,
                  status: status.status,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  recipient_id: '5511911112222',
                },
              ],
            },
          },
        ],
      },
    ],
  })
}

describe('leads, conversas e webhook do WhatsApp', () => {
  let ctx: TestContext
  let tenant: TenantRecord
  let admin: UserRecord
  let sdr: UserRecord
  let adminCookie: string
  let sdrCookie: string

  beforeAll(async () => {
    ctx = await createTestContext()
    tenant = await seedTenant(ctx.db, { name: 'Clínica Leads' })
    admin = await seedUser(ctx.db, {
      tenantId: tenant.id,
      email: 'admin-leads@clinica.demo',
      role: 'admin',
    })
    sdr = await seedUser(ctx.db, {
      tenantId: tenant.id,
      email: 'sdr-leads@clinica.demo',
      role: 'sdr',
    })
    await seedWhatsAppAccount(ctx.db, { tenantId: tenant.id })

    const adminLogin = await loginAs(ctx.app, admin.email)
    adminCookie = adminLogin.cookie
    const sdrLogin = await loginAs(ctx.app, sdr.email)
    sdrCookie = sdrLogin.cookie
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('valida a assinatura e o desafio do webhook', async () => {
    const challenge = await ctx.app.inject({
      method: 'GET',
      url: `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=desafio-123`,
    })

    expect(challenge.statusCode).toBe(200)
    expect(challenge.body).toBe('desafio-123')

    const rejected = await ctx.app.inject({
      method: 'GET',
      url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=x',
    })

    expect(rejected.statusCode).toBe(403)

    const unsigned = await ctx.app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: { 'content-type': 'application/json' },
      payload: inboundWebhookBody({
        from: '5511911112222',
        id: 'wamid.unsigned',
        text: 'Oi',
      }),
    })

    expect(unsigned.statusCode).toBe(401)
    expect(unsigned.json().error.code).toBe('INVALID_WEBHOOK_SIGNATURE')
  })

  it('cria o lead uma única vez, registra mensagens e envia o primeiro atendimento', async () => {
    const payload = inboundWebhookBody({
      from: '5511911112222',
      id: 'wamid.message-1',
      text: 'Olá! Gostaria de saber mais sobre lipo de papada.',
      name: 'Ana Teste',
    })

    const first = await ctx.app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signWebhookPayload(payload),
      },
      payload,
    })

    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ received: true, processed: 1, ignored: 0 })

    const duplicate = await ctx.app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signWebhookPayload(payload),
      },
      payload,
    })

    expect(duplicate.statusCode).toBe(200)
    expect(duplicate.json()).toMatchObject({ processed: 0, ignored: 1 })

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/v1/leads',
      headers: { cookie: adminCookie },
    })

    expect(list.statusCode).toBe(200)
    const item = list
      .json()
      .items.find((lead: { phone: string }) => lead.phone === '+5511911112222')
    expect(item).toMatchObject({
      name: 'Ana Teste',
      status: 'first_contact',
      source: 'whatsapp',
      unreadCount: 1,
    })

    const detail = await ctx.app.inject({
      method: 'GET',
      url: `/v1/leads/${item.id}`,
      headers: { cookie: adminCookie },
    })

    expect(detail.statusCode).toBe(200)
    const body = detail.json()
    expect(body.lead.initialMessageSentAt).toBeTruthy()
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0]).toMatchObject({ direction: 'inbound', status: 'received' })
    expect(body.messages[1]).toMatchObject({
      direction: 'outbound',
      status: 'sent',
      body: 'Olá! Qual procedimento despertou seu interesse?',
    })
    expect(body.whatsapp.windowOpen).toBe(true)
  })

  it('atualiza o status da mensagem sem sobrescrever com eventos antigos', async () => {
    const list = await ctx.app.inject({
      method: 'GET',
      url: '/v1/leads?search=5511911112222',
      headers: { cookie: adminCookie },
    })
    const leadId = list.json().items[0].id as string

    const detail = await ctx.app.inject({
      method: 'GET',
      url: `/v1/leads/${leadId}`,
      headers: { cookie: adminCookie },
    })
    const outbound = detail
      .json()
      .messages.find((message: { direction: string }) => message.direction === 'outbound')

    const delivered = statusWebhookBody({ id: outbound.providerMessageId, status: 'delivered' })
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signWebhookPayload(delivered),
      },
      payload: delivered,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ processed: 1 })

    const updated = await ctx.app.inject({
      method: 'GET',
      url: `/v1/leads/${leadId}`,
      headers: { cookie: adminCookie },
    })
    const updatedOutbound = updated
      .json()
      .messages.find((message: { id: string }) => message.id === outbound.id)

    expect(updatedOutbound.status).toBe('delivered')
  })

  it('registra opt-out e bloqueia novos envios', async () => {
    const payload = inboundWebhookBody({
      from: '5511911112222',
      id: 'wamid.message-optout',
      text: 'Por favor, parar de me enviar mensagens.',
    })

    const response = await ctx.app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signWebhookPayload(payload),
      },
      payload,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ processed: 1 })

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/v1/leads?search=5511911112222',
      headers: { cookie: adminCookie },
    })
    const leadId = list.json().items[0].id as string

    const detail = await ctx.app.inject({
      method: 'GET',
      url: `/v1/leads/${leadId}`,
      headers: { cookie: adminCookie },
    })

    expect(detail.json().lead).toMatchObject({
      status: 'opt_out',
      consentStatus: 'revoked',
    })
    expect(detail.json().messages).toHaveLength(3)

    const send = await ctx.app.inject({
      method: 'POST',
      url: `/v1/leads/${leadId}/messages`,
      headers: { cookie: adminCookie },
      payload: { body: 'Tudo bem, entendido.' },
    })

    expect(send.statusCode).toBe(409)
    expect(send.json().error.code).toBe('LEAD_OPT_OUT')
  })

  it('cadastra lead manual com deduplicação e respeita a visibilidade do SDR', async () => {
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/v1/leads',
      headers: { cookie: adminCookie },
      payload: {
        name: 'Bruno Manual',
        phone: '(11) 90000-1111',
        source: 'instagram',
        ownerUserId: sdr.id,
        interestProcedure: 'Criolipólise',
      },
    })

    expect(created.statusCode).toBe(201)
    expect(created.json().lead.phone).toBe('+5511900001111')

    const duplicate = await ctx.app.inject({
      method: 'POST',
      url: '/v1/leads',
      headers: { cookie: adminCookie },
      payload: {
        name: 'Bruno Duplicado',
        phone: '+55 11 90000-1111',
      },
    })

    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json().error.code).toBe('LEAD_ALREADY_EXISTS')

    const sdrList = await ctx.app.inject({
      method: 'GET',
      url: '/v1/leads',
      headers: { cookie: sdrCookie },
    })

    expect(sdrList.statusCode).toBe(200)
    const visible = sdrList.json().items as Array<{ id: string; ownerUserId: string | null }>
    expect(visible.some((item) => item.id === created.json().lead.id)).toBe(true)
    expect(visible.every((item) => item.ownerUserId === null || item.ownerUserId === sdr.id)).toBe(
      true,
    )

    const inboundLead = await ctx.app.inject({
      method: 'GET',
      url: '/v1/leads?search=5511911112222',
      headers: { cookie: adminCookie },
    })
    const otherLeadId = inboundLead.json().items[0].id as string

    await ctx.app.inject({
      method: 'PATCH',
      url: `/v1/leads/${otherLeadId}`,
      headers: { cookie: adminCookie },
      payload: { ownerUserId: admin.id },
    })

    const forbiddenDetail = await ctx.app.inject({
      method: 'GET',
      url: `/v1/leads/${otherLeadId}`,
      headers: { cookie: sdrCookie },
    })

    expect(forbiddenDetail.statusCode).toBe(404)

    const update = await ctx.app.inject({
      method: 'PATCH',
      url: `/v1/leads/${created.json().lead.id}`,
      headers: { cookie: adminCookie },
      payload: { status: 'scheduled', notes: 'Avaliação marcada.' },
    })

    expect(update.statusCode).toBe(200)
    expect(update.json().lead.status).toBe('scheduled')
  })

  it('envia mensagem manual dentro da janela de 24 horas e lista conversas', async () => {
    const inbound = inboundWebhookBody({
      from: '5511922223333',
      id: 'wamid.message-manual',
      text: 'Oi! Quero agendar uma avaliação.',
      name: 'Carla Nova',
    })

    const received = await ctx.app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signWebhookPayload(inbound),
      },
      payload: inbound,
    })

    expect(received.statusCode).toBe(200)

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/v1/leads?search=5511922223333',
      headers: { cookie: adminCookie },
    })
    const leadId = list.json().items[0].id as string

    const send = await ctx.app.inject({
      method: 'POST',
      url: `/v1/leads/${leadId}/messages`,
      headers: { cookie: adminCookie },
      payload: { body: 'Maravilha! Tenho horário amanhã às 10h.' },
    })

    expect(send.statusCode).toBe(201)
    expect(send.json().message).toMatchObject({
      direction: 'outbound',
      body: 'Maravilha! Tenho horário amanhã às 10h.',
    })

    const conversations = await ctx.app.inject({
      method: 'GET',
      url: '/v1/conversations',
      headers: { cookie: adminCookie },
    })

    expect(conversations.statusCode).toBe(200)
    expect(conversations.json().items.length).toBeGreaterThan(0)
    expect(conversations.json().items[0].lastMessagePreview).toContain('Maravilha!')
  })

  it('protege a configuração do WhatsApp e expõe métricas no dashboard', async () => {
    const forbidden = await ctx.app.inject({
      method: 'PATCH',
      url: '/v1/whatsapp/account',
      headers: { cookie: sdrCookie },
      payload: { initialMessage: 'Mensagem alterada pelo SDR' },
    })

    expect(forbidden.statusCode).toBe(403)

    const account = await ctx.app.inject({
      method: 'GET',
      url: '/v1/whatsapp/account',
      headers: { cookie: adminCookie },
    })

    expect(account.statusCode).toBe(200)
    expect(account.json().account).toMatchObject({
      phoneNumberId: PHONE_NUMBER_ID,
      status: 'connected',
      mode: 'dry-run',
    })

    const updated = await ctx.app.inject({
      method: 'PATCH',
      url: '/v1/whatsapp/account',
      headers: { cookie: adminCookie },
      payload: { initialMessage: 'Olá! Como podemos ajudar hoje?' },
    })

    expect(updated.statusCode).toBe(200)
    expect(updated.json().account.initialMessage).toBe('Olá! Como podemos ajudar hoje?')

    const dashboard = await ctx.app.inject({
      method: 'GET',
      url: '/v1/dashboard/summary',
      headers: { cookie: adminCookie },
    })

    expect(dashboard.statusCode).toBe(200)
    expect(dashboard.json()).toMatchObject({
      totalLeads: 3,
      scheduled: 1,
    })
    expect(dashboard.json().messagesSentToday).toBeGreaterThan(0)
  })
})
