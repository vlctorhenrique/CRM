import { and, eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../db/client.js'
import { cadenceEnrollments, cadenceTasks } from '../../db/schema/index.js'

export async function handleInboundCadenceEffects(
  db: AppDatabase,
  tenantId: string,
  leadId: string,
  now: Date,
  optOut: boolean,
): Promise<void> {
  const active = await db
    .select({ id: cadenceEnrollments.id })
    .from(cadenceEnrollments)
    .where(
      and(
        eq(cadenceEnrollments.tenantId, tenantId),
        eq(cadenceEnrollments.leadId, leadId),
        eq(cadenceEnrollments.status, 'active'),
      ),
    )

  if (active.length === 0) {
    return
  }

  await db
    .update(cadenceEnrollments)
    .set({
      status: optOut ? 'cancelled' : 'paused',
      pausedAt: optOut ? null : now,
      pauseReason: optOut ? null : 'Resposta humana recebida',
      cancelledAt: optOut ? now : null,
      cancelReason: optOut ? 'Opt-out recebido via WhatsApp' : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(cadenceEnrollments.tenantId, tenantId),
        eq(cadenceEnrollments.leadId, leadId),
        eq(cadenceEnrollments.status, 'active'),
      ),
    )

  await db
    .update(cadenceTasks)
    .set({ status: 'cancelled', lockedAt: null, updatedAt: now })
    .where(
      and(
        eq(cadenceTasks.tenantId, tenantId),
        eq(cadenceTasks.leadId, leadId),
        inArray(cadenceTasks.status, ['pending', 'processing']),
      ),
    )
}
