import type { AuthUser } from '@crm/shared'
import { and, eq } from 'drizzle-orm'
import type { AppConfig } from '../../config/env.js'
import type { AppDatabase } from '../../db/client.js'
import { conversations } from '../../db/schema/index.js'
import { enqueueAiInsight } from './ai.service.js'

const systemUser = {
  id: 'system',
  name: 'Sistema',
  email: 'system@crm.local',
  role: 'admin',
  status: 'active',
  lastLoginAt: null,
  createdAt: new Date(0).toISOString(),
} satisfies AuthUser

export async function handleInboundAi(
  db: AppDatabase,
  config: AppConfig,
  tenantId: string,
  leadId: string,
  messageId: string,
): Promise<void> {
  if (config.aiMode === 'off') {
    return
  }

  const [conversation] = await db
    .select({ id: conversations.id, aiEnabled: conversations.aiEnabled })
    .from(conversations)
    .where(and(eq(conversations.tenantId, tenantId), eq(conversations.leadId, leadId)))
    .limit(1)

  if (!conversation?.aiEnabled) {
    return
  }

  await enqueueAiInsight(
    db,
    { user: systemUser },
    tenantId,
    leadId,
    'extraction',
    config,
    messageId,
  )
}
