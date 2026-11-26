import type {
  MarkNotificationsReadInput,
  NotificationListResponse,
  NotificationView,
} from '@crm/shared'
import { and, count, eq, inArray, isNull } from 'drizzle-orm'
import type { AppDatabase } from '../../db/client.js'
import { notifications } from '../../db/schema/index.js'
import { AppError } from '../../lib/errors.js'

function toView(row: typeof notifications.$inferSelect): NotificationView {
  return {
    id: row.id,
    type: row.type as NotificationView['type'],
    title: row.title,
    body: row.body,
    entityType: row.entityType,
    entityId: row.entityId,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listNotifications(
  db: AppDatabase,
  tenantId: string,
  userId: string,
  filters: {
    unreadOnly?: boolean | undefined
    limit: number
    offset: number
  },
): Promise<NotificationListResponse> {
  const conditions = [eq(notifications.tenantId, tenantId), eq(notifications.userId, userId)]

  if (filters.unreadOnly) {
    conditions.push(isNull(notifications.readAt))
  }

  const where = and(...conditions)
  const [totalRow] = await db.select({ total: count() }).from(notifications).where(where)
  const [unreadRow] = await db
    .select({ total: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    )
  const rows = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(notifications.createdAt)
    .limit(filters.limit)
    .offset(filters.offset)

  return {
    items: rows.map(toView),
    total: Number(totalRow?.total ?? 0),
    unreadCount: Number(unreadRow?.total ?? 0),
  }
}

export async function getUnreadCount(
  db: AppDatabase,
  tenantId: string,
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    )

  return Number(row?.total ?? 0)
}

export async function markNotificationsRead(
  db: AppDatabase,
  tenantId: string,
  userId: string,
  input: MarkNotificationsReadInput,
): Promise<number> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
        inArray(notifications.id, input.ids),
      ),
    )

  if (rows.length === 0) {
    throw new AppError(404, 'NOTIFICATIONS_NOT_FOUND', 'Nenhuma notificação encontrada.')
  }

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
        inArray(
          notifications.id,
          rows.map((row) => row.id),
        ),
      ),
    )

  return rows.length
}
