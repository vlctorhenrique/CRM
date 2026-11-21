import { randomUUID } from 'node:crypto'
import { DEFAULT_BUSINESS_HOURS, type UserRole } from '@crm/shared'
import { and, eq } from 'drizzle-orm'
import { hashPassword } from '../lib/crypto.js'
import { ensureWhatsAppAccount } from '../modules/whatsapp/whatsapp.service.js'
import { createDatabase } from './client.js'
import { tenants, users } from './schema/index.js'

interface SeedUser {
  name: string
  email: string
  role: UserRole
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL é obrigatória para executar o seed.')
  }

  const tenantSlug = process.env.SEED_TENANT_SLUG ?? 'clinica-demo'
  const tenantName = process.env.SEED_TENANT_NAME ?? 'Clínica Aurora'
  const adminName = process.env.SEED_ADMIN_NAME ?? 'Administrador'
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@clinica.demo'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD
  const createDemoUsers = process.env.SEED_DEMO_USERS !== 'false'
  const isProduction = process.env.NODE_ENV === 'production'

  if (!adminPassword) {
    throw new Error('Defina SEED_ADMIN_PASSWORD antes de executar o seed.')
  }

  if (isProduction && adminPassword.length < 12) {
    throw new Error('Em produção, SEED_ADMIN_PASSWORD deve ter ao menos 12 caracteres.')
  }

  const { db, pool } = createDatabase(databaseUrl)

  try {
    let [tenant] = await db.select().from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1)

    if (!tenant) {
      const now = new Date()
      ;[tenant] = await db
        .insert(tenants)
        .values({
          id: randomUUID(),
          name: tenantName,
          slug: tenantSlug,
          timezone: 'America/Sao_Paulo',
          businessHours: DEFAULT_BUSINESS_HOURS,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      console.log(`Clínica "${tenantName}" criada.`)
    } else {
      console.log(`Clínica "${tenant.name}" já existe.`)
    }

    if (!tenant) {
      throw new Error('N�o foi poss�vel criar ou localizar a cl�nica.')
    }

    await ensureWhatsAppAccount(db, tenant.id, {
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? `pending-${tenant.id}`,
      displayPhoneNumber: process.env.WHATSAPP_PHONE_NUMBER ?? 'Não configurado',
      status: process.env.WHATSAPP_PHONE_NUMBER_ID ? 'connected' : 'disconnected',
      initialMessage:
        process.env.WHATSAPP_INITIAL_MESSAGE ??
        'Olá! Que bom ter você aqui. Para eu te ajudar melhor, qual procedimento ou tratamento despertou seu interesse?',
    })

    const usersToSeed: SeedUser[] = [
      { name: adminName, email: adminEmail.toLowerCase(), role: 'admin' },
    ]

    if (createDemoUsers) {
      usersToSeed.push(
        { name: 'Gerente Demo', email: 'gerente@clinica.demo', role: 'manager' },
        { name: 'SDR Demo', email: 'sdr@clinica.demo', role: 'sdr' },
      )
    }

    for (const seedUser of usersToSeed) {
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.tenantId, tenant.id), eq(users.email, seedUser.email)))
        .limit(1)

      if (existing) {
        console.log(`Usuário ${seedUser.email} já existe.`)
        continue
      }

      const now = new Date()
      const passwordHash = await hashPassword(adminPassword)

      await db.insert(users).values({
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

      console.log(`Usuário ${seedUser.email} criado com perfil ${seedUser.role}.`)
    }

    console.log('Seed concluído. A senha não é exibida por segurança.')
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error('Falha ao executar o seed:', error)
  process.exitCode = 1
})
