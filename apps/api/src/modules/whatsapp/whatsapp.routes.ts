import { updateWhatsAppAccountSchema } from '@crm/shared'
import type { FastifyInstance } from 'fastify'
import { parseInput } from '../../lib/validation.js'
import { getAuthContext } from '../../plugins/auth.js'
import { getWhatsAppAccount, updateWhatsAppAccount } from './whatsapp.service.js'

export async function registerWhatsAppRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/whatsapp/account',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['WhatsApp'],
        summary: 'Consulta o número de WhatsApp da clínica',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const account = await getWhatsAppAccount(app.db, app.config, auth.tenant.id)
      return reply.send({ account })
    },
  )

  app.patch(
    '/v1/whatsapp/account',
    {
      preHandler: app.requireRole(['admin']),
      schema: {
        tags: ['WhatsApp'],
        summary: 'Atualiza a configuração do número de WhatsApp',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const input = parseInput(updateWhatsAppAccountSchema, request.body)
      const account = await updateWhatsAppAccount(
        app.db,
        app.config,
        auth.tenant.id,
        auth.user.id,
        input,
        {
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      )

      return reply.send({ account })
    },
  )
}
