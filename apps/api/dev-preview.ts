import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_BUSINESS_HOURS } from '@crm/shared'
import { PGlite } from '@electric-sql/pglite'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { buildApp } from './src/app.js'
import { toAppConfig } from './src/config/env.js'
import type { AppDatabase } from './src/db/client.js'
import * as schema from './src/db/schema/index.js'
import { hashPassword } from './src/lib/crypto.js'
import { ensureWhatsAppAccount } from './src/modules/whatsapp/whatsapp.service.js'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder = path.resolve(currentDirectory, 'drizzle')
const dataDirectory = path.resolve(
  currentDirectory,
  process.env.PREVIEW_DATA_DIR ?? '.pglite-preview',
)
const adminEmail = 'admin@clinica.demo'
const demoPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!'

interface PreviewAccountDefaults {
  phoneNumberId: string
  displayPhoneNumber: string
  initialMessage: string
}

async function seed(db: AppDatabase, accountDefaults: PreviewAccountDefaults): Promise<void> {
  const now = new Date()
  const slug = process.env.SEED_TENANT_SLUG ?? 'clinica-demo'

  let [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, slug))
    .limit(1)

  if (!tenant) {
    ;[tenant] = await db
      .insert(schema.tenants)
      .values({
        id: randomUUID(),
        name: 'Clínica Aurora',
        slug,
        timezone: 'America/Sao_Paulo',
        businessHours: DEFAULT_BUSINESS_HOURS,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
  }

  if (!tenant) {
    throw new Error('Não foi possível preparar a clínica de demonstração.')
  }

  const passwordHash = await hashPassword(demoPassword)
  const users = [
    { name: 'Administrador', email: adminEmail, role: 'admin' as const },
    { name: 'Gerente Demo', email: 'gerente@clinica.demo', role: 'manager' as const },
    { name: 'SDR Demo', email: 'sdr@clinica.demo', role: 'sdr' as const },
  ]

  for (const seedUser of users) {
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, seedUser.email))
      .limit(1)

    if (existing) {
      continue
    }

    await db.insert(schema.users).values({
      id: randomUUID(),
      tenantId: tenant.id,
      name: seedUser.name,
      email: seedUser.email,
      passwordHash,
      role: seedUser.role,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
  }

  const account = await ensureWhatsAppAccount(db, tenant.id, {
    phoneNumberId: accountDefaults.phoneNumberId,
    displayPhoneNumber: accountDefaults.displayPhoneNumber,
    status: 'connected',
    initialMessage: accountDefaults.initialMessage,
  })

  const [admin] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, adminEmail))
    .limit(1)

  const demoTemplates = [
    {
      name: 'Reengajamento 24h',
      body: 'Oi, {{nome}}! Passando para saber se você ainda tem interesse em {{procedimento}}. Posso te ajudar com os próximos passos?',
      variables: ['nome', 'procedimento'],
    },
    {
      name: 'Reengajamento 72h',
      body: '{{nome}}, reservei um horário especial para sua avaliação. Quer que eu te envie as opções?',
      variables: ['nome'],
    },
  ]
  const templateIds = new Map<string, string>()

  for (const template of demoTemplates) {
    const [existing] = await db
      .select({ id: schema.messageTemplates.id })
      .from(schema.messageTemplates)
      .where(
        and(
          eq(schema.messageTemplates.tenantId, tenant.id),
          eq(schema.messageTemplates.name, template.name),
        ),
      )
      .limit(1)

    if (existing) {
      templateIds.set(template.name, existing.id)
      continue
    }

    const templateId = randomUUID()
    await db.insert(schema.messageTemplates).values({
      id: templateId,
      tenantId: tenant.id,
      name: template.name,
      category: 'utility',
      language: 'pt_BR',
      body: template.body,
      variables: template.variables,
      status: 'approved',
      createdByUserId: admin?.id ?? null,
      createdAt: now,
      updatedAt: now,
    })
    templateIds.set(template.name, templateId)
  }

  const cadenceName = 'Reengajamento pós-consulta'
  const [existingCadence] = await db
    .select({ id: schema.cadences.id })
    .from(schema.cadences)
    .where(and(eq(schema.cadences.tenantId, tenant.id), eq(schema.cadences.name, cadenceName)))
    .limit(1)

  if (!existingCadence) {
    const cadenceId = randomUUID()
    await db.insert(schema.cadences).values({
      id: cadenceId,
      tenantId: tenant.id,
      name: cadenceName,
      description: 'Dois toques para retomar o interesse após a consulta.',
      status: 'active',
      createdByUserId: admin?.id ?? null,
      createdAt: now,
      updatedAt: now,
    })

    const firstTemplateId = templateIds.get('Reengajamento 24h')
    const secondTemplateId = templateIds.get('Reengajamento 72h')

    if (firstTemplateId && secondTemplateId) {
      await db.insert(schema.cadenceSteps).values([
        {
          id: randomUUID(),
          tenantId: tenant.id,
          cadenceId,
          templateId: firstTemplateId,
          position: 1,
          delayHours: 24,
          createdAt: now,
        },
        {
          id: randomUUID(),
          tenantId: tenant.id,
          cadenceId,
          templateId: secondTemplateId,
          position: 2,
          delayHours: 72,
          createdAt: now,
        },
      ])
    }
  }

  const [sdr] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, 'sdr@clinica.demo'))
    .limit(1)

  const [manager] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, 'gerente@clinica.demo'))
    .limit(1)

  const demoLeads = [
    {
      name: 'Mariana Souza',
      phone: '+5511998765432',
      status: 'waiting_sdr' as const,
      interest: 'Lipo de papada',
      ownerUserId: sdr?.id ?? null,
      messages: [
        {
          direction: 'inbound' as const,
          body: 'Olá! Queria saber mais sobre lipo de papada.',
          minutesAgo: 32,
        },
        {
          direction: 'outbound' as const,
          body: initialMessage,
          minutesAgo: 31,
          status: 'read' as const,
        },
        {
          direction: 'inbound' as const,
          body: 'Tenho interesse sim. Quais horários vocês têm?',
          minutesAgo: 8,
        },
      ],
    },
    {
      name: 'Camila Ferreira',
      phone: '+5511987654321',
      status: 'human_service' as const,
      interest: 'Criolipólise',
      ownerUserId: sdr?.id ?? null,
      messages: [
        {
          direction: 'inbound' as const,
          body: 'Oi, boa tarde! Vi sobre criolipólise.',
          minutesAgo: 75,
        },
        {
          direction: 'outbound' as const,
          body: initialMessage,
          minutesAgo: 74,
          status: 'read' as const,
        },
        {
          direction: 'outbound' as const,
          body: 'Camila, posso te explicar como funciona a avaliação inicial. Você prefere manhã ou tarde?',
          minutesAgo: 20,
          status: 'delivered' as const,
          senderUserId: sdr?.id ?? null,
        },
      ],
    },
    {
      name: 'Juliana Lima',
      phone: '+5511976543210',
      status: 'scheduled' as const,
      interest: 'Botox',
      ownerUserId: manager?.id ?? null,
      messages: [
        {
          direction: 'inbound' as const,
          body: 'Bom dia! Gostaria de agendar uma avaliação.',
          minutesAgo: 1500,
        },
        {
          direction: 'outbound' as const,
          body: initialMessage,
          minutesAgo: 1499,
          status: 'read' as const,
        },
        {
          direction: 'outbound' as const,
          body: 'Perfeito, Juliana! Seu horário está reservado para quinta-feira às 14h.',
          minutesAgo: 1440,
          status: 'read' as const,
          senderUserId: manager?.id ?? null,
        },
      ],
    },
    {
      name: 'Rafael Almeida',
      phone: '+5511965432109',
      status: 'new' as const,
      interest: 'Avaliação corporal',
      ownerUserId: null,
      messages: [],
    },
  ]

  for (const demo of demoLeads) {
    const [existingLead] = await db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(
        and(eq(schema.leads.tenantId, tenant.id), eq(schema.leads.phoneNormalized, demo.phone)),
      )
      .limit(1)

    if (existingLead) {
      continue
    }

    const leadId = randomUUID()
    const lastMessage = demo.messages.at(-1)
    const lastInbound = [...demo.messages]
      .reverse()
      .find((message) => message.direction === 'inbound')
    const createdAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

    await db.insert(schema.leads).values({
      id: leadId,
      tenantId: tenant.id,
      name: demo.name,
      phoneNormalized: demo.phone,
      phoneRaw: demo.phone,
      source: demo.messages.length > 0 ? 'whatsapp' : 'instagram',
      status: demo.status,
      ownerUserId: demo.ownerUserId,
      interestProcedure: demo.interest,
      consentStatus: 'unknown',
      consentEvidence:
        demo.messages.length > 0
          ? 'Contato iniciado pelo cliente no WhatsApp'
          : 'Cadastro manual de demonstração',
      lastContactAt: lastMessage
        ? new Date(now.getTime() - lastMessage.minutesAgo * 60 * 1000)
        : null,
      initialMessageSentAt:
        demo.messages.length > 1
          ? new Date(now.getTime() - (demo.messages[1]?.minutesAgo ?? 0) * 60 * 1000)
          : null,
      createdAt,
      updatedAt: now,
    })

    if (demo.messages.length === 0) {
      continue
    }

    const conversationId = randomUUID()
    const unreadCount = lastMessage?.direction === 'inbound' ? 1 : 0

    await db.insert(schema.conversations).values({
      id: conversationId,
      tenantId: tenant.id,
      leadId,
      whatsappAccountId: account.id,
      status: 'open',
      humanTakeover: demo.status === 'human_service',
      unreadCount,
      lastMessagePreview: lastMessage?.body.slice(0, 240) ?? null,
      lastMessageAt: lastMessage
        ? new Date(now.getTime() - lastMessage.minutesAgo * 60 * 1000)
        : null,
      lastInboundAt: lastInbound
        ? new Date(now.getTime() - lastInbound.minutesAgo * 60 * 1000)
        : null,
      createdAt,
      updatedAt: now,
    })

    for (const [index, message] of demo.messages.entries()) {
      const messageDate = new Date(now.getTime() - message.minutesAgo * 60 * 1000)

      await db.insert(schema.messages).values({
        id: randomUUID(),
        tenantId: tenant.id,
        conversationId,
        leadId,
        whatsappAccountId: account.id,
        direction: message.direction,
        type: 'text',
        status: message.direction === 'inbound' ? 'received' : (message.status ?? 'sent'),
        providerMessageId: `preview-${demo.phone.replace(/\D/g, '')}-${index}`,
        body: message.body,
        senderUserId: message.senderUserId ?? null,
        providerTimestamp: messageDate,
        createdAt: messageDate,
        updatedAt: messageDate,
      })
    }
  }
}

