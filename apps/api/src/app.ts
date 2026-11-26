import type { ApiErrorBody } from '@crm/shared'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'
import type { Pool } from 'pg'
import { type AppConfig, loadConfig } from './config/env.js'
import { type AppDatabase, createDatabase } from './db/client.js'
import { createRedis } from './db/redis.js'
import { AppError } from './lib/errors.js'
import { registerAppointmentRoutes } from './modules/appointments/appointments.routes.js'
import { registerAuthRoutes } from './modules/auth/auth.routes.js'
import { registerCadenceRoutes } from './modules/cadences/cadences.routes.js'
import { registerConversationRoutes } from './modules/conversations/conversations.routes.js'
import { registerDashboardRoutes } from './modules/dashboard/dashboard.routes.js'
import { registerDevRoutes } from './modules/dev/dev.routes.js'
import { registerHealthRoutes } from './modules/health/health.routes.js'
import { registerLeadRoutes } from './modules/leads/leads.routes.js'
import { registerTemplateRoutes } from './modules/templates/templates.routes.js'
import { registerTenantRoutes } from './modules/tenants/tenants.routes.js'
import { registerUsersRoutes } from './modules/users/users.routes.js'
import { registerWhatsAppWebhookRoutes } from './modules/whatsapp/webhook.routes.js'
import { registerWhatsAppRoutes } from './modules/whatsapp/whatsapp.routes.js'
import { registerAuth } from './plugins/auth.js'

export interface BuildAppOptions {
  config?: AppConfig
  db?: AppDatabase
  pool?: Pool
  redis?: Redis | null
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig()
  const ownsDatabase = !options.db && !options.pool
  const ownsRedis = options.redis === undefined

  let db = options.db
  let pool = options.pool ?? null

  if (!db) {
    const connection = createDatabase(config.databaseUrl)
    db = connection.db
    pool = connection.pool
  }

  let redis: Redis | null = options.redis ?? null

  if (ownsRedis && config.redisUrl) {
    redis = createRedis(config.redisUrl)
  }

  const allowedOrigins = config.webOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  const loggerOptions =
    config.env === 'test'
      ? { level: 'error' }
      : {
          level: config.logLevel,
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              'password',
              '*.password',
              '*.token',
            ],
            censor: '[redacted]',
          },
          ...(config.env === 'development'
            ? {
                transport: {
                  target: 'pino-pretty',
                  options: {
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                  },
                },
              }
            : {}),
        }

  const app = Fastify({
    logger: loggerOptions,
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
    requestIdHeader: 'x-request-id',
  })

  app.decorate('config', config)
  app.decorate('db', db)
  app.decorate('redis', redis)

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const rawBody = typeof body === 'string' ? body : body.toString('utf8')
    request.rawBody = rawBody

    try {
      done(null, JSON.parse(rawBody))
    } catch {
      done(new AppError(400, 'INVALID_JSON', 'O corpo da requisição não é um JSON válido.'))
    }
  })

  await app.register(cookie)

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  })

  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    maxAge: 600,
  })

  await app.register(rateLimit, {
    global: true,
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
    allowList: (request) => request.url === '/health',
  })

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'CRM Clínicas API',
        description: 'API do CRM para clínicas de estética e emagrecimento.',
        version: config.version,
      },
      components: {
        securitySchemes: {
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'crm_access',
          },
        },
      },
    },
  })

  app.addHook('onRequest', async (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.origin

      if (origin && !allowedOrigins.includes(origin)) {
        throw new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Origem da requisição não permitida.')
      }
    }
  })

  await registerAuth(app)

  await registerHealthRoutes(app)
  await registerAuthRoutes(app)
  await registerUsersRoutes(app)
  await registerTenantRoutes(app)
  await registerTemplateRoutes(app)
  await registerCadenceRoutes(app)
  await registerLeadRoutes(app)
  await registerAppointmentRoutes(app)
  await registerConversationRoutes(app)
  await registerDashboardRoutes(app)
  await registerWhatsAppRoutes(app)
  await registerWhatsAppWebhookRoutes(app)
  await registerDevRoutes(app)

  if (config.enableApiDocs) {
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    })
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      const body: ApiErrorBody = {
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
        },
      }

      if (error.details !== undefined) {
        body.error.details = error.details
      }

      return reply.status(error.statusCode).send(body)
    }

    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500

    if (statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Muitas tentativas. Aguarde alguns instantes e tente novamente.',
          requestId: request.id,
        },
      } satisfies ApiErrorBody)
    }

    if (statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({
        error: {
          code: 'BAD_REQUEST',
          message: 'Não foi possível processar a requisição.',
          requestId: request.id,
        },
      } satisfies ApiErrorBody)
    }

    request.log.error({ err: error }, 'Erro não tratado')

    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Erro interno. Tente novamente em instantes.',
        requestId: request.id,
      },
    } satisfies ApiErrorBody)
  })

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Recurso não encontrado.',
      },
    } satisfies ApiErrorBody)
  })

  app.addHook('onClose', async () => {
    if (ownsDatabase && pool) {
      await pool.end()
    }

    if (ownsRedis && redis) {
      redis.disconnect()
    }
  })

  return app
}
