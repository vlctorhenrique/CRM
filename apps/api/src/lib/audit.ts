import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../db/client.js'
import { auditLogs } from '../db/schema/index.js'

export interface AuditInput {
  tenantId: string
  actorUserId: string | null
  action: string
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown> | null
  ip?: string | null
  userAgent?: string | null
}

export async function recordAudit(db: AppDatabase, input: AuditInput): Promise<void> {
  await db.insert(auditLogs).values({
    id: randomUUID(),
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  })
}
