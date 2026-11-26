import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './helpers.js'

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
})
