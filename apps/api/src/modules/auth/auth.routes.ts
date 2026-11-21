import { changePasswordSchema, loginSchema } from '@crm/shared'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  clearAuthCookies,
  REFRESH_COOKIE,
  setAccessCookie,
  setRefreshCookie,
} from '../../lib/cookies.js'
import { unauthenticated } from '../../lib/errors.js'
import { parseInput } from '../../lib/validation.js'
import { getAuthContext } from '../../plugins/auth.js'
import { changeOwnPassword, login, logout, refreshSession } from './auth.service.js'

function metadataFrom(request: FastifyRequest): { ip: string; userAgent: string | null } {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'] ?? null,
  }
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/v1/auth/login',
    {
      config: {
        rateLimit: {
          max: app.config.env === 'test' ? 1000 : 10,
          timeWindow: '5 minutes',
        },
      },
      schema: {
        tags: ['Autenticação'],
        summary: 'Autentica um usuário',
      },
    },
    async (request, reply) => {
      const input = parseInput(loginSchema, request.body)
      const result = await login({ db: app.db, config: app.config }, input, metadataFrom(request))

      setAccessCookie(reply, app.config, result.accessToken, result.accessTokenExpiresAt)
      setRefreshCookie(reply, app.config, result.refreshToken, result.refreshTokenExpiresAt)

      return reply.status(200).send(result.session)
    },
  )

  app.post(
    '/v1/auth/refresh',
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '5 minutes',
        },
      },
      schema: {
        tags: ['Autenticação'],
        summary: 'Renova o token de acesso',
      },
    },
    async (request, reply) => {
      const refreshToken = request.cookies[REFRESH_COOKIE]

      if (!refreshToken) {
        throw unauthenticated()
      }

      try {
        const result = await refreshSession({ db: app.db, config: app.config }, refreshToken)
        setAccessCookie(reply, app.config, result.accessToken, result.accessTokenExpiresAt)
        return reply.status(200).send(result.session)
      } catch (error) {
        clearAuthCookies(reply, app.config)
        throw error
      }
    },
  )

  app.post(
    '/v1/auth/logout',
    {
      schema: {
        tags: ['Autenticação'],
        summary: 'Encerra a sessão atual',
      },
    },
    async (request, reply) => {
      await logout(
        { db: app.db, config: app.config },
        request.cookies[REFRESH_COOKIE],
        metadataFrom(request),
      )
      clearAuthCookies(reply, app.config)
      return reply.status(204).send()
    },
  )

  app.post(
    '/v1/auth/change-password',
    {
      preHandler: app.authenticate,
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '15 minutes',
        },
      },
      schema: {
        tags: ['Autenticação'],
        summary: 'Altera a senha do usuário autenticado',
      },
    },
    async (request, reply) => {
      const auth = getAuthContext(request)
      const input = parseInput(changePasswordSchema, request.body)

      await changeOwnPassword(
        { db: app.db },
        auth.user.id,
        auth.tenant.id,
        request.cookies[REFRESH_COOKIE],
        input,
        metadataFrom(request),
      )

      return reply.status(204).send()
    },
  )

  app.get(
    '/v1/auth/me',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Autenticação'],
        summary: 'Retorna o usuário e a clínica da sessão',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = getAuthContext(request)
      return reply.send({ user: auth.user, tenant: auth.tenant })
    },
  )
}
