import { randomUUID } from 'node:crypto'
import type {
  AppointmentListResponse,
  AppointmentStatus,
  AppointmentView,
  AuthUser,
  CreateAppointmentInput,
  ListAppointmentsQuery,
  UpdateAppointmentInput,
} from '@crm/shared'
import { and, count, desc, eq, gte, inArray, lt } from 'drizzle-orm'
import type { AppDatabase } from '../../db/client.js'
import { appointments, cadenceTasks, leads, notifications, users } from '../../db/schema/index.js'
import { recordAudit } from '../../lib/audit.js'
import { AppError, forbidden, notFound } from '../../lib/errors.js'

export interface AuditMetadata {
  ip: string | null
  userAgent: string | null
}

interface AppointmentContext {
  user: AuthUser
}

const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ['confirmed', 'completed', 'cancelled', 'no_show'],
  confirmed: ['completed', 'cancelled', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function canManage(user: AuthUser): boolean {
  return user.role === 'admin' || user.role === 'manager'
}

async function findAppointmentRow(db: AppDatabase, tenantId: string, appointmentId: string) {
  const [row] = await db
    .select({
      appointment: appointments,
      leadName: leads.name,
      leadPhone: leads.phoneNormalized,
      ownerName: users.name,
    })
    .from(appointments)
    .leftJoin(leads, eq(appointments.leadId, leads.id))
    .leftJoin(users, eq(appointments.ownerUserId, users.id))
    .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)))
    .limit(1)

  return row ?? null
}

function toView(row: NonNullable<Awaited<ReturnType<typeof findAppointmentRow>>>): AppointmentView {
  const appointment = row.appointment

  return {
    id: appointment.id,
    leadId: appointment.leadId,
    leadName: row.leadName,
    phone: row.leadPhone ?? '',
    procedure: appointment.procedure,
    scheduledAt: appointment.scheduledAt.toISOString(),
    durationMinutes: appointment.durationMinutes,
    status: appointment.status,
    notes: appointment.notes,
    ownerUserId: appointment.ownerUserId,
    ownerName: row.ownerName,
    createdByUserId: appointment.createdByUserId,
    cancellationReason: appointment.cancellationReason,
    cancelledAt: toIso(appointment.cancelledAt),
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
  }
}

async function assertLeadAccess(db: AppDatabase, tenantId: string, leadId: string, user: AuthUser) {
  const [lead] = await db
    .select({ id: leads.id, ownerUserId: leads.ownerUserId })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)))
    .limit(1)

  if (!lead || (!canManage(user) && lead.ownerUserId !== user.id)) {
    throw notFound('Lead não encontrado.')
  }

  return lead
}

async function assertOwnerExists(
  db: AppDatabase,
  tenantId: string,
  ownerUserId: string,
): Promise<void> {
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, ownerUserId), eq(users.tenantId, tenantId), eq(users.status, 'active')))
    .limit(1)

  if (!owner) {
    throw new AppError(
      422,
      'INVALID_OWNER',
      'O responsável informado não está ativo nesta clínica.',
    )
  }
}

async function assertNoConflict(
  db: AppDatabase,
  tenantId: string,
  ownerUserId: string | null,
  scheduledAt: Date,
  durationMinutes: number,
  excludeId?: string,
): Promise<void> {
  if (!ownerUserId) {
    return
  }

  const end = new Date(scheduledAt.getTime() + durationMinutes * 60_000)
  const rows = await db
    .select({
      id: appointments.id,
      scheduledAt: appointments.scheduledAt,
      durationMinutes: appointments.durationMinutes,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        eq(appointments.ownerUserId, ownerUserId),
        inArray(appointments.status, ['scheduled', 'confirmed']),
      ),
    )

  const conflict = rows.some((row) => {
    if (row.id === excludeId) {
      return false
    }

    const rowEnd = new Date(row.scheduledAt.getTime() + row.durationMinutes * 60_000)

    return row.scheduledAt.getTime() < end.getTime() && rowEnd.getTime() > scheduledAt.getTime()
  })

  if (conflict) {
    throw new AppError(
      409,
      'APPOINTMENT_CONFLICT',
      'O responsável já possui um agendamento neste horário.',
    )
  }
}

