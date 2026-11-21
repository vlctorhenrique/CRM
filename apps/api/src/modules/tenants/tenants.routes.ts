import { updateTenantSchema } from '@crm/shared'
import type { FastifyInstance } from 'fastify'
import { parseInput } from '../../lib/validation.js'
import { getAuthContext } from '../../plugins/auth.js'
import { getCurrentTenant, updateCurrentTenant } from './tenants.service.js'

export async function registerTenantRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/tenants/current',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Clínica'],
        summary: 'Retorna a clínica da sessão',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const tenant = await getCurrentTenant(app.db, auth.tenant.id)
      return reply.send({ tenant })
    },
  )

  app.patch(
    '/v1/tenants/current',
    {
      preHandler: app.requireRole(['admin']),
      schema: {
        tags: ['Clínica'],
        summary: 'Atualiza configurações da clínica',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const input = parseInput(updateTenantSchema, request.body)
      const tenant = await updateCurrentTenant(app.db, auth.tenant.id, auth.user.id, input, {
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      })
      return reply.send({ tenant })
    },
  )
}
