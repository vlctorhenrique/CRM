import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'

async function main(): Promise<void> {
  const config = loadConfig()
  const app = await buildApp({ config })

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Encerrando API')
    await app.close()
    process.exit(0)
  }

  process.once('SIGINT', () => {
    void shutdown('SIGINT')
  })

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM')
  })

  await app.listen({ port: config.port, host: config.host })
}

main().catch((error: unknown) => {
  console.error('Falha ao iniciar a API:', error)
  process.exit(1)
})
