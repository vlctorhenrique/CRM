import { randomUUID } from 'node:crypto'
import type {
  AuthUser,
  CadenceEnrollmentStatus,
  CadenceEnrollmentView,
  CadenceListResponse,
  CadenceStatus,
  CadenceView,
  CreateCadenceInput,
  EnrollLeadInput,
  UpdateCadenceEnrollmentInput,
  UpdateCadenceInput,
} from '@crm/shared'
import { and, count, eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../db/client.js'
import {
  appointments,
  cadenceEnrollments,
  cadenceSteps,
  cadences,
  cadenceTasks,
  leads,
  messageTemplates,
  tenants,
} from '../../db/schema/index.js'
import { recordAudit } from '../../lib/audit.js'
import { AppError, notFound } from '../../lib/errors.js'
import { assertApprovedTemplates } from '../templates/templates.service.js'
import { nextAllowedTime } from './business-hours.js'

export interface AuditMetadata {
  ip: string | null
  userAgent: string | null
}

interface CadenceContext {
  user: AuthUser
}

const ALLOWED_TRANSITIONS: Record<CadenceStatus, CadenceStatus[]> = {
  draft: ['draft', 'active', 'archived'],
  active: ['active', 'paused', 'archived'],
  paused: ['paused', 'active', 'archived'],
  archived: ['archived'],
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function canManage(user: AuthUser): boolean {
  return user.role === 'admin' || user.role === 'manager'
}

async function loadCadence(
  db: AppDatabase,
  tenantId: string,
  cadenceId: string,
  activeEnrollments = 0,
): Promise<CadenceView | null> {
  const [row] = await db
    .select()
    .from(cadences)
    .where(and(eq(cadences.id, cadenceId), eq(cadences.tenantId, tenantId)))
    .limit(1)

  if (!row) {
    return null
  }

  const steps = await db
    .select({
      id: cadenceSteps.id,
      position: cadenceSteps.position,
      delayHours: cadenceSteps.delayHours,
      templateId: cadenceSteps.templateId,
      templateName: messageTemplates.name,
      templateStatus: messageTemplates.status,
    })
    .from(cadenceSteps)
    .leftJoin(messageTemplates, eq(cadenceSteps.templateId, messageTemplates.id))
    .where(and(eq(cadenceSteps.tenantId, tenantId), eq(cadenceSteps.cadenceId, cadenceId)))
    .orderBy(cadenceSteps.position)

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    steps: steps.map((step) => ({
      id: step.id,
      position: step.position,
      delayHours: step.delayHours,
      templateId: step.templateId,
      templateName: step.templateName ?? 'Template removido',
      templateStatus: step.templateStatus ?? 'draft',
    })),
    activeEnrollments,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listCadences(
  db: AppDatabase,
  tenantId: string,
  filters: { status?: CadenceStatus | undefined; limit: number; offset: number },
): Promise<CadenceListResponse> {
  const conditions = [eq(cadences.tenantId, tenantId)]

  if (filters.status) {
    conditions.push(eq(cadences.status, filters.status))
  }

  const where = and(...conditions)
  const [totalRow] = await db.select({ total: count() }).from(cadences).where(where)
  const rows = await db
    .select()
    .from(cadences)
    .where(where)
    .orderBy(cadences.name)
    .limit(filters.limit)
    .offset(filters.offset)

  const counts = await db
    .select({ cadenceId: cadenceEnrollments.cadenceId, total: count() })
    .from(cadenceEnrollments)
    .where(and(eq(cadenceEnrollments.tenantId, tenantId), eq(cadenceEnrollments.status, 'active')))
    .groupBy(cadenceEnrollments.cadenceId)
  const countMap = new Map(counts.map((item) => [item.cadenceId, Number(item.total)]))

  const items: CadenceView[] = []

  for (const row of rows) {
    const view = await loadCadence(db, tenantId, row.id, countMap.get(row.id) ?? 0)

    if (view) {
      items.push(view)
    }
  }

  return { items, total: Number(totalRow?.total ?? 0) }
}

export async function getCadence(
  db: AppDatabase,
  tenantId: string,
  cadenceId: string,
): Promise<CadenceView> {
  const view = await loadCadence(db, tenantId, cadenceId)

  if (!view) {
    throw notFound('Cadência não encontrada.')
  }

  return view
}

export async function createCadence(
  db: AppDatabase,
  context: CadenceContext,
  tenantId: string,
  input: CreateCadenceInput,
  metadata: AuditMetadata,
): Promise<CadenceView> {
  const templateIds = input.steps.map((step) => step.templateId)
  await assertApprovedTemplates(db, tenantId, templateIds)

  const id = randomUUID()
  const now = new Date()

  await db.transaction(async (tx) => {
    await tx.insert(cadences).values({
      id,
      tenantId,
      name: input.name,
      description: input.description ?? null,
      status: 'draft',
      createdByUserId: context.user.id,
      createdAt: now,
      updatedAt: now,
    })

    await tx.insert(cadenceSteps).values(
      input.steps.map((step, index) => ({
        id: randomUUID(),
        tenantId,
        cadenceId: id,
        templateId: step.templateId,
        position: index + 1,
        delayHours: step.delayHours,
        createdAt: now,
      })),
    )
  })

  await recordAudit(db, {
    tenantId,
    actorUserId: context.user.id,
    action: 'cadence.created',
    entityType: 'cadence',
    entityId: id,
    metadata: { steps: input.steps.length },
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  })

  const created = await loadCadence(db, tenantId, id)

  if (!created) {
    throw notFound('Cadência não encontrada.')
  }

  return created
}

export async function updateCadence(
  db: AppDatabase,
  context: CadenceContext,
  tenantId: string,
  cadenceId: string,
  input: UpdateCadenceInput,
  metadata: AuditMetadata,
): Promise<CadenceView> {
  const current = await getCadence(db, tenantId, cadenceId)

  if (input.status && !ALLOWED_TRANSITIONS[current.status].includes(input.status)) {
    throw new AppError(
      409,
      'INVALID_CADENCE_TRANSITION',
      `Não é possível mudar de ${current.status} para ${input.status}.`,
    )
  }

  if (input.steps && current.status !== 'draft') {
    throw new AppError(409, 'CADENCE_STEPS_LOCKED', 'Só é possível editar passos em rascunho.')
  }

  if ((input.status === 'active' || input.steps) && current.steps.length === 0) {
    throw new AppError(409, 'CADENCE_WITHOUT_STEPS', 'A cadência precisa de ao menos um passo.')
  }

  const steps = input.steps ?? current.steps
  await assertApprovedTemplates(
    db,
    tenantId,
    steps.map((step) => step.templateId),
  )

  const now = new Date()
  const values: Partial<typeof cadences.$inferInsert> = { updatedAt: now }

  if (input.name !== undefined) values.name = input.name
  if (input.description !== undefined) values.description = input.description
  if (input.status !== undefined) values.status = input.status

  await db.transaction(async (tx) => {
    await tx
      .update(cadences)
      .set(values)
      .where(and(eq(cadences.id, cadenceId), eq(cadences.tenantId, tenantId)))

    if (input.steps) {
      await tx
        .delete(cadenceSteps)
        .where(and(eq(cadenceSteps.tenantId, tenantId), eq(cadenceSteps.cadenceId, cadenceId)))

      await tx.insert(cadenceSteps).values(
        input.steps.map((step, index) => ({
          id: randomUUID(),
          tenantId,
          cadenceId,
          templateId: step.templateId,
          position: index + 1,
          delayHours: step.delayHours,
          createdAt: now,
        })),
      )
    }
  })

  await recordAudit(db, {
    tenantId,
    actorUserId: context.user.id,
    action: 'cadence.updated',
    entityType: 'cadence',
    entityId: cadenceId,
    metadata: { fields: Object.keys(input) },
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  })

  const view = await loadCadence(db, tenantId, cadenceId)

  if (!view) {
    throw notFound('Cadência não encontrada.')
  }

  return view
}

async function toEnrollmentView(
  db: AppDatabase,
  tenantId: string,
  enrollmentId: string,
): Promise<CadenceEnrollmentView | null> {
  const [row] = await db
    .select({
      enrollment: cadenceEnrollments,
      leadName: leads.name,
      phone: leads.phoneNormalized,
      cadenceName: cadences.name,
    })
    .from(cadenceEnrollments)
    .leftJoin(leads, eq(cadenceEnrollments.leadId, leads.id))
    .leftJoin(cadences, eq(cadenceEnrollments.cadenceId, cadences.id))
    .where(and(eq(cadenceEnrollments.id, enrollmentId), eq(cadenceEnrollments.tenantId, tenantId)))
    .limit(1)

  if (!row) {
    return null
  }

  return {
    id: row.enrollment.id,
    leadId: row.enrollment.leadId,
    leadName: row.leadName,
    phone: row.phone ?? '',
    cadenceId: row.enrollment.cadenceId,
    cadenceName: row.cadenceName ?? '',
    status: row.enrollment.status,
    currentStep: row.enrollment.currentStep,
    nextSendAt: toIso(row.enrollment.nextSendAt),
    startedAt: row.enrollment.startedAt.toISOString(),
    pausedAt: toIso(row.enrollment.pausedAt),
    completedAt: toIso(row.enrollment.completedAt),
    cancelledAt: toIso(row.enrollment.cancelledAt),
    cancelReason: row.enrollment.cancelReason,
    createdAt: row.enrollment.createdAt.toISOString(),
  }
}

async function cancelPendingTasks(
  db: AppDatabase,
  tenantId: string,
  enrollmentId: string,
): Promise<void> {
  await db
    .update(cadenceTasks)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(
      and(
        eq(cadenceTasks.tenantId, tenantId),
        eq(cadenceTasks.enrollmentId, enrollmentId),
        inArray(cadenceTasks.status, ['pending', 'processing']),
      ),
    )
}

export async function enrollLead(
  db: AppDatabase,
  context: CadenceContext,
  tenantId: string,
  input: EnrollLeadInput,
  maxAttempts: number,
  metadata: AuditMetadata,
): Promise<CadenceEnrollmentView> {
  const [cadence] = await db
    .select()
    .from(cadences)
    .where(and(eq(cadences.id, input.cadenceId), eq(cadences.tenantId, tenantId)))
    .limit(1)

  if (cadence?.status !== 'active') {
    throw new AppError(409, 'CADENCE_NOT_ACTIVE', 'A cadência não está ativa.')
  }

  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, input.leadId), eq(leads.tenantId, tenantId)))
    .limit(1)

  if (!lead || !canManage(context.user)) {
    throw notFound('Lead não encontrado.')
  }

  if (lead.consentStatus !== 'granted') {
    throw new AppError(409, 'CONSENT_REQUIRED', 'O lead não possui consentimento registrado.')
  }

  if (lead.optOutAt || lead.status === 'opt_out' || lead.status === 'lost') {
    throw new AppError(409, 'LEAD_NOT_ELIGIBLE', 'O lead não é elegível para cadência.')
  }

  const [activeEnrollment] = await db
    .select({ id: cadenceEnrollments.id })
    .from(cadenceEnrollments)
    .where(
      and(
        eq(cadenceEnrollments.tenantId, tenantId),
        eq(cadenceEnrollments.leadId, input.leadId),
        eq(cadenceEnrollments.status, 'active'),
      ),
    )
    .limit(1)

  if (activeEnrollment) {
    throw new AppError(409, 'ALREADY_ENROLLED', 'O lead já está em uma cadência ativa.')
  }

  const [futureAppointment] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        eq(appointments.leadId, input.leadId),
        inArray(appointments.status, ['scheduled', 'confirmed']),
      ),
    )
    .limit(1)

  if (futureAppointment) {
    throw new AppError(
      409,
      'LEAD_HAS_APPOINTMENT',
      'O lead possui agendamento ativo e não deve entrar em cadência.',
    )
  }

  const [tenantRow] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)

  if (!tenantRow) {
    throw notFound('Clínica não encontrada.')
  }

  const steps = await db
    .select()
    .from(cadenceSteps)
    .where(and(eq(cadenceSteps.tenantId, tenantId), eq(cadenceSteps.cadenceId, cadence.id)))
    .orderBy(cadenceSteps.position)

  if (steps.length === 0) {
    throw new AppError(409, 'CADENCE_WITHOUT_STEPS', 'A cadência não possui passos.')
  }

  const now = new Date()
  let cursor = now
  const scheduledTimes = steps.map((step) => {
    cursor = nextAllowedTime(
      new Date(cursor.getTime() + step.delayHours * 60 * 60 * 1000),
      tenantRow.businessHours,
      tenantRow.timezone,
    )
    return cursor
  })

  const enrollmentId = randomUUID()

  await db.transaction(async (tx) => {
    await tx.insert(cadenceEnrollments).values({
      id: enrollmentId,
      tenantId,
      leadId: input.leadId,
      cadenceId: cadence.id,
      status: 'active',
      currentStep: 0,
      nextSendAt: scheduledTimes[0] ?? null,
      startedAt: now,
      createdByUserId: context.user.id,
      createdAt: now,
      updatedAt: now,
    })

    await tx.insert(cadenceTasks).values(
      steps.map((step, index) => ({
        id: randomUUID(),
        tenantId,
        enrollmentId,
        leadId: input.leadId,
        cadenceId: cadence.id,
        stepId: step.id,
        scheduledAt: scheduledTimes[index] ?? now,
        status: 'pending' as const,
        attempts: 0,
        maxAttempts,
        createdAt: now,
        updatedAt: now,
      })),
    )
  })

  await recordAudit(db, {
    tenantId,
    actorUserId: context.user.id,
    action: 'cadence.enrolled',
    entityType: 'cadence_enrollment',
    entityId: enrollmentId,
    metadata: { leadId: input.leadId, cadenceId: cadence.id },
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  })

  const view = await toEnrollmentView(db, tenantId, enrollmentId)

  if (!view) {
    throw notFound('Inscrição não encontrada.')
  }

  return view
}

