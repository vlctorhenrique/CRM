import { randomUUID } from 'node:crypto'
import type {
  AuthUser,
  CreateTemplateInput,
  MessageTemplateView,
  TemplateListResponse,
  TemplateStatus,
  UpdateTemplateInput,
} from '@crm/shared'
import { and, count, eq, ilike, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../db/client.js'
import { messageTemplates } from '../../db/schema/index.js'
import { AppError } from '../../lib/errors.js'
import { extractTemplateVariables, TEMPLATE_VARIABLES } from '../cadences/template-render.js'

interface TemplateContext {
  user: AuthUser
}

const ALLOWED_TRANSITIONS: Record<TemplateStatus, TemplateStatus[]> = {
  draft: ['draft', 'pending', 'approved', 'paused'],
  pending: ['pending', 'approved', 'rejected', 'draft'],
  approved: ['approved', 'paused', 'pending'],
  rejected: ['rejected', 'draft'],
  paused: ['paused', 'draft'],
}

function toView(row: typeof messageTemplates.$inferSelect): MessageTemplateView {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    language: row.language,
    body: row.body,
    variables: row.variables,
    status: row.status,
    metaTemplateId: row.metaTemplateId,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function validateVariables(body: string): string[] {
  const variables = extractTemplateVariables(body)
  const unknown = variables.filter(
    (variable) => !(TEMPLATE_VARIABLES as readonly string[]).includes(variable),
  )

  if (unknown.length > 0) {
    throw new AppError(
      422,
      'UNKNOWN_TEMPLATE_VARIABLE',
      `Variáveis não suportadas: ${unknown.join(', ')}`,
    )
  }

  return variables
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const candidate = error as { code?: unknown; cause?: unknown }

  if (candidate.code === '23505') {
    return true
  }

  return isUniqueViolation(candidate.cause)
}

export async function listTemplates(
  db: AppDatabase,
  tenantId: string,
  filters: {
    status?: TemplateStatus | undefined
    search?: string | undefined
    limit: number
    offset: number
  },
): Promise<TemplateListResponse> {
  const conditions = [eq(messageTemplates.tenantId, tenantId)]

  if (filters.status) {
    conditions.push(eq(messageTemplates.status, filters.status))
  }

  if (filters.search) {
    conditions.push(ilike(messageTemplates.name, `%${filters.search}%`))
  }

  const where = and(...conditions)
  const [totalRow] = await db.select({ total: count() }).from(messageTemplates).where(where)
  const rows = await db
    .select()
    .from(messageTemplates)
    .where(where)
    .orderBy(messageTemplates.name)
    .limit(filters.limit)
    .offset(filters.offset)

  return { items: rows.map(toView), total: Number(totalRow?.total ?? 0) }
}

export async function getTemplate(
  db: AppDatabase,
  tenantId: string,
  templateId: string,
): Promise<MessageTemplateView> {
  const [row] = await db
    .select()
    .from(messageTemplates)
    .where(and(eq(messageTemplates.id, templateId), eq(messageTemplates.tenantId, tenantId)))
    .limit(1)

  if (!row) {
    throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template não encontrado.')
  }

  return toView(row)
}

export async function createTemplate(
  db: AppDatabase,
  context: TemplateContext,
  tenantId: string,
  input: CreateTemplateInput,
): Promise<MessageTemplateView> {
  const variables = validateVariables(input.body)

  try {
    const [row] = await db
      .insert(messageTemplates)
      .values({
        id: randomUUID(),
        tenantId,
        name: input.name,
        category: input.category,
        language: input.language,
        body: input.body,
        variables,
        status: 'draft',
        createdByUserId: context.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()

    if (!row) {
      throw new AppError(500, 'TEMPLATE_CREATE_FAILED', 'Não foi possível criar o template.')
    }

    return toView(row)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'TEMPLATE_ALREADY_EXISTS', 'Já existe um template com este nome.')
    }

    throw error
  }
}

export async function updateTemplate(
  db: AppDatabase,
  tenantId: string,
  templateId: string,
  input: UpdateTemplateInput,
): Promise<MessageTemplateView> {
  const [current] = await db
    .select()
    .from(messageTemplates)
    .where(and(eq(messageTemplates.id, templateId), eq(messageTemplates.tenantId, tenantId)))
    .limit(1)

  if (!current) {
    throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template não encontrado.')
  }

  if (input.status && !ALLOWED_TRANSITIONS[current.status].includes(input.status)) {
    throw new AppError(
      409,
      'INVALID_TEMPLATE_TRANSITION',
      `Não é possível mudar de ${current.status} para ${input.status}.`,
    )
  }

  if (input.body !== undefined && current.status === 'approved' && input.status !== 'pending') {
    throw new AppError(
      409,
      'APPROVED_TEMPLATE_LOCKED',
      'Para alterar o corpo de um template aprovado, volte para pendente.',
    )
  }

  const values: Partial<typeof messageTemplates.$inferInsert> = { updatedAt: new Date() }

  if (input.name !== undefined) values.name = input.name
  if (input.category !== undefined) values.category = input.category
  if (input.language !== undefined) values.language = input.language
  if (input.status !== undefined) {
    values.status = input.status
    values.rejectionReason =
      input.status === 'rejected' ? (values.rejectionReason ?? current.rejectionReason) : null
  }
  if (input.body !== undefined) {
    values.body = input.body
    values.variables = validateVariables(input.body)
  }

  if (input.status === 'rejected' && !values.rejectionReason) {
    values.rejectionReason = 'Rejeitado pela equipe'
  }

  try {
    const [row] = await db
      .update(messageTemplates)
      .set(values)
      .where(and(eq(messageTemplates.id, templateId), eq(messageTemplates.tenantId, tenantId)))
      .returning()

    if (!row) {
      throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template não encontrado.')
    }

    return toView(row)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'TEMPLATE_ALREADY_EXISTS', 'Já existe um template com este nome.')
    }

    throw error
  }
}

export async function assertApprovedTemplates(
  db: AppDatabase,
  tenantId: string,
  templateIds: string[],
): Promise<void> {
  if (templateIds.length === 0) {
    return
  }

  const rows = await db
    .select({ id: messageTemplates.id, status: messageTemplates.status })
    .from(messageTemplates)
    .where(and(eq(messageTemplates.tenantId, tenantId), inArray(messageTemplates.id, templateIds)))

  if (rows.length !== templateIds.length || rows.some((row) => row.status !== 'approved')) {
    throw new AppError(
      409,
      'TEMPLATE_NOT_APPROVED',
      'Todos os passos da cadência exigem templates aprovados existentes.',
    )
  }
}
