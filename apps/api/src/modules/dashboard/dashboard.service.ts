import type { AuthUser, DashboardSummary } from '@crm/shared'
import { and, count, eq, gt, gte } from 'drizzle-orm'
import type { AppDatabase } from '../../db/client.js'
import { conversations, leads, messages } from '../../db/schema/index.js'

const IN_SERVICE_STATUSES: Array<(typeof leads.status.enumValues)[number]> = [
  'first_contact',
  'qualifying',
  'human_service',
]

export async function getDashboardSummary(
  db: AppDatabase,
  user: AuthUser,
  tenantId: string,
): Promise<DashboardSummary> {
  const leadConditions = [eq(leads.tenantId, tenantId)]

  if (user.role === 'sdr') {
    leadConditions.push(eq(leads.ownerUserId, user.id))
  }

  const leadWhere = and(...leadConditions)

  const statusRows = await db
    .select({ status: leads.status, total: count() })
    .from(leads)
    .where(leadWhere)
    .groupBy(leads.status)

  const statusCounts = new Map<string, number>()

  for (const row of statusRows) {
    statusCounts.set(row.status, Number(row.total))
  }

  const totalLeads = [...statusCounts.values()].reduce((sum, value) => sum + value, 0)
  const inService = IN_SERVICE_STATUSES.reduce(
    (sum, status) => sum + (statusCounts.get(status) ?? 0),
    0,
  )
  const waitingSdr = statusCounts.get('waiting_sdr') ?? 0
  const scheduled = statusCounts.get('scheduled') ?? 0
  const lost = statusCounts.get('lost') ?? 0

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [newRow] = await db
    .select({ total: count() })
    .from(leads)
    .where(and(leadWhere, gte(leads.createdAt, sevenDaysAgo)))

  const conversationConditions = [eq(conversations.tenantId, tenantId)]

  if (user.role === 'sdr') {
    conversationConditions.push(eq(conversations.leadId, leads.id))
    conversationConditions.push(eq(leads.ownerUserId, user.id))
  }

  const [unreadRow] = await db
    .select({ total: count() })
    .from(conversations)
    .leftJoin(leads, eq(conversations.leadId, leads.id))
    .where(and(...conversationConditions, gt(conversations.unreadCount, 0)))

  const messageConditions = [
    eq(messages.tenantId, tenantId),
    eq(messages.direction, 'outbound'),
    gte(messages.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
  ]

  const [sentRow] = await db
    .select({ total: count() })
    .from(messages)
    .where(and(...messageConditions))

  return {
    totalLeads,
    newLeads: Number(newRow?.total ?? 0),
    inService,
    waitingSdr,
    scheduled,
    lost,
    unreadConversations: Number(unreadRow?.total ?? 0),
    messagesSentToday: Number(sentRow?.total ?? 0),
    conversionRate: totalLeads > 0 ? Math.round((scheduled / totalLeads) * 1000) / 10 : 0,
  }
}
