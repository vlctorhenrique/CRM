import type { HealthResponse } from '@crm/shared'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Tempo esgotado')), timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function checkRedis(app: FastifyInstance): Promise<'ok' | 'disabled' | 'error'> {
  if (!app.redis) {
    return 'disabled'
  }

  try {
    if (app.redis.status === 'wait') {
      await withTimeout(app.redis.connect(), 1500)
    }

    await withTimeout(app.redis.ping(), 1500)
    return 'ok'
  } catch {
    return 'error'
  }
}

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      schema: {
        tags: ['Sistema'],
        summary: 'Verifica a saúde da API',
      },
    },
    async (_request, reply) => {
      let database: 'ok' | 'error' = 'ok'

      try {
        await withTimeout(app.db.execute(sql`select 1`), 3000)
      } catch {
        database = 'error'
      }

      const redis = await checkRedis(app)
      const healthy = database === 'ok'

      const body: HealthResponse = {
        status: healthy ? 'ok' : 'degraded',
        version: app.config.version,
        uptimeSeconds: Math.round(process.uptime()),
        checks: { database, redis },
        timestamp: new Date().toISOString(),
      }

      return reply.status(healthy ? 200 : 503).send(body)
    },
  )
}