async function cancelFutureCadenceTasks(
  db: AppDatabase,
  tenantId: string,
  leadId: string,
): Promise<void> {
  await db
    .update(cadenceTasks)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(
      and(
        eq(cadenceTasks.tenantId, tenantId),
        eq(cadenceTasks.leadId, leadId),
        inArray(cadenceTasks.status, ['pending', 'processing']),
        gte(cadenceTasks.scheduledAt, new Date()),
      ),
    )
}

async function notifyOwner(
  db: AppDatabase,
  tenantId: string,
  ownerUserId: string | null,
  type: 'appointment_created' | 'appointment_cancelled',
  title: string,
  body: string,
  appointmentId: string,
): Promise<void> {
  if (!ownerUserId) {
    return
  }

  await db.insert(notifications).values({
    id: randomUUID(),
    tenantId,
    userId: ownerUserId,
    type,
    title,
    body,
    entityType: 'appointment',
    entityId: appointmentId,
    createdAt: new Date(),
  })
}

export async function listAppointments(
  db: AppDatabase,
  context: AppointmentContext,
  tenantId: string,
  filters: ListAppointmentsQuery,
): Promise<AppointmentListResponse> {
  const conditions = [eq(appointments.tenantId, tenantId)]

  if (context.user.role === 'sdr') {
    conditions.push(eq(appointments.ownerUserId, context.user.id))
  }

  if (filters.status) {
    conditions.push(eq(appointments.status, filters.status))
  }

  if (filters.leadId) {
    conditions.push(eq(appointments.leadId, filters.leadId))
  }

  if (filters.from) {
    conditions.push(gte(appointments.scheduledAt, new Date(`${filters.from}T00:00:00.000Z`)))
  }

  if (filters.to) {
    conditions.push(lt(appointments.scheduledAt, new Date(`${filters.to}T00:00:00.000Z`)))
  }

  const where = and(...conditions)
  const [totalRow] = await db.select({ total: count() }).from(appointments).where(where)

  const rows = await db
    .select({
      appointment: appointments,
      leadName: leads.name,
      leadPhone: leads.phoneNormalized,
      ownerName: users.name,
    })
    .from(appointments)
    .leftJoin(leads, eq(appointments.leadId, leads.id))
    .leftJoin(users, eq(appointments.ownerUserId, users.id))
    .where(where)
    .orderBy(desc(appointments.scheduledAt))
    .limit(filters.limit)
    .offset(filters.offset)

  return {
    items: rows.map(toView),
    total: Number(totalRow?.total ?? 0),
  }
}

export async function getAppointment(
  db: AppDatabase,
  context: AppointmentContext,
  tenantId: string,
  appointmentId: string,
): Promise<AppointmentView> {
  const row = await findAppointmentRow(db, tenantId, appointmentId)

  if (!row || (!canManage(context.user) && row.appointment.ownerUserId !== context.user.id)) {
    throw notFound('Agendamento não encontrado.')
  }

  return toView(row)
}

export async function createAppointment(
  db: AppDatabase,
  context: AppointmentContext,
  tenantId: string,
  input: CreateAppointmentInput,
  metadata: AuditMetadata,
): Promise<AppointmentView> {
  const lead = await assertLeadAccess(db, tenantId, input.leadId, context.user)

  const ownerUserId = input.ownerUserId === undefined ? lead.ownerUserId : input.ownerUserId

  if (ownerUserId) {
    await assertOwnerExists(db, tenantId, ownerUserId)

    if (!canManage(context.user) && ownerUserId !== context.user.id) {
      throw forbidden('Apenas administradores e gerentes podem definir outro responsável.')
    }
  }

  const scheduledAt = new Date(input.scheduledAt)

  if (Number.isNaN(scheduledAt.getTime())) {
    throw new AppError(422, 'INVALID_SCHEDULED_AT', 'Data do agendamento inválida.')
  }

  await assertNoConflict(db, tenantId, ownerUserId, scheduledAt, input.durationMinutes)

  const id = randomUUID()
  const now = new Date()

  await db.insert(appointments).values({
    id,
    tenantId,
    leadId: input.leadId,
    ownerUserId,
    createdByUserId: context.user.id,
    procedure: input.procedure ?? null,
    scheduledAt,
    durationMinutes: input.durationMinutes,
    status: 'scheduled',
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  })

  await cancelFutureCadenceTasks(db, tenantId, input.leadId)
  await notifyOwner(
    db,
    tenantId,
    ownerUserId,
    'appointment_created',
    'Novo agendamento',
    'Um agendamento foi criado para um lead da clínica.',
    id,
  )

  await recordAudit(db, {
    tenantId,
    actorUserId: context.user.id,
    action: 'appointment.created',
    entityType: 'appointment',
    entityId: id,
    metadata: { leadId: input.leadId, scheduledAt: input.scheduledAt },
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  })

  const created = await findAppointmentRow(db, tenantId, id)

  if (!created) {
    throw notFound('Agendamento não encontrado.')
  }

  return toView(created)
}

