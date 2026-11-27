import {
  CADENCE_ENROLLMENT_STATUSES,
  CADENCE_STATUSES,
  createCadenceSchema,
  updateCadenceEnrollmentSchema,
  updateCadenceSchema,
} from '@crm/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parseInput } from '../../lib/validation.js'
import { getAuthContext } from '../../plugins/auth.js'
import {
  createCadence,
  enrollLead,
  enrollLeadsBatch,
  getCadence,
  listCadences,
  listEligibleLeads,
  listEnrollments,
  updateCadence,
  updateEnrollment,
} from './cadences.service.js'

const enrollBodySchema = z.object({ leadId: z.uuid() })

const cadenceParamsSchema = z.object({ cadenceId: z.uuid() })
const enrollmentParamsSchema = z.object({ enrollmentId: z.uuid() })

const listCadencesQuerySchema = z.object({
  status: z.enum(CADENCE_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const listEnrollmentsQuerySchema = z.object({
  leadId: z.uuid().optional(),
  cadenceId: z.uuid().optional(),
  status: z.enum(CADENCE_ENROLLMENT_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const eligibleQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
})

const batchEnrollBodySchema = z
  .object({
    leadIds: z.array(z.uuid()).min(1).max(100).optional(),
    selectAll: z.boolean().optional(),
    preview: z.boolean().default(true),
  })
  .refine((value) => value.selectAll === true || (value.leadIds?.length ?? 0) > 0, {
    message: 'Informe leadIds ou selectAll.',
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

export async function registerCadenceRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/cadences',
    {
      preHandler: app.authenticate,
      schema: { tags: ['Cadências'], summary: 'Lista cadências da clínica' },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const filters = parseInput(listCadencesQuerySchema, request.query)
      return reply.send(await listCadences(app.db, auth.tenant.id, filters))
    },
  )

  app.post(
    '/v1/cadences',
    {
      preHandler: app.requireRole(['admin', 'manager']),
      schema: { tags: ['Cadências'], summary: 'Cria uma cadência em rascunho' },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const input = parseInput(createCadenceSchema, request.body)
      const cadence = await createCadence(
        app.db,
        { user: auth.user },
        auth.tenant.id,
        input,
        metadataFrom(request),
      )
      return reply.status(201).send({ cadence })
    },
  )

  app.get(
    '/v1/cadences/:cadenceId',
    {
      preHandler: app.authenticate,
      schema: { tags: ['Cadências'], summary: 'Detalha uma cadência' },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { cadenceId } = parseInput(cadenceParamsSchema, request.params)
      return reply.send({ cadence: await getCadence(app.db, auth.tenant.id, cadenceId) })
    },
  )

  app.patch(
    '/v1/cadences/:cadenceId',
    {
      preHandler: app.requireRole(['admin', 'manager']),
      schema: { tags: ['Cadências'], summary: 'Atualiza uma cadência' },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { cadenceId } = parseInput(cadenceParamsSchema, request.params)
      const input = parseInput(updateCadenceSchema, request.body)
      const cadence = await updateCadence(
        app.db,
        { user: auth.user },
        auth.tenant.id,
        cadenceId,
        input,
        metadataFrom(request),
      )
      return reply.send({ cadence })
    },
  )

  app.post(
    '/v1/cadences/:cadenceId/enroll',
    {
      preHandler: app.authenticate,
      schema: { tags: ['Cadências'], summary: 'Inscreve um lead elegível na cadência' },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { cadenceId } = parseInput(cadenceParamsSchema, request.params)
      const { leadId } = parseInput(enrollBodySchema, request.body)
      const enrollment = await enrollLead(
        app.db,
        { user: auth.user },
        auth.tenant.id,
        { leadId, cadenceId },
        app.config.cadenceMaxAttempts,
        metadataFrom(request),
      )
      return reply.status(201).send({ enrollment })
    },
  )

  app.post(
    '/v1/cadences/:cadenceId/enroll-batch',
    {
      preHandler: app.authenticate,
      schema: { tags: ['Cadências'], summary: 'Prévia ou inscrição em lote de leads elegíveis' },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { cadenceId } = parseInput(cadenceParamsSchema, request.params)
      const input = parseInput(batchEnrollBodySchema, request.body)
      const result = await enrollLeadsBatch(
        app.db,
        { user: auth.user },
        auth.tenant.id,
        { ...input, cadenceId },
        app.config.cadenceMaxAttempts,
        metadataFrom(request),
      )
      return reply.send(result)
    },
  )

  app.get(
    '/v1/cadence-eligible-leads',
    {
      preHandler: app.authenticate,
      schema: { tags: ['Cadências'], summary: 'Lista leads elegíveis para seleção' },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const filters = parseInput(eligibleQuerySchema, request.query)
      return reply.send(
        await listEligibleLeads(app.db, { user: auth.user }, auth.tenant.id, filters.limit),
      )
    },
  )

  app.get(
    '/v1/cadence-enrollments',
    {
      preHandler: app.authenticate,
      schema: { tags: ['Cadências'], summary: 'Lista inscrições em cadências' },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const filters = parseInput(listEnrollmentsQuerySchema, request.query)
      return reply.send(await listEnrollments(app.db, { user: auth.user }, auth.tenant.id, filters))
    },
  )

  app.patch(
    '/v1/cadence-enrollments/:enrollmentId',
    {
      preHandler: app.requireRole(['admin', 'manager']),
      schema: { tags: ['Cadências'], summary: 'Pausa, retoma ou cancela uma inscrição' },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { enrollmentId } = parseInput(enrollmentParamsSchema, request.params)
      const input = parseInput(updateCadenceEnrollmentSchema, request.body)
      const enrollment = await updateEnrollment(
        app.db,
        { user: auth.user },
        auth.tenant.id,
        enrollmentId,
        input,
        metadataFrom(request),
      )
      return reply.send({ enrollment })
    },
  )
}
