import {
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  updateAppointmentSchema,
} from '@crm/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parseInput } from '../../lib/validation.js'
import { getAuthContext } from '../../plugins/auth.js'
import {
  createAppointment,
  getAppointment,
  listAppointments,
  updateAppointment,
} from './appointments.service.js'

const appointmentParamsSchema = z.object({
  appointmentId: z.uuid(),
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

export async function registerAppointmentRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/appointments',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Appointments'],
        summary: 'Lista agendamentos visíveis para o usuário',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const filters = parseInput(listAppointmentsQuerySchema, request.query)
      const result = await listAppointments(app.db, { user: auth.user }, auth.tenant.id, filters)
      return reply.send(result)
    },
  )

  app.post(
    '/v1/appointments',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Appointments'],
        summary: 'Cria um agendamento manualmente',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const input = parseInput(createAppointmentSchema, request.body)
      const appointment = await createAppointment(
        app.db,
        { user: auth.user },
        auth.tenant.id,
        input,
        metadataFrom(request),
      )
      return reply.status(201).send({ appointment })
    },
  )

  app.get(
    '/v1/appointments/:appointmentId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Appointments'],
        summary: 'Detalha um agendamento',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { appointmentId } = parseInput(appointmentParamsSchema, request.params)
      const appointment = await getAppointment(
        app.db,
        { user: auth.user },
        auth.tenant.id,
        appointmentId,
      )
      return reply.send({ appointment })
    },
  )

  app.patch(
    '/v1/appointments/:appointmentId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Appointments'],
        summary: 'Atualiza o status ou os dados de um agendamento',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const { appointmentId } = parseInput(appointmentParamsSchema, request.params)
      const input = parseInput(updateAppointmentSchema, request.body)
      const appointment = await updateAppointment(
        app.db,
        { user: auth.user },
        auth.tenant.id,
        appointmentId,
        input,
        metadataFrom(request),
      )
      return reply.send({ appointment })
    },
  )
}
