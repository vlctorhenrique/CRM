import type { BusinessHours, UserRole } from '@crm/shared'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { tenants, users } from '../db/schema/index.js'
import { ACCESS_COOKIE } from '../lib/cookies.js'
import { AppError, unauthenticated } from '../lib/errors.js'
import { verifyAccessToken } from '../lib/jwt.js'
import { toAuthUser, toTenantSummary } from '../lib/session.js'
import type { AuthContext } from '../types/fastify.js'

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.decorateRequest('auth', null)

  app.decorate(
    'authenticate',
    async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
      const authorization = request.headers.authorization
      const bearerToken =
        authorization?.startsWith('Bearer ') === true ? authorization.slice(7) : null
      const token = request.cookies[ACCESS_COOKIE] ?? bearerToken

      if (!token) {
        throw unauthenticated()
      }

      const claims = await verifyAccessToken(app.config, token)

      if (!claims) {
        throw unauthenticated()
      }

      const [row] = await app.db
        .select({
          user: {
            id: users.id,
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
        })
        .from(users)
        .innerJoin(tenants, eq(users.tenantId, tenants.id))
        .where(
          and(
            eq(users.id, claims.userId),
            eq(users.tenantId, claims.tenantId),
            eq(users.status, 'active'),
            eq(tenants.isActive, true),
          ),
        )
        .limit(1)

      if (!row) {
        throw unauthenticated()
      }

      request.auth = {
        user: toAuthUser(row.user),
        tenant: toTenantSummary({
          ...row.tenant,
          businessHours: row.tenant.businessHours as BusinessHours,
        }),
      }
    },
  )

  app.decorate(
    'requireRole',
    (roles: readonly UserRole[]) =>
      async function requireRole(request: FastifyRequest, reply: FastifyReply): Promise<void> {
        await app.authenticate(request, reply)

        if (!request.auth) {
          throw unauthenticated()
        }

        if (!roles.includes(request.auth.user.role)) {
          throw new AppError(
            403,
            'FORBIDDEN',
            'Seu perfil não tem permissão para acessar este recurso.',
          )
        }
      },
  )
}

export function getAuthContext(request: FastifyRequest): AuthContext {
  if (!request.auth) {
    throw unauthenticated()
  }

  return request.auth
}
