import { randomUUID } from 'node:crypto'
import type { AuthUser, CreateUserInput, UpdateUserInput } from '@crm/shared'
import { and, asc, eq, ne } from 'drizzle-orm'
import type { AppDatabase } from '../../db/client.js'
import { users } from '../../db/schema/index.js'
import { recordAudit } from '../../lib/audit.js'
import { hashPassword } from '../../lib/crypto.js'
import { AppError, notFound } from '../../lib/errors.js'
import { toAuthUser } from '../../lib/session.js'

export interface AuditMetadata {
  ip: string | null
  userAgent: string | null
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  )
}

export async function listUsers(db: AppDatabase, tenantId: string): Promise<AuthUser[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .orderBy(asc(users.name))

  return rows.map(toAuthUser)
}

export async function createUser(
  db: AppDatabase,
  tenantId: string,
  actorUserId: string,
  input: CreateUserInput,
  metadata: AuditMetadata,
): Promise<AuthUser> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.email, input.email)))
    .limit(1)

  if (existing) {
    throw new AppError(409, 'EMAIL_IN_USE', 'Já existe um usuário com este e-mail nesta clínica.')
  }

  const now = new Date()
  const passwordHash = await hashPassword(input.password)

  try {
    const [created] = await db
      .insert(users)
      .values({
        id: randomUUID(),
        tenantId,
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })

    if (!created) {
      throw new Error('Falha ao criar usuário.')
    }

    await recordAudit(db, {
      tenantId,
      actorUserId,
      action: 'user.created',
      entityType: 'user',
      entityId: created.id,
      metadata: { email: created.email, role: created.role },
      ip: metadata.ip,
      userAgent: metadata.userAgent,
    })

    return toAuthUser(created)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'EMAIL_IN_USE', 'Já existe um usuário com este e-mail nesta clínica.')
    }

    throw error
  }
}

export async function updateUser(
  db: AppDatabase,
  tenantId: string,
  actorUserId: string,
  userId: string,
  input: UpdateUserInput,
  metadata: AuditMetadata,
): Promise<AuthUser> {
  const [target] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .limit(1)

  if (!target) {
    throw notFound('Usuário não encontrado.')
  }

  if (target.id === actorUserId && input.status === 'disabled') {
    throw new AppError(
      400,
      'SELF_DISABLE_NOT_ALLOWED',
      'Você não pode desativar seu próprio usuário.',
    )
  }

  if (target.id === actorUserId && input.role && input.role !== target.role) {
    throw new AppError(
      400,
      'SELF_ROLE_CHANGE_NOT_ALLOWED',
      'Você não pode alterar seu próprio perfil.',
    )
  }

  if (input.email && input.email !== target.email) {
    const [conflict] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.tenantId, tenantId), eq(users.email, input.email), ne(users.id, target.id)),
      )
      .limit(1)

    if (conflict) {
      throw new AppError(409, 'EMAIL_IN_USE', 'Já existe um usuário com este e-mail nesta clínica.')
    }
  }

  const changes: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  }

  if (input.name !== undefined) {
    changes.name = input.name
  }

  if (input.role !== undefined) {
    changes.role = input.role
  }

  if (input.status !== undefined) {
    changes.status = input.status
  }

  if (input.password !== undefined) {
    changes.passwordHash = await hashPassword(input.password)
  }

  const [updated] = await db
    .update(users)
    .set(changes)
    .where(and(eq(users.id, target.id), eq(users.tenantId, tenantId)))
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })

  if (!updated) {
    throw notFound('Usuário não encontrado.')
  }

  await recordAudit(db, {
    tenantId,
    actorUserId,
    action: 'user.updated',
    entityType: 'user',
    entityId: updated.id,
    metadata: { fields: Object.keys(input) },
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  })

  return toAuthUser(updated)
}