async function main(): Promise<void> {
  const whatsappMode = process.env.WHATSAPP_MODE ?? 'dry-run'
  const whatsappLive = whatsappMode === 'live'
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? 'preview-phone-number-id'
  const displayPhoneNumber = process.env.WHATSAPP_PHONE_NUMBER ?? '+55 11 99999-0000'
  const initialMessage =
    process.env.WHATSAPP_INITIAL_MESSAGE ??
    'Olá! Que bom ter você aqui. Para eu te ajudar melhor, qual procedimento ou tratamento despertou seu interesse?'
  const config = toAppConfig({
    NODE_ENV: 'development',
    API_PORT: process.env.API_PORT ?? '3333',
    API_HOST: '127.0.0.1',
    DATABASE_URL: 'postgresql://preview:preview@localhost:5432/preview',
    JWT_SECRET: 'preview-local-secret-with-at-least-thirty-two-characters',
    COOKIE_SECURE: 'false',
    WEB_ORIGIN: 'http://localhost:3000,http://127.0.0.1:3000',
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
    ENABLE_API_DOCS: 'true',
    ENABLE_DEV_SIMULATOR: 'true',
    CADENCE_WORKER_ENABLED: 'false',
    RATE_LIMIT_MAX: '1000',
    APP_VERSION: '0.1.0-preview',
    WHATSAPP_MODE: whatsappMode,
    WHATSAPP_VERIFY_TOKEN: whatsappLive
      ? process.env.WHATSAPP_VERIFY_TOKEN
      : (process.env.WHATSAPP_VERIFY_TOKEN ?? 'preview-verify-token'),
    WHATSAPP_APP_SECRET: whatsappLive
      ? process.env.WHATSAPP_APP_SECRET
      : (process.env.WHATSAPP_APP_SECRET ?? 'preview-app-secret'),
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: whatsappLive ? process.env.WHATSAPP_PHONE_NUMBER_ID : phoneNumberId,
    WHATSAPP_WABA_ID: process.env.WHATSAPP_WABA_ID,
    WHATSAPP_INITIAL_MESSAGE: initialMessage,
  })

  const client = new PGlite(dataDirectory)
  const pgliteDb = drizzle(client, { schema })

  await migrate(pgliteDb, { migrationsFolder })

  const db = pgliteDb as unknown as AppDatabase

  await seed(db, { phoneNumberId, displayPhoneNumber, initialMessage })

  const app = await buildApp({ config, db, redis: null })

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Encerrando prévia da API')
    await app.close()
    await client.close()
    process.exit(0)
  }

  process.once('SIGINT', () => {
    void shutdown('SIGINT')
  })

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM')
  })

  await app.listen({ port: config.port, host: config.host })

  app.log.info(
    {
      url: `http://localhost:${config.port}`,
      docs: `http://localhost:${config.port}/docs`,
      login: adminEmail,
      dataDirectory,
    },
    'Prévia local pronta. Use a senha de demonstração configurada.',
  )
}

main().catch((error: unknown) => {
  console.error('Falha ao iniciar a prévia da API:', error)
  process.exitCode = 1
})
