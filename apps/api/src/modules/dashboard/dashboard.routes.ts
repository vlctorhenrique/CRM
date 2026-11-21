import type { FastifyInstance } from 'fastify'
import { getAuthContext } from '../../plugins/auth.js'
import { getDashboardSummary } from './dashboard.service.js'

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/dashboard/summary',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Dashboard'],
        summary: 'Resumo comercial do período recente',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const summary = await getDashboardSummary(app.db, auth.user, auth.tenant.id)
      return reply.send(summary)
    },
  )
}
