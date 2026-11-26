import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'
import { startAiWorker } from './modules/ai/ai.worker.js'
import { startCadenceWorker } from './modules/cadences/cadence.worker.js'

async function main(): Promise<void> {
  const config = loadConfig()
  const app = await buildApp({ config })

  await app.listen({ port: config.port, host: config.host })

  const cadenceWorker = startCadenceWorker({ db: app.db, config, log: app.log })
  const aiWorker = startAiWorker({ db: app.db, config, log: app.log })

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Encerrando API')
    await cadenceWorker.stop()
    await aiWorker.stop()
    await app.close()
    process.exit(0)
  }

  process.once('SIGINT', () => {
    void shutdown('SIGINT')
  })

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
}

main().catch((error: unknown) => {
  console.error('Falha ao iniciar a API:', error)
  process.exit(1)
})
