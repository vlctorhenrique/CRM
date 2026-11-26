import { listReportsQuerySchema } from '@crm/shared'
import type { FastifyInstance } from 'fastify'
import { parseInput } from '../../lib/validation.js'
import { getAuthContext } from '../../plugins/auth.js'
import { getAppointmentReport, getCadenceReport, getReportsSummary } from './reports.service.js'

export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/reports/summary',
    {
      preHandler: app.authenticate,
      schema: { tags: ['Relatórios'], summary: 'Resumo de indicadores do período' },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const filters = parseInput(listReportsQuerySchema, request.query)
      return reply.send(
        await getReportsSummary(app.db, { user: auth.user }, auth.tenant.id, filters),
      )
    },
  )

  app.get(
    '/v1/reports/cadences',
    {
      preHandler: app.authenticate,
      schema: { tags: ['Relatórios'], summary: 'Desempenho das cadências' },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const filters = parseInput(listReportsQuerySchema, request.query)
      return reply.send(
        await getCadenceReport(app.db, { user: auth.user }, auth.tenant.id, filters),
      )
    },
  )

  app.get(
    '/v1/reports/appointments',
    {
      preHandler: app.authenticate,
      schema: { tags: ['Relatórios'], summary: 'Agendamentos por status' },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const filters = parseInput(listReportsQuerySchema, request.query)
      return reply.send(
        await getAppointmentReport(app.db, { user: auth.user }, auth.tenant.id, filters),
      )
    },
  )
}