export async function listEnrollments(
  db: AppDatabase,
  context: CadenceContext,
  tenantId: string,
  filters: {
    leadId?: string | undefined
    cadenceId?: string | undefined
    status?: CadenceEnrollmentStatus | undefined
    limit: number
    offset: number
  },
): Promise<{ items: CadenceEnrollmentView[]; total: number }> {
  const conditions = [eq(cadenceEnrollments.tenantId, tenantId)]

  if (filters.leadId) {
    conditions.push(eq(cadenceEnrollments.leadId, filters.leadId))
  }

  if (filters.cadenceId) {
    conditions.push(eq(cadenceEnrollments.cadenceId, filters.cadenceId))
  }

  if (filters.status) {
    conditions.push(eq(cadenceEnrollments.status, filters.status))
  }

  if (context.user.role === 'sdr') {
    conditions.push(eq(leads.ownerUserId, context.user.id))
  }

  const where = and(...conditions)
  const [totalRow] = await db
    .select({ total: count() })
    .from(cadenceEnrollments)
    .leftJoin(leads, eq(cadenceEnrollments.leadId, leads.id))
    .where(where)
  const rows = await db
    .select({ id: cadenceEnrollments.id })
    .from(cadenceEnrollments)
    .leftJoin(leads, eq(cadenceEnrollments.leadId, leads.id))
    .where(where)
    .orderBy(cadenceEnrollments.createdAt)
    .limit(filters.limit)
    .offset(filters.offset)

  const items: CadenceEnrollmentView[] = []

  for (const row of rows) {
    const view = await toEnrollmentView(db, tenantId, row.id)

    if (view) {
      items.push(view)
    }
  }

  return { items, total: Number(totalRow?.total ?? 0) }
}

