import { createTemplateSchema, TEMPLATE_STATUSES, updateTemplateSchema } from '@crm/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parseInput } from '../../lib/validation.js'
import { getAuthContext } from '../../plugins/auth.js'
import { createTemplate, getTemplate, listTemplates, updateTemplate } from './templates.service.js'

const templateParamsSchema = z.object({
  templateId: z.uuid(),
})

const listQuerySchema = z.object({
  status: z.enum(TEMPLATE_STATUSES).optional(),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function registerTemplateRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/templates',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Templates'],
        summary: 'Lista os templates de mensagem da clínica',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const filters = parseInput(listQuerySchema, request.query)
      return reply.send(await listTemplates(app.db, auth.tenant.id, filters))
    },
  )

  app.post(
    '/v1/templates',
    {
      preHandler: app.requireRole(['admin', 'manager']),
      schema: {
        tags: ['Templates'],
        summary: 'Cria um template em rascunho',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const input = parseInput(createTemplateSchema, request.body)
      const template = await createTemplate(app.db, { user: auth.user }, auth.tenant.id, input)
      return reply.status(201).send({ template })
    },
  )

  app.get(
    '/v1/templates/:templateId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Templates'],
        summary: 'Detalha um template',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { templateId } = parseInput(templateParamsSchema, request.params)
      return reply.send({ template: await getTemplate(app.db, auth.tenant.id, templateId) })
    },
  )

  app.patch(
    '/v1/templates/:templateId',
    {
      preHandler: app.requireRole(['admin', 'manager']),
      schema: {
        tags: ['Templates'],
        summary: 'Atualiza um template e seu status',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { templateId } = parseInput(templateParamsSchema, request.params)
      const input = parseInput(updateTemplateSchema, request.body)
      const template = await updateTemplate(app.db, auth.tenant.id, templateId, input)
      return reply.send({ template })
    },
  )
}
