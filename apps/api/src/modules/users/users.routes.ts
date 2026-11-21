import { createUserSchema, updateUserSchema } from '@crm/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parseInput } from '../../lib/validation.js'
import { getAuthContext } from '../../plugins/auth.js'
import { createUser, listUsers, updateUser } from './users.service.js'

const userIdParamsSchema = z.object({
  userId: z.uuid(),
})

export async function registerUsersRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/users',
    {
      preHandler: app.requireRole(['admin', 'manager']),
      schema: {
        tags: ['Usuários'],
        summary: 'Lista os usuários da clínica',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const items = await listUsers(app.db, auth.tenant.id)
      return reply.send({ items })
    },
  )

  app.post(
    '/v1/users',
    {
      preHandler: app.requireRole(['admin']),
      schema: {
        tags: ['Usuários'],
        summary: 'Cria um usuário na clínica',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const input = parseInput(createUserSchema, request.body)
      const user = await createUser(app.db, auth.tenant.id, auth.user.id, input, {
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      })
      return reply.status(201).send({ user })
    },
  )

  app.patch(
    '/v1/users/:userId',
    {
      preHandler: app.requireRole(['admin']),
      schema: {
        tags: ['Usuários'],
        summary: 'Atualiza um usuário da clínica',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { userId } = parseInput(userIdParamsSchema, request.params)
      const input = parseInput(updateUserSchema, request.body)
      const user = await updateUser(app.db, auth.tenant.id, auth.user.id, userId, input, {
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      })
      return reply.send({ user })
    },
  )
}
