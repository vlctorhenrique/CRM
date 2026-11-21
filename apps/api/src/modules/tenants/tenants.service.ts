import type { BusinessHours, TenantSummary, UpdateTenantInput } from '@crm/shared'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../db/client.js'
import { tenants } from '../../db/schema/index.js'
import { recordAudit } from '../../lib/audit.js'
import { AppError, notFound } from '../../lib/errors.js'
import { toTenantSummary } from '../../lib/session.js'

export interface AuditMetadata {
  ip: string | null
  userAgent: string | null
}

function assertValidTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format(new Date())
  } catch {
    throw new AppError(422, 'INVALID_TIMEZONE', 'Fuso horário inválido.')
  }
}

export async function getCurrentTenant(db: AppDatabase, tenantId: string): Promise<TenantSummary> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)

  if (!tenant) {
    throw notFound('Clínica não encontrada.')
  }

  return toTenantSummary(tenant)
}

export async function updateCurrentTenant(
  db: AppDatabase,
  tenantId: string,
  actorUserId: string,
  input: UpdateTenantInput,
  metadata: AuditMetadata,
): Promise<TenantSummary> {
  const changes: Partial<typeof tenants.$inferInsert> = {
    updatedAt: new Date(),
  }

  if (input.name !== undefined) {
    changes.name = input.name
  }

  if (input.timezone !== undefined) {
    assertValidTimezone(input.timezone)
    changes.timezone = input.timezone
  }

  if (input.businessHours !== undefined) {
    changes.businessHours = input.businessHours
  }

  const [updated] = await db
    .update(tenants)
    .set(changes)
    .where(eq(tenants.id, tenantId))
    .returning()

  if (!updated) {
    throw notFound('Clínica não encontrada.')
  }

  await recordAudit(db, {
    tenantId,
    actorUserId,
    action: 'tenant.updated',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: { fields: Object.keys(input) },
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  })

  return toTenantSummary({ ...updated, businessHours: updated.businessHours as BusinessHours })
}
