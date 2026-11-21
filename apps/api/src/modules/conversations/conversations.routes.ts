import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parseInput } from '../../lib/validation.js'
import { getAuthContext } from '../../plugins/auth.js'
import { listConversations } from './conversations.service.js'

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export async function registerConversationRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/conversations',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Conversas'],
        summary: 'Lista as conversas visíveis para o usuário',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { limit } = parseInput(listQuerySchema, request.query)
      const result = await listConversations(app.db, auth.user, auth.tenant.id, limit)
      return reply.send(result)
    },
  )
}
