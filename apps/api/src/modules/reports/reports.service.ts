import type { AuthUser, ListReportsQuery, ReportsSummary } from '@crm/shared'
import { and, count, eq, gte, lt } from 'drizzle-orm'
import type { AppDatabase } from '../../db/client.js'
import {
  appointments,
  cadenceEnrollments,
  cadenceTasks,
  leads,
  messages,
} from '../../db/schema/index.js'

interface ReportContext {
  user: AuthUser
}

function periodBounds(filters: ListReportsQuery) {
  const from = filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : new Date(0)
  const to = filters.to
    ? new Date(`${filters.to}T00:00:00.000Z`)
    : new Date(Date.now() + 86_400_000)
  return { from, to }
}

function ownerFilter(context: ReportContext, filters: ListReportsQuery): string | undefined {
  return context.user.role === 'sdr' ? context.user.id : filters.ownerUserId
}

export async function getReportsSummary(
  db: AppDatabase,
  context: ReportContext,
  tenantId: string,
  filters: ListReportsQuery,
): Promise<ReportsSummary> {
  const { from, to } = periodBounds(filters)
  const owner = ownerFilter(context, filters)

  const leadConditions = [
    eq(leads.tenantId, tenantId),
    gte(leads.createdAt, from),
    lt(leads.createdAt, to),
  ]
  if (owner) leadConditions.push(eq(leads.ownerUserId, owner))

  const leadRows = await db
    .select({ status: leads.status, total: count() })
    .from(leads)
    .where(and(...leadConditions))
    .groupBy(leads.status)

  const leadCounts = new Map(leadRows.map((row) => [row.status, Number(row.total)]))
  const leadTotal = [...leadCounts.values()].reduce((sum, value) => sum + value, 0)

  const appointmentConditions = [
    eq(appointments.tenantId, tenantId),
    gte(appointments.scheduledAt, from),
    lt(appointments.scheduledAt, to),
  ]
  if (owner) appointmentConditions.push(eq(appointments.ownerUserId, owner))

  const appointmentRows = await db
    .select({ status: appointments.status, total: count() })
    .from(appointments)
    .where(and(...appointmentConditions))
    .groupBy(appointments.status)
  const appointmentCounts = new Map(appointmentRows.map((row) => [row.status, Number(row.total)]))
  const appointmentTotal = [...appointmentCounts.values()].reduce((sum, value) => sum + value, 0)

  const enrollmentRows = await db
    .select({ status: cadenceEnrollments.status, total: count() })
    .from(cadenceEnrollments)
    .where(
      and(
        eq(cadenceEnrollments.tenantId, tenantId),
        gte(cadenceEnrollments.createdAt, from),
        lt(cadenceEnrollments.createdAt, to),
      ),
    )
    .groupBy(cadenceEnrollments.status)
  const enrollmentCounts = new Map(enrollmentRows.map((row) => [row.status, Number(row.total)]))

  const taskRows = await db
    .select({ status: cadenceTasks.status, total: count() })
    .from(cadenceTasks)
    .where(
      and(
        eq(cadenceTasks.tenantId, tenantId),
        gte(cadenceTasks.scheduledAt, from),
        lt(cadenceTasks.scheduledAt, to),
      ),
    )
    .groupBy(cadenceTasks.status)
  const taskCounts = new Map(taskRows.map((row) => [row.status, Number(row.total)]))

  const messageConditions = [
    eq(messages.tenantId, tenantId),
    gte(messages.createdAt, from),
    lt(messages.createdAt, to),
  ]
  if (owner) messageConditions.push(eq(leads.ownerUserId, owner))

  const messageRows = await db
    .select({ direction: messages.direction, status: messages.status, total: count() })
    .from(messages)
    .innerJoin(leads, eq(messages.leadId, leads.id))
    .where(and(...messageConditions))
    .groupBy(messages.direction, messages.status)

  let inbound = 0
  let outbound = 0
  let failedMessages = 0

  for (const row of messageRows) {
    const total = Number(row.total)
    if (row.direction === 'inbound') inbound += total
    if (row.direction === 'outbound') outbound += total
    if (row.status === 'failed') failedMessages += total
  }

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    leads: {
      total: leadTotal,
      new: leadCounts.get('new') ?? 0,
      scheduled: leadCounts.get('scheduled') ?? 0,
      lost: leadCounts.get('lost') ?? 0,
      optOut: leadCounts.get('opt_out') ?? 0,
    },
    appointments: {
      total: appointmentTotal,
      scheduled: appointmentCounts.get('scheduled') ?? 0,
      completed: appointmentCounts.get('completed') ?? 0,
      cancelled: appointmentCounts.get('cancelled') ?? 0,
      noShow: appointmentCounts.get('no_show') ?? 0,
      conversionRate:
        leadTotal > 0
          ? Math.round(((appointmentCounts.get('scheduled') ?? 0) / leadTotal) * 1000) / 10
          : 0,
    },
    cadences: {
      activeEnrollments: enrollmentCounts.get('active') ?? 0,
      completedEnrollments: enrollmentCounts.get('completed') ?? 0,
      failedEnrollments: enrollmentCounts.get('failed') ?? 0,
      tasksSent: taskCounts.get('sent') ?? 0,
      tasksFailed: taskCounts.get('failed') ?? 0,
    },
    messaging: { inbound, outbound, failed: failedMessages },
  }
}

