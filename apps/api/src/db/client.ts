import { drizzle } from 'drizzle-orm/node-postgres'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'
import * as schema from './schema/index.js'

export type AppDatabase = PgDatabase<PgQueryResultHKT, typeof schema>

export interface DatabaseConnection {
  db: AppDatabase
  pool: Pool
}

export function createDatabase(connectionString: string): DatabaseConnection {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })

  const db = drizzle(pool, { schema })

  return { db, pool }
}
