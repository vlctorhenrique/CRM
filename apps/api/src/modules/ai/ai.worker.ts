import type { AppConfig } from '../../config/env.js'
import type { AppDatabase } from '../../db/client.js'
import { processAiInsights } from './ai.service.js'

const DEFAULT_INTERVAL_MS = 60_000

export function startAiWorker(options: {
  db: AppDatabase
  config: AppConfig
  log: {
    info: (value: object, message: string) => void
    error: (value: object, message: string) => void
  }
  intervalMs?: number
}): { stop: () => Promise<void> } {
  if (options.config.aiMode === 'off') {
    return { stop: async () => {} }
  }

  let running = false

  const tick = async (): Promise<void> => {
    if (running) {
      return
    }

    running = true

    try {
      const result = await processAiInsights(options.db, options.config)
      options.log.info(result, 'Worker de IA concluiu execução')
    } catch (error) {
      options.log.error({ error: String(error) }, 'Falha no worker de IA')
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => {
    void tick()
  }, options.intervalMs ?? DEFAULT_INTERVAL_MS)

  return {
    stop: async () => {
      clearInterval(timer)
    },
  }
}