export async function updateAppointment(
  db: AppDatabase,
  context: AppointmentContext,
  tenantId: string,
  appointmentId: string,
  input: UpdateAppointmentInput,
  metadata: AuditMetadata,
): Promise<AppointmentView> {
  const current = await findAppointmentRow(db, tenantId, appointmentId)

  if (
    !current ||
    (!canManage(context.user) && current.appointment.ownerUserId !== context.user.id)
  ) {
    throw notFound('Agendamento não encontrado.')
  }

  const appointment = current.appointment

  if (input.status && !ALLOWED_TRANSITIONS[appointment.status].includes(input.status)) {
    throw new AppError(
      409,
      'INVALID_APPOINTMENT_TRANSITION',
      `Não é possível mudar de ${appointment.status} para ${input.status}.`,
    )
  }

  if (input.status === 'cancelled' && !input.cancellationReason?.trim()) {
    throw new AppError(422, 'CANCELLATION_REASON_REQUIRED', 'Informe o motivo do cancelamento.')
  }

  if (input.ownerUserId) {
    await assertOwnerExists(db, tenantId, input.ownerUserId)

    if (!canManage(context.user) && input.ownerUserId !== context.user.id) {
      throw forbidden('Apenas administradores e gerentes podem definir outro responsável.')
    }
  }

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : appointment.scheduledAt
  const durationMinutes = input.durationMinutes ?? appointment.durationMinutes
  const ownerUserId = input.ownerUserId === undefined ? appointment.ownerUserId : input.ownerUserId

  if (Number.isNaN(scheduledAt.getTime())) {
    throw new AppError(422, 'INVALID_SCHEDULED_AT', 'Data do agendamento inválida.')
  }

  const nextStatus = input.status ?? appointment.status

  if (nextStatus === 'scheduled' || nextStatus === 'confirmed') {
    await assertNoConflict(db, tenantId, ownerUserId, scheduledAt, durationMinutes, appointmentId)
  }

  const now = new Date()
  const values: Partial<typeof appointments.$inferInsert> = { updatedAt: now }

  if (input.status !== undefined) values.status = input.status
  if (input.scheduledAt !== undefined) values.scheduledAt = scheduledAt
  if (input.durationMinutes !== undefined) values.durationMinutes = input.durationMinutes
  if (input.procedure !== undefined) values.procedure = input.procedure
  if (input.notes !== undefined) values.notes = input.notes
  if (input.ownerUserId !== undefined) values.ownerUserId = input.ownerUserId
  if (input.cancellationReason !== undefined) values.cancellationReason = input.cancellationReason

  if (input.status === 'cancelled') {
    values.cancelledAt = appointment.cancelledAt ?? now
  }

  await db
    .update(appointments)
    .set(values)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)))

  if (nextStatus === 'scheduled' || nextStatus === 'confirmed') {
    await cancelFutureCadenceTasks(db, tenantId, appointment.leadId)
  }

  if (input.status === 'cancelled') {
    await notifyOwner(
      db,
      tenantId,
      ownerUserId,
      'appointment_cancelled',
      'Agendamento cancelado',
      input.cancellationReason ?? 'Um agendamento foi cancelado.',
      appointmentId,
    )
  }

  await recordAudit(db, {
    tenantId,
    actorUserId: context.user.id,
    action: 'appointment.updated',
    entityType: 'appointment',
    entityId: appointmentId,
    metadata: { fields: Object.keys(input) },
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  })

  const updated = await findAppointmentRow(db, tenantId, appointmentId)

  if (!updated) {
    throw notFound('Agendamento não encontrado.')
  }

  return toView(updated)
}
