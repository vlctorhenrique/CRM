import type { AuthUser, ConversationListResponse, ConversationView } from '@crm/shared'
import { and, count, desc, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../db/client.js'
import { conversations, leads, users } from '../../db/schema/index.js'

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

export async function listConversations(
  db: AppDatabase,
  user: AuthUser,
  tenantId: string,
  limit: number,
): Promise<ConversationListResponse> {
  const conditions = [eq(conversations.tenantId, tenantId)]

  if (user.role === 'sdr') {
    conditions.push(eq(leads.ownerUserId, user.id))
  }

  const where = and(...conditions)

  const [totalRow] = await db
    .select({ total: count() })
    .from(conversations)
    .innerJoin(leads, eq(conversations.leadId, leads.id))
    .where(where)

  const rows = await db
    .select({
      id: conversations.id,
      leadId: conversations.leadId,
      leadName: leads.name,
      phone: leads.phoneNormalized,
      status: conversations.status,
      humanTakeover: conversations.humanTakeover,
      aiEnabled: conversations.aiEnabled,
      unreadCount: conversations.unreadCount,
      lastMessagePreview: conversations.lastMessagePreview,
      lastMessageAt: conversations.lastMessageAt,
      lastInboundAt: conversations.lastInboundAt,
      assignedUserId: leads.ownerUserId,
      assignedUserName: users.name,
    })
    .from(conversations)
    .innerJoin(leads, eq(conversations.leadId, leads.id))
    .leftJoin(users, eq(leads.ownerUserId, users.id))
    .where(where)
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit)

  const items: ConversationView[] = rows.map((row) => ({
    id: row.id,
    leadId: row.leadId,
    leadName: row.leadName,
    phone: row.phone,
    status: row.status,
    humanTakeover: row.humanTakeover,
    aiEnabled: row.aiEnabled,
    unreadCount: row.unreadCount,
    lastMessagePreview: row.lastMessagePreview,
    lastMessageAt: toIso(row.lastMessageAt),
    lastInboundAt: toIso(row.lastInboundAt),
    assignedUserId: row.assignedUserId,
    assignedUserName: row.assignedUserName,
  }))

  return { items, total: Number(totalRow?.total ?? 0) }
}
