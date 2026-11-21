import type { AuthUser, TenantSummary, UserRole } from '@crm/shared'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Redis } from 'ioredis'
import type { AppConfig } from '../config/env.js'
import type { AppDatabase } from '../db/client.js'

export interface AuthContext {
  user: AuthUser
  tenant: TenantSummary
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null
    rawBody?: string
  }

  interface FastifyInstance {
    config: AppConfig
    db: AppDatabase
    redis: Redis | null
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireRole: (
      roles: readonly UserRole[],
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}
