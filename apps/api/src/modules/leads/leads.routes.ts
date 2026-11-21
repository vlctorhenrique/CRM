import { createLeadSchema, LEAD_STATUSES, sendMessageSchema, updateLeadSchema } from '@crm/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parseInput } from '../../lib/validation.js'
import { getAuthContext } from '../../plugins/auth.js'
import {
  createLead,
  getLeadDetails,
  listLeads,
  markConversationRead,
  sendLeadMessage,
  updateLead,
} from './leads.service.js'

const leadParamsSchema = z.object({
  leadId: z.uuid(),
})

const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

function metadataFrom(request: {
  ip: string
  headers: Record<string, string | string[] | undefined>
}) {
  const userAgent = request.headers['user-agent']

  return {
    ip: request.ip,
    userAgent: Array.isArray(userAgent) ? (userAgent[0] ?? null) : (userAgent ?? null),
  }
}

export async function registerLeadRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/leads',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Leads'],
        summary: 'Lista os leads visíveis para o usuário',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const filters = parseInput(listQuerySchema, request.query)
      const result = await listLeads(app.db, { user: auth.user }, auth.tenant.id, filters)
      return reply.send(result)
    },
  )

  app.post(
    '/v1/leads',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Leads'],
        summary: 'Cadastra um lead manualmente',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const input = parseInput(createLeadSchema, request.body)
      const lead = await createLead(
        app.db,
        { user: auth.user },
        auth.tenant.id,
        input,
        metadataFrom(request),
      )
      return reply.status(201).send({ lead })
    },
  )

  app.get(
    '/v1/leads/:leadId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Leads'],
        summary: 'Detalha um lead e sua conversa',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { leadId } = parseInput(leadParamsSchema, request.params)
      const result = await getLeadDetails(
        app.db,
        app.config,
        { user: auth.user },
        auth.tenant.id,
        leadId,
      )
      return reply.send(result)
    },
  )

  app.patch(
    '/v1/leads/:leadId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Leads'],
        summary: 'Atualiza dados do lead',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { leadId } = parseInput(leadParamsSchema, request.params)
      const input = parseInput(updateLeadSchema, request.body)
      const lead = await updateLead(
        app.db,
        { user: auth.user },
        auth.tenant.id,
        leadId,
        input,
        metadataFrom(request),
      )
      return reply.send({ lead })
    },
  )

  app.post(
    '/v1/leads/:leadId/read',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Leads'],
        summary: 'Marca a conversa do lead como lida',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { leadId } = parseInput(leadParamsSchema, request.params)
      await markConversationRead(app.db, { user: auth.user }, auth.tenant.id, leadId)
      return reply.status(204).send()
    },
  )

  app.post(
    '/v1/leads/:leadId/messages',
    {
      preHandler: app.authenticate,
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
      schema: {
        tags: ['Leads'],
        summary: 'Envia uma mensagem de texto pelo WhatsApp',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { leadId } = parseInput(leadParamsSchema, request.params)
      const input = parseInput(sendMessageSchema, request.body)
      const message = await sendLeadMessage(
        app.db,
        app.config,
        { user: auth.user },
        auth.tenant.id,
        leadId,
        input,
        metadataFrom(request),
      )
      return reply.status(201).send({ message })
    },
  )
}
