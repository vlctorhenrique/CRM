import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TenantRecord, UserRecord } from '../src/db/schema/index.js'
import { aiInsights, conversations } from '../src/db/schema/index.js'
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

function body(messageId: string, text: string): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-ai',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '5511900000000',
                phone_number_id: PHONE_NUMBER_ID,
              },
              contacts: [{ profile: { name: 'IA Hook' }, wa_id: '5511944440001' }],
              messages: [
                {
                  from: '5511944440001',
                  id: messageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  })
}

describe('hook de IA no webhook', () => {
  let context: TestContext
  let tenant: TenantRecord
  let admin: UserRecord
  let cookie: string

  const send = async (messageId: string, text: string) => {
    const payload = body(messageId, text)
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

  beforeAll(async () => {
    context = await createTestContext()
    tenant = await seedTenant(context.db, { slug: 'ai-hook' })
    admin = await seedUser(context.db, { tenantId: tenant.id, role: 'admin' })
    cookie = (await loginAs(context.app, admin.email)).cookie
    const account = await seedWhatsAppAccount(context.db, {
      tenantId: tenant.id,
      phoneNumberId: PHONE_NUMBER_ID,
    })
    const created = await context.app.inject({
      method: 'POST',
      url: '/v1/leads',
      headers: { cookie },
      payload: { name: 'IA Hook', phone: '11944440001', ownerUserId: admin.id },
    })
    const leadId = created.json().lead.id as string

    await context.db.insert(conversations).values({
      id: randomUUID(),
      tenantId: tenant.id,
      leadId,
      whatsappAccountId: account.id,
      status: 'open',
      humanTakeover: false,
      unreadCount: 0,
      aiEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  afterAll(async () => {
    await context.close()
  })

  it('enfileira insight para mensagem inbound com IA habilitada', async () => {
    const messageId = randomUUID()
    const response = await send(messageId, 'Quero botox no rosto')
    expect(response.statusCode).toBe(200)

    const insights = await context.db
      .select()
      .from(aiInsights)
      .where(and(eq(aiInsights.tenantId, tenant.id), eq(aiInsights.type, 'extraction')))
    expect(insights).toHaveLength(1)
    expect(insights[0]?.messageId).not.toBeNull()
    expect(insights[0]?.status).toBe('pending')

    const duplicate = await send(messageId, 'Quero botox no rosto')
    expect(duplicate.statusCode).toBe(200)

    const afterDuplicate = await context.db
      .select()
      .from(aiInsights)
      .where(and(eq(aiInsights.tenantId, tenant.id), eq(aiInsights.type, 'extraction')))
    expect(afterDuplicate).toHaveLength(1)
  })

  it('continua enfileirando análise quando a IA está silenciosa', async () => {
    await context.db
      .update(conversations)
      .set({ aiEnabled: false })
      .where(and(eq(conversations.tenantId, tenant.id)))

    const response = await send(randomUUID(), 'Quero botox no rosto, quanto custa?')
    expect(response.statusCode).toBe(200)

    const insights = await context.db
      .select()
      .from(aiInsights)
      .where(and(eq(aiInsights.tenantId, tenant.id), eq(aiInsights.type, 'extraction')))
    expect(insights).toHaveLength(2)
  })
})
