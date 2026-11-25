import { randomUUID } from 'node:crypto'
import { isValidPhone, normalizePhone } from '@crm/shared'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { leads, whatsappAccounts } from '../../db/schema/index.js'
import { AppError } from '../../lib/errors.js'
import { parseInput } from '../../lib/validation.js'
import { getAuthContext } from '../../plugins/auth.js'
import { processWebhookPayload } from '../whatsapp/webhook.service.js'

const simulateInboundSchema = z.object({
  phone: z.string().trim().min(8).max(24),
  name: z.string().trim().min(1).max(120).optional(),
  text: z.string().trim().min(1).max(4096),
})

export async function registerDevRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/v1/dev/simulate-inbound',
    {
      preHandler: app.authenticate,
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
        },
      },
      schema: {
        tags: ['Desenvolvimento'],
        summary: 'Simula uma mensagem inbound do WhatsApp só em desenvolvimento',
        hide: true,
      },
    },
    async (request, reply) => {
      if (!app.config.devSimulatorEnabled || app.config.env === 'production') {
        throw new AppError(404, 'NOT_FOUND', 'Simulador indisponível.')
      }

      const auth = getAuthContext(request)
      const input = parseInput(simulateInboundSchema, request.body)
      const phone = normalizePhone(input.phone)

      if (!isValidPhone(phone)) {
        throw new AppError(400, 'INVALID_PHONE', 'Telefone inválido.')
      }

      const [account] = await app.db
        .select()
        .from(whatsappAccounts)
        .where(
          and(
            eq(whatsappAccounts.tenantId, auth.tenant.id),
            eq(whatsappAccounts.status, 'connected'),
          ),
        )
        .limit(1)

      if (!account) {
        throw new AppError(
          409,
          'WHATSAPP_NOT_CONFIGURED',
          'Configure uma conta WhatsApp conectada antes de simular.',
        )
      }

      const waId = phone.replace('+', '')
      const payload = {
        object: 'whatsapp_business_account' as const,
        entry: [
          {
            id: account.wabaId ?? 'dev-waba',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: account.displayPhoneNumber,
                    phone_number_id: account.phoneNumberId,
                  },
                  contacts: [
                    {
                      profile: { name: input.name ?? 'Contato Simulado' },
                      wa_id: waId,
                    },
                  ],
                  messages: [
                    {
                      from: waId,
                      id: `wamid.dev-${randomUUID()}`,
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
      }

      const result = await processWebhookPayload({ db: app.db, config: app.config }, payload)

      const [lead] = await app.db
        .select({ id: leads.id })
        .from(leads)
        .where(and(eq(leads.tenantId, auth.tenant.id), eq(leads.phoneNormalized, phone)))
        .limit(1)

      return reply.status(200).send({
        received: true,
        processed: result.processed,
        ignored: result.ignored,
        leadId: lead?.id ?? null,
      })
    },
  )
}