export async function updateEnrollment(
  db: AppDatabase,
  context: CadenceContext,
  tenantId: string,
  enrollmentId: string,
  input: UpdateCadenceEnrollmentInput,
  metadata: AuditMetadata,
): Promise<CadenceEnrollmentView> {
  const [current] = await db
    .select()
    .from(cadenceEnrollments)
    .where(and(eq(cadenceEnrollments.id, enrollmentId), eq(cadenceEnrollments.tenantId, tenantId)))
    .limit(1)

  if (!current) {
    throw notFound('Inscrição não encontrada.')
  }

  const now = new Date()
  const values: Partial<typeof cadenceEnrollments.$inferInsert> = { updatedAt: now }
  let shouldReschedule = false

  if (input.status === 'paused') {
    if (current.status !== 'active') {
      throw new AppError(
        409,
        'INVALID_ENROLLMENT_TRANSITION',
        'Só é possível pausar inscrição ativa.',
      )
    }

    values.status = 'paused'
    values.pausedAt = now
    values.pauseReason = input.reason ?? null
    await cancelPendingTasks(db, tenantId, enrollmentId)
  } else if (input.status === 'cancelled') {
    if (current.status === 'cancelled' || current.status === 'completed') {
      throw new AppError(409, 'INVALID_ENROLLMENT_TRANSITION', 'Inscrição já encerrada.')
    }

    values.status = 'cancelled'
    values.cancelledAt = now
    values.cancelReason = input.reason ?? null
    await cancelPendingTasks(db, tenantId, enrollmentId)
  } else {
    if (current.status !== 'paused') {
      throw new AppError(
        409,
        'INVALID_ENROLLMENT_TRANSITION',
        'Só é possível retomar inscrição pausada.',
      )
    }

    values.status = 'active'
    values.pausedAt = null
    values.pauseReason = null
    shouldReschedule = true
  }

  await db
    .update(cadenceEnrollments)
    .set(values)
    .where(and(eq(cadenceEnrollments.id, enrollmentId), eq(cadenceEnrollments.tenantId, tenantId)))

  if (shouldReschedule) {
    const [tenantRow] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)
    const steps = await db
      .select()
      .from(cadenceSteps)
      .where(
        and(
          eq(cadenceSteps.tenantId, tenantId),
          eq(cadenceSteps.cadenceId, current.cadenceId),
          eq(cadenceSteps.position, current.currentStep + 1),
        ),
      )
      .limit(1)

    if (tenantRow && steps[0]) {
      const nextAt = nextAllowedTime(
        new Date(now.getTime() + steps[0].delayHours * 60 * 60 * 1000),
        tenantRow.businessHours,
        tenantRow.timezone,
      )
      await db
        .insert(cadenceTasks)
        .values({
          id: randomUUID(),
          tenantId,
          enrollmentId,
          leadId: current.leadId,
          cadenceId: current.cadenceId,
          stepId: steps[0].id,
          scheduledAt: nextAt,
          status: 'pending',
          attempts: 0,
          maxAttempts: 3,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
      await db
        .update(cadenceEnrollments)
        .set({ nextSendAt: nextAt })
        .where(eq(cadenceEnrollments.id, enrollmentId))
    }
  }

  await recordAudit(db, {
    tenantId,
    actorUserId: context.user.id,
    action: 'cadence_enrollment.updated',
    entityType: 'cadence_enrollment',
    entityId: enrollmentId,
    metadata: { status: input.status },
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  })

  const view = await toEnrollmentView(db, tenantId, enrollmentId)

  if (!view) {
    throw notFound('Inscrição não encontrada.')
  }

  return view
}
