import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { loadConfig } from '../config/env.js'
import { createDatabase } from './client.js'
import * as schema from './schema/index.js'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder = path.resolve(currentDirectory, '../../drizzle')

async function main(): Promise<void> {
  const config = loadConfig()
  const { pool } = createDatabase(config.databaseUrl)
  const db = drizzle(pool, { schema })

  try {
    await migrate(db, { migrationsFolder })
    console.log('Migrações aplicadas com sucesso.')
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error('Falha ao aplicar migrações:', error)
  process.exitCode = 1
})
