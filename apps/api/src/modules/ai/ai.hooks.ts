import type { AuthUser } from '@crm/shared'
import type { AppConfig } from '../../config/env.js'
import type { AppDatabase } from '../../db/client.js'
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
