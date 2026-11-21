import { randomUUID } from 'node:crypto'
import type { BusinessHours, ChangePasswordInput, LoginInput, SessionResponse } from '@crm/shared'
import { and, eq, gt, isNull, ne } from 'drizzle-orm'
import type { AppConfig } from '../../config/env.js'
import type { AppDatabase } from '../../db/client.js'
import { refreshTokens, tenants, users } from '../../db/schema/index.js'
import { recordAudit } from '../../lib/audit.js'
import { generateRefreshToken, hashPassword, hashToken, verifyPassword } from '../../lib/crypto.js'
import { AppError, unauthenticated } from '../../lib/errors.js'
import { signAccessToken } from '../../lib/jwt.js'
import { toSession } from '../../lib/session.js'

interface AuthContextDeps {
  db: AppDatabase
  config: AppConfig
}

interface RequestMetadata {
  ip: string | null
  userAgent: string | null
}

export interface AuthResult {
  session: SessionResponse
  accessToken: string
  accessTokenExpiresAt: Date
  refreshToken: string
  refreshTokenExpiresAt: Date
}

let dummyPasswordHashPromise: Promise<string> | null = null

async function getDummyPasswordHash(): Promise<string> {
  if (!dummyPasswordHashPromise) {
    dummyPasswordHashPromise = hashPassword('invalid-placeholder-password-123')
  }

  return dummyPasswordHashPromise
}

export async function login(
  { db, config }: AuthContextDeps,
  input: LoginInput,
  metadata: RequestMetadata,
): Promise<AuthResult> {
  const conditions = [eq(users.email, input.email)]

  if (input.tenantSlug) {
    conditions.push(eq(tenants.slug, input.tenantSlug))
  }

  const rows = await db
    .select({
      user: {
        id: users.id,
        tenantId: users.tenantId,
        name: users.name,
        email: users.email,
        passwordHash: users.passwordHash,
        role: users.role,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      },
      tenant: {
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        timezone: tenants.timezone,
        businessHours: tenants.businessHours,
        isActive: tenants.isActive,
      },
    })
    .from(users)
    .innerJoin(tenants, eq(users.tenantId, tenants.id))
    .where(and(...conditions))
    .limit(2)

  if (rows.length > 1) {
    throw new AppError(
      409,
      'TENANT_REQUIRED',
      'Este e-mail está associado a mais de uma clínica. Informe o código da clínica.',
    )
  }

  const row = rows[0]

  if (!row) {
    const dummyHash = await getDummyPasswordHash()
    await verifyPassword(dummyHash, input.password)
    throw unauthenticated('E-mail ou senha incorretos.')
  }

  const passwordMatches = await verifyPassword(row.user.passwordHash, input.password)

  if (!passwordMatches || row.user.status !== 'active' || !row.tenant.isActive) {
    throw unauthenticated('E-mail ou senha incorretos.')
  }

  const now = new Date()
  const accessToken = await signAccessToken(config, {
    userId: row.user.id,
    tenantId: row.user.tenantId,
    role: row.user.role,
  })
  const refreshToken = generateRefreshToken()
  const refreshTokenExpiresAt = new Date(now.getTime() + config.refreshTokenTtlSeconds * 1000)

  await db.update(users).set({ lastLoginAt: now, updatedAt: now }).where(eq(users.id, row.user.id))

  await db.insert(refreshTokens).values({
    id: randomUUID(),
    tenantId: row.user.tenantId,
    userId: row.user.id,
    tokenHash: hashToken(refreshToken),
    userAgent: metadata.userAgent,
    ip: metadata.ip,
    expiresAt: refreshTokenExpiresAt,
    lastUsedAt: now,
  })

  await recordAudit(db, {
    tenantId: row.user.tenantId,
    actorUserId: row.user.id,
    action: 'auth.login',
    entityType: 'user',
    entityId: row.user.id,
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  })

  const session = toSession(
    { ...row.user, lastLoginAt: now },
    { ...row.tenant, businessHours: row.tenant.businessHours as BusinessHours },
    accessToken.expiresAt,
  )

  return {
    session,
    accessToken: accessToken.token,
    accessTokenExpiresAt: accessToken.expiresAt,
    refreshToken,
    refreshTokenExpiresAt,
  }
}

export async function refreshSession(
  { db, config }: AuthContextDeps,
  refreshToken: string,
): Promise<AuthResult> {
  const [row] = await db
    .select({
      user: {
        id: users.id,
        tenantId: users.tenantId,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      },
      tenant: {
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        timezone: tenants.timezone,
        businessHours: tenants.businessHours,
        isActive: tenants.isActive,
      },
      refresh: {
        id: refreshTokens.id,
        expiresAt: refreshTokens.expiresAt,
      },
    })
    .from(refreshTokens)
    .innerJoin(users, eq(refreshTokens.userId, users.id))
    .innerJoin(tenants, eq(refreshTokens.tenantId, tenants.id))
    .where(
      and(
        eq(refreshTokens.tokenHash, hashToken(refreshToken)),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date()),
      ),
    )
    .limit(1)

  if (row?.user.status !== 'active' || !row.tenant.isActive) {
    throw unauthenticated()
  }

  const accessToken = await signAccessToken(config, {
    userId: row.user.id,
    tenantId: row.user.tenantId,
    role: row.user.role,
  })

  await db
    .update(refreshTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(refreshTokens.id, row.refresh.id))

  const session = toSession(
    row.user,
    { ...row.tenant, businessHours: row.tenant.businessHours as BusinessHours },
    accessToken.expiresAt,
  )

  return {
    session,
    accessToken: accessToken.token,
    accessTokenExpiresAt: accessToken.expiresAt,
    refreshToken,
    refreshTokenExpiresAt: row.refresh.expiresAt,
  }
}

export async function changeOwnPassword(
  { db }: Pick<AuthContextDeps, 'db'>,
  userId: string,
  tenantId: string,
  currentRefreshToken: string | undefined,
  input: ChangePasswordInput,
  metadata: RequestMetadata,
): Promise<void> {
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .limit(1)

  if (!user) {
    throw unauthenticated()
  }

  const currentPasswordMatches = await verifyPassword(user.passwordHash, input.currentPassword)

  if (!currentPasswordMatches) {
    throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'A senha atual informada está incorreta.')
  }

  const passwordHash = await hashPassword(input.newPassword)
  const now = new Date()

  await db
    .update(users)
    .set({ passwordHash, updatedAt: now })
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))

  const revokeConditions = [eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)]

  if (currentRefreshToken) {
    revokeConditions.push(ne(refreshTokens.tokenHash, hashToken(currentRefreshToken)))
  }

  await db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(and(...revokeConditions))

  await recordAudit(db, {
    tenantId,
    actorUserId: userId,
    action: 'auth.password_changed',
    entityType: 'user',
    entityId: userId,
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  })
}

export async function logout(
  { db }: AuthContextDeps,
  refreshToken: string | undefined,
  metadata: RequestMetadata,
): Promise<void> {
  if (!refreshToken) {
    return
  }

  const tokenHash = hashToken(refreshToken)

  const [revoked] = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
    .returning({
      id: refreshTokens.id,
      tenantId: refreshTokens.tenantId,
      userId: refreshTokens.userId,
    })

  if (revoked) {
    await recordAudit(db, {
      tenantId: revoked.tenantId,
      actorUserId: revoked.userId,
      action: 'auth.logout',
      entityType: 'user',
      entityId: revoked.userId,
      ip: metadata.ip,
      userAgent: metadata.userAgent,
    })
  }
}
