import { createHmac, randomUUID } from 'node:crypto'
import type { OutgoingHttpHeaders } from 'node:http'
import { fileURLToPath } from 'node:url'
import { DEFAULT_BUSINESS_HOURS, type UserRole } from '@crm/shared'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import type { AppConfig } from '../src/config/env.js'
import type { AppDatabase } from '../src/db/client.js'
import * as schema from '../src/db/schema/index.js'
import { hashPassword } from '../src/lib/crypto.js'

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))

export const TEST_PASSWORD = 'SenhaForte123'

export function testConfig(): AppConfig {
  return {
    env: 'test',
    port: 0,
    host: '127.0.0.1',
    databaseUrl: 'postgresql://unused:unused@localhost:5432/unused',
    redisUrl: null,
    jwtSecret: 'test-secret-with-at-least-thirty-two-characters',
    accessTokenTtlSeconds: 1800,
    refreshTokenTtlSeconds: 2_592_000,
    cookieSecure: false,
    cookieDomain: null,
    webOrigin: 'http://localhost:3000',
    trustProxy: false,
    logLevel: 'silent',
    enableApiDocs: false,
    devSimulatorEnabled: true,
    rateLimitMax: 1000,
    rateLimitWindow: '1 minute',
    cadenceWorkerEnabled: false,
    cadenceWorkerIntervalMs: 30_000,
    cadenceMaxAttempts: 3,
    aiMode: 'fallback',
    aiModel: null,
    aiApiKey: null,
    aiDailyLimit: 200,
    aiTimeoutMs: 15_000,
    version: 'test',
    whatsappMode: 'dry-run',
    whatsappVerifyToken: 'test-verify-token',
    whatsappAppSecret: 'test-app-secret',
    whatsappAccessToken: null,
    whatsappPhoneNumberId: 'test-phone-number-id',
    whatsappWabaId: null,
    whatsappApiVersion: 'v23.0',
    whatsappInitialMessage: 'Olá! Qual procedimento despertou seu interesse?',
  }
}

export interface TestContext {
  app: FastifyInstance
  db: AppDatabase
  close: () => Promise<void>
}

export async function createTestContext(): Promise<TestContext> {
  const client = new PGlite()
  const pgliteDb = drizzle(client, { schema })

  await migrate(pgliteDb, { migrationsFolder })

  const db = pgliteDb as unknown as AppDatabase
  const app = await buildApp({ config: testConfig(), db, redis: null })
  await app.ready()

  return {
    app,
    db,
    close: async () => {
      await app.close()
      await client.close()
    },
  }
}

export interface SeedTenantInput {
  name?: string
  slug?: string
}

export async function seedTenant(
  db: AppDatabase,
  input: SeedTenantInput = {},
): Promise<schema.TenantRecord> {
  const slug = input.slug ?? `clinica-${randomUUID().slice(0, 8)}`
  const now = new Date()

  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      id: randomUUID(),
      name: input.name ?? 'Clínica Teste',
      slug,
      timezone: 'America/Sao_Paulo',
      businessHours: DEFAULT_BUSINESS_HOURS,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!tenant) {
    throw new Error('Falha ao criar tenant de teste')
  }

  return tenant
}

export interface SeedUserInput {
  tenantId: string
  email?: string
  name?: string
  role?: UserRole
  password?: string
}

export async function seedUser(db: AppDatabase, input: SeedUserInput): Promise<schema.UserRecord> {
  const now = new Date()
  const passwordHash = await hashPassword(input.password ?? TEST_PASSWORD)

  const [user] = await db
    .insert(schema.users)
    .values({
      id: randomUUID(),
      tenantId: input.tenantId,
      name: input.name ?? 'Usuário Teste',
      email: (input.email ?? `user-${randomUUID().slice(0, 8)}@clinica.demo`).toLowerCase(),
      passwordHash,
      role: input.role ?? 'admin',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!user) {
    throw new Error('Falha ao criar usuário de teste')
  }

  return user
}

export interface SeedWhatsAppAccountInput {
  tenantId: string
  phoneNumberId?: string
  displayPhoneNumber?: string
  initialMessage?: string
}

export async function seedWhatsAppAccount(
  db: AppDatabase,
  input: SeedWhatsAppAccountInput,
): Promise<schema.WhatsAppAccountRecord> {
  const now = new Date()
  const [account] = await db
    .insert(schema.whatsappAccounts)
    .values({
      id: randomUUID(),
      tenantId: input.tenantId,
      phoneNumberId: input.phoneNumberId ?? 'test-phone-number-id',
      displayPhoneNumber: input.displayPhoneNumber ?? '+55 11 90000-0000',
      status: 'connected',
      initialMessage: input.initialMessage ?? 'Olá! Qual procedimento despertou seu interesse?',
      aiEnabled: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!account) {
    throw new Error('Falha ao criar conta WhatsApp de teste')
  }

  return account
}

export function signWebhookPayload(payload: string, secret = 'test-app-secret'): string {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
}

export function cookieHeaderFrom(response: { headers: OutgoingHttpHeaders }): string {
  const raw = response.headers['set-cookie']
  const values = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]

  return values.map((value) => String(value).split(';')[0]).join('; ')
}

export function cookieValueFrom(
  response: { headers: OutgoingHttpHeaders },
  name: string,
): string | null {
  const header = cookieHeaderFrom(response)
  const entries = header.split('; ')

  for (const entry of entries) {
    const separator = entry.indexOf('=')

    if (separator > 0 && entry.slice(0, separator) === name) {
      return entry.slice(separator + 1)
    }
  }

  return null
}

export async function loginAs(
  app: FastifyInstance,
  email: string,
  password = TEST_PASSWORD,
): Promise<{ statusCode: number; cookie: string; body: { user: { id: string } } }> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email, password },
  })

  return {
    statusCode: response.statusCode,
    cookie: cookieHeaderFrom(response),
    body: response.json(),
  }
}
