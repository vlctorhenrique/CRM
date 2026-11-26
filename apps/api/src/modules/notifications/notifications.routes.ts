import { listNotificationsQuerySchema, markNotificationsReadSchema } from '@crm/shared'
import type { FastifyInstance } from 'fastify'
import { parseInput } from '../../lib/validation.js'
import { getAuthContext } from '../../plugins/auth.js'
import {
  getUnreadCount,
  listNotifications,
  markNotificationsRead,
} from './notifications.service.js'

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/notifications',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Notificações'],
        summary: 'Lista as notificações do usuário',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const filters = parseInput(listNotificationsQuerySchema, request.query)
      return reply.send(await listNotifications(app.db, auth.tenant.id, auth.user.id, filters))
    },
  )

  app.get(
    '/v1/notifications/unread-count',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Notificações'],
        summary: 'Conta notificações não lidas',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const total = await getUnreadCount(app.db, auth.tenant.id, auth.user.id)
      return reply.send({ unreadCount: total })
    },
  )

  app.post(
    '/v1/notifications/read',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Notificações'],
        summary: 'Marca notificações como lidas',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const input = parseInput(markNotificationsReadSchema, request.body)
      const updated = await markNotificationsRead(app.db, auth.tenant.id, auth.user.id, input)
      return reply.send({ updated })
    },
  )
}
