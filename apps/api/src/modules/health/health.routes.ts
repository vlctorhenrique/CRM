import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { HealthResponse } from '@crm/shared'
import { and, count, eq, isNull, lt, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { aiInsights, cadenceTasks } from '../../db/schema/index.js'

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

function readBackupStatus(app: FastifyInstance): NonNullable<HealthResponse['backup']> {
  const file = app.config.backupStatusFile

  if (!file) {
    return {
      configured: false,
      lastRunAt: null,
      lastStatus: 'unknown',
      ageHours: null,
      stale: false,
    }
  }

  try {
    const parsed = JSON.parse(readFileSync(path.resolve(process.cwd(), file), 'utf8')) as {
      status?: unknown
      at?: unknown
    }
    const lastRunAt =
      typeof parsed.at === 'string' && !Number.isNaN(Date.parse(parsed.at)) ? parsed.at : null
    const lastStatus =
      parsed.status === 'ok' || parsed.status === 'failed' ? parsed.status : 'unknown'
    const ageHours = lastRunAt
      ? Math.round(((Date.now() - Date.parse(lastRunAt)) / 3_600_000) * 10) / 10
      : null

    return {
      configured: true,
      lastRunAt,
      lastStatus,
      ageHours,
      stale: lastStatus !== 'ok' || ageHours === null || ageHours > app.config.backupStaleHours,
    }
  } catch {
    return {
      configured: true,
      lastRunAt: null,
      lastStatus: 'unknown',
      ageHours: null,
      stale: true,
    }
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
      const staleBefore = new Date(Date.now() - 60_000)

      const [taskRow] = await app.db
        .select({ total: count() })
        .from(cadenceTasks)
        .where(eq(cadenceTasks.status, 'pending'))
      const [staleRow] = await app.db
        .select({ total: count() })
        .from(cadenceTasks)
        .where(
          and(
            eq(cadenceTasks.status, 'processing'),
            or(isNull(cadenceTasks.lockedAt), lt(cadenceTasks.lockedAt, staleBefore)),
          ),
        )
      const [insightRow] = await app.db
        .select({ total: count() })
        .from(aiInsights)
        .where(eq(aiInsights.status, 'pending'))

      const body: HealthResponse = {
        status: healthy ? 'ok' : 'degraded',
        version: app.config.version,
        uptimeSeconds: Math.round(process.uptime()),
        checks: { database, redis },
        backlog: {
          cadenceTasksPending: Number(taskRow?.total ?? 0),
          cadenceTasksStale: Number(staleRow?.total ?? 0),
          aiInsightsPending: Number(insightRow?.total ?? 0),
        },
        backup: readBackupStatus(app),
        timestamp: new Date().toISOString(),
      }

      return reply.status(healthy ? 200 : 503).send(body)
    },
  )
}
