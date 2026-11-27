import { AI_INSIGHT_TYPES } from '@crm/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parseInput } from '../../lib/validation.js'
import { getAuthContext } from '../../plugins/auth.js'
import { enqueueAiInsight, listAiInsights, setConversationAi } from './ai.service.js'

const leadParamsSchema = z.object({ leadId: z.uuid() })
const conversationParamsSchema = z.object({ conversationId: z.uuid() })
const insightBodySchema = z.object({
  type: z.enum(AI_INSIGHT_TYPES).default('extraction'),
})
const aiToggleSchema = z.object({ aiEnabled: z.boolean() })

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/leads/:leadId/ai-insights',
    {
      preHandler: app.authenticate,
      schema: { tags: ['IA'], summary: 'Lista insights de IA do lead' },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { leadId } = parseInput(leadParamsSchema, request.params)
      return reply.send({
        insights: await listAiInsights(app.db, { user: auth.user }, auth.tenant.id, leadId),
      })
    },
  )

  app.post(
    '/v1/leads/:leadId/ai-insights',
    {
      preHandler: app.authenticate,
      schema: { tags: ['IA'], summary: 'Enfileira análise assistiva de IA' },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { leadId } = parseInput(leadParamsSchema, request.params)
      const { type } = parseInput(insightBodySchema, request.body ?? {})
      const insight = await enqueueAiInsight(
        app.db,
        { user: auth.user },
        auth.tenant.id,
        leadId,
        type,
        app.config,
      )
      return reply.status(201).send({ insight })
    },
  )

  app.patch(
    '/v1/conversations/:conversationId/ai',
    {
      preHandler: app.requireRole(['admin', 'manager']),
      schema: { tags: ['IA'], summary: 'Define IA ativa ou silenciosa na conversa' },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { conversationId } = parseInput(conversationParamsSchema, request.params)
      const { aiEnabled } = parseInput(aiToggleSchema, request.body)
      return reply.send({
        conversation: await setConversationAi(
          app.db,
          { user: auth.user },
          auth.tenant.id,
          conversationId,
          aiEnabled,
        ),
      })
    },
  )
}