export async function getCadenceReport(
  db: AppDatabase,
  context: ReportContext,
  tenantId: string,
  filters: ListReportsQuery,
): Promise<{
  items: Array<{ cadenceId: string; enrollments: number; tasksSent: number; tasksFailed: number }>
}> {
  const { from, to } = periodBounds(filters)
  void context

  const enrollments = await db
    .select({ cadenceId: cadenceEnrollments.cadenceId, total: count() })
    .from(cadenceEnrollments)
    .where(
      and(
        eq(cadenceEnrollments.tenantId, tenantId),
        gte(cadenceEnrollments.createdAt, from),
        lt(cadenceEnrollments.createdAt, to),
      ),
    )
    .groupBy(cadenceEnrollments.cadenceId)

  const tasks = await db
    .select({
      cadenceId: cadenceTasks.cadenceId,
      status: cadenceTasks.status,
      total: count(),
    })
    .from(cadenceTasks)
    .where(
      and(
        eq(cadenceTasks.tenantId, tenantId),
        gte(cadenceTasks.scheduledAt, from),
        lt(cadenceTasks.scheduledAt, to),
      ),
    )
    .groupBy(cadenceTasks.cadenceId, cadenceTasks.status)

  return {
    items: enrollments.map((row) => ({
      cadenceId: row.cadenceId,
      enrollments: Number(row.total),
      tasksSent: Number(
        tasks.find((task) => task.cadenceId === row.cadenceId && task.status === 'sent')?.total ??
          0,
      ),
      tasksFailed: Number(
        tasks.find((task) => task.cadenceId === row.cadenceId && task.status === 'failed')?.total ??
          0,
      ),
    })),
  }
}

export async function getAppointmentReport(
  db: AppDatabase,
  context: ReportContext,
  tenantId: string,
  filters: ListReportsQuery,
): Promise<{
  items: Array<{ status: string; total: number }>
}> {
  const { from, to } = periodBounds(filters)
  const owner = ownerFilter(context, filters)
  const conditions = [
    eq(appointments.tenantId, tenantId),
    gte(appointments.scheduledAt, from),
    lt(appointments.scheduledAt, to),
  ]
  if (owner) conditions.push(eq(appointments.ownerUserId, owner))

  const rows = await db
    .select({ status: appointments.status, total: count() })
    .from(appointments)
    .where(and(...conditions))
    .groupBy(appointments.status)

  return { items: rows.map((row) => ({ status: row.status, total: Number(row.total) })) }
}
