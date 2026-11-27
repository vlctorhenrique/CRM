import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext, testConfig } from './helpers.js'

describe('saúde e erros da API', () => {
  let ctx: TestContext

  beforeAll(async () => {
    ctx = await createTestContext()
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('reporta banco disponível e Redis desativado', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json().checks).toEqual({
      database: 'ok',
      redis: 'disabled',
    })
    expect(response.json().status).toBe('ok')
    expect(response.json().backlog).toEqual({
      cadenceTasksPending: 0,
      cadenceTasksStale: 0,
      aiInsightsPending: 0,
    })
  })

  it('retorna 404 em formato padronizado', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/v1/inexistente' })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('NOT_FOUND')
  })

  it('monitora idade e status do backup quando configurado', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'crm-backup-'))
    const file = path.join(directory, 'last-backup.json')
    const backupCtx = await createTestContext({
      ...testConfig(),
      backupStatusFile: file,
      backupStaleHours: 26,
    })

    try {
      writeFileSync(file, JSON.stringify({ status: 'ok', at: new Date().toISOString() }))
      const fresh = await backupCtx.app.inject({ method: 'GET', url: '/health' })
      expect(fresh.json().backup).toMatchObject({
        configured: true,
        lastStatus: 'ok',
        stale: false,
      })

      writeFileSync(
        file,
        JSON.stringify({ status: 'ok', at: new Date(Date.now() - 48 * 3_600_000).toISOString() }),
      )
      const stale = await backupCtx.app.inject({ method: 'GET', url: '/health' })
      expect(stale.json().backup.stale).toBe(true)

      writeFileSync(file, JSON.stringify({ status: 'failed', at: new Date().toISOString() }))
      const failed = await backupCtx.app.inject({ method: 'GET', url: '/health' })
      expect(failed.json().backup.lastStatus).toBe('failed')
      expect(failed.json().backup.stale).toBe(true)
    } finally {
      await backupCtx.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
