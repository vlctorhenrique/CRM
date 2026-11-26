import {
  AI_INSIGHT_STATUSES,
  APPOINTMENT_STATUSES,
  type BusinessHours,
  CADENCE_ENROLLMENT_STATUSES,
  CADENCE_STATUSES,
  CADENCE_TASK_STATUSES,
  CONSENT_STATUSES,
  CONVERSATION_STATUSES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  MESSAGE_DIRECTIONS,
  MESSAGE_STATUSES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_STATUSES,
  WHATSAPP_CONNECTION_STATUSES,
} from '@crm/shared'
import { relations } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const userRoleEnum = pgEnum('user_role', ['admin', 'manager', 'sdr'])
export const userStatusEnum = pgEnum('user_status', ['active', 'disabled'])
export const leadStatusEnum = pgEnum('lead_status', LEAD_STATUSES)
export const leadSourceEnum = pgEnum('lead_source', LEAD_SOURCES)
export const consentStatusEnum = pgEnum('consent_status', CONSENT_STATUSES)
export const conversationStatusEnum = pgEnum('conversation_status', CONVERSATION_STATUSES)
export const messageDirectionEnum = pgEnum('message_direction', MESSAGE_DIRECTIONS)
export const messageStatusEnum = pgEnum('message_status', MESSAGE_STATUSES)
export const whatsappConnectionStatusEnum = pgEnum(
  'whatsapp_connection_status',
  WHATSAPP_CONNECTION_STATUSES,
)
export const webhookEventStatusEnum = pgEnum('webhook_event_status', [
  'pending',
  'processed',
  'ignored',
  'failed',
])
export const appointmentStatusEnum = pgEnum('appointment_status', APPOINTMENT_STATUSES)
export const templateCategoryEnum = pgEnum('template_category', TEMPLATE_CATEGORIES)
export const templateStatusEnum = pgEnum('template_status', TEMPLATE_STATUSES)
export const cadenceStatusEnum = pgEnum('cadence_status', CADENCE_STATUSES)
export const cadenceEnrollmentStatusEnum = pgEnum(
  'cadence_enrollment_status',
  CADENCE_ENROLLMENT_STATUSES,
)
export const cadenceTaskStatusEnum = pgEnum('cadence_task_status', CADENCE_TASK_STATUSES)
export const aiInsightStatusEnum = pgEnum('ai_insight_status', AI_INSIGHT_STATUSES)

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    timezone: text('timezone').notNull(),
    businessHours: jsonb('business_hours').$type<BusinessHours>().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('tenants_slug_unique').on(table.slug)],
)

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull(),
    status: userStatusEnum('status').notNull().default('active'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_tenant_email_unique').on(table.tenantId, table.email),
    index('users_email_idx').on(table.email),
    index('users_tenant_idx').on(table.tenantId),
  ],
)

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('refresh_tokens_hash_unique').on(table.tokenHash),
    index('refresh_tokens_user_idx').on(table.userId),
  ],
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_tenant_created_idx').on(table.tenantId, table.createdAt),
    index('audit_logs_actor_idx').on(table.actorUserId),
  ],
)

export const whatsappAccounts = pgTable(
  'whatsapp_accounts',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    phoneNumberId: text('phone_number_id').notNull(),
    wabaId: text('waba_id'),
    displayPhoneNumber: text('display_phone_number').notNull(),
    status: whatsappConnectionStatusEnum('status').notNull().default('disconnected'),
    initialMessage: text('initial_message'),
    aiEnabled: boolean('ai_enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('whatsapp_accounts_phone_number_id_unique').on(table.phoneNumberId),
    index('whatsapp_accounts_tenant_idx').on(table.tenantId),
  ],
)

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name'),
    phoneNormalized: text('phone_normalized').notNull(),
    phoneRaw: text('phone_raw'),
    source: leadSourceEnum('source').notNull().default('manual'),
    status: leadStatusEnum('status').notNull().default('new'),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    interestProcedure: text('interest_procedure'),
    objective: text('objective'),
    bodyRegion: text('body_region'),
    previousTreatment: text('previous_treatment'),
    notes: text('notes'),
    consentStatus: consentStatusEnum('consent_status').notNull().default('unknown'),
    consentEvidence: text('consent_evidence'),
    consentAt: timestamp('consent_at', { withTimezone: true }),
    consentTextVersion: text('consent_text_version'),
    optOutAt: timestamp('opt_out_at', { withTimezone: true }),
    lastContactAt: timestamp('last_contact_at', { withTimezone: true }),
    initialMessageSentAt: timestamp('initial_message_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('leads_tenant_phone_unique').on(table.tenantId, table.phoneNormalized),
    index('leads_tenant_status_idx').on(table.tenantId, table.status),
    index('leads_tenant_owner_idx').on(table.tenantId, table.ownerUserId),
    index('leads_tenant_created_idx').on(table.tenantId, table.createdAt),
  ],
)

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    whatsappAccountId: uuid('whatsapp_account_id')
      .notNull()
      .references(() => whatsappAccounts.id, { onDelete: 'restrict' }),
    status: conversationStatusEnum('status').notNull().default('open'),
    humanTakeover: boolean('human_takeover').notNull().default(false),
    aiEnabled: boolean('ai_enabled').notNull().default(true),
    unreadCount: integer('unread_count').notNull().default(0),
    lastMessagePreview: text('last_message_preview'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('conversations_lead_account_unique').on(table.leadId, table.whatsappAccountId),
    index('conversations_tenant_last_message_idx').on(table.tenantId, table.lastMessageAt),
  ],
)

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    whatsappAccountId: uuid('whatsapp_account_id')
      .notNull()
      .references(() => whatsappAccounts.id, { onDelete: 'restrict' }),
    direction: messageDirectionEnum('direction').notNull(),
    type: text('type').notNull().default('text'),
    status: messageStatusEnum('status').notNull().default('pending'),
    providerMessageId: text('provider_message_id'),
    body: text('body'),
    senderUserId: uuid('sender_user_id').references(() => users.id, { onDelete: 'set null' }),
    errorMessage: text('error_message'),
    providerTimestamp: timestamp('provider_timestamp', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('messages_provider_message_id_unique').on(table.providerMessageId),
    index('messages_conversation_created_idx').on(table.conversationId, table.createdAt),
    index('messages_lead_idx').on(table.leadId),
    index('messages_tenant_idx').on(table.tenantId),
  ],
)

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('whatsapp'),
    eventKey: text('event_key').notNull(),
    eventType: text('event_type').notNull(),
    status: webhookEventStatusEnum('status').notNull().default('pending'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    error: text('error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('webhook_events_event_key_unique').on(table.eventKey),
    index('webhook_events_tenant_received_idx').on(table.tenantId, table.receivedAt),
    index('webhook_events_status_idx').on(table.status),
  ],
)

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    procedure: text('procedure'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull().default(60),
    status: appointmentStatusEnum('status').notNull().default('scheduled'),
    notes: text('notes'),
    cancellationReason: text('cancellation_reason'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('appointments_tenant_scheduled_idx').on(table.tenantId, table.scheduledAt),
    index('appointments_tenant_status_idx').on(table.tenantId, table.status),
    index('appointments_lead_idx').on(table.leadId),
  ],
)

export const messageTemplates = pgTable(
  'message_templates',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: templateCategoryEnum('category').notNull().default('marketing'),
    language: text('language').notNull().default('pt_BR'),
    body: text('body').notNull(),
    variables: jsonb('variables').$type<string[]>().notNull().default([]),
    status: templateStatusEnum('status').notNull().default('draft'),
    metaTemplateId: text('meta_template_id'),
    rejectionReason: text('rejection_reason'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('message_templates_tenant_name_unique').on(table.tenantId, table.name),
    index('message_templates_tenant_status_idx').on(table.tenantId, table.status),
  ],
)

export const cadences = pgTable(
  'cadences',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    status: cadenceStatusEnum('status').notNull().default('draft'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('cadences_tenant_name_unique').on(table.tenantId, table.name),
    index('cadences_tenant_status_idx').on(table.tenantId, table.status),
  ],
)

export const cadenceSteps = pgTable(
  'cadence_steps',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    cadenceId: uuid('cadence_id')
      .notNull()
      .references(() => cadences.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id')
      .notNull()
      .references(() => messageTemplates.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    delayHours: integer('delay_hours').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('cadence_steps_cadence_position_unique').on(table.cadenceId, table.position),
    index('cadence_steps_tenant_idx').on(table.tenantId),
    index('cadence_steps_template_idx').on(table.templateId),
  ],
)

export const cadenceEnrollments = pgTable(
  'cadence_enrollments',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    cadenceId: uuid('cadence_id')
      .notNull()
      .references(() => cadences.id, { onDelete: 'cascade' }),
    status: cadenceEnrollmentStatusEnum('status').notNull().default('active'),
    currentStep: integer('current_step').notNull().default(0),
    nextSendAt: timestamp('next_send_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    pauseReason: text('pause_reason'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('cadence_enrollments_tenant_lead_status_idx').on(
      table.tenantId,
      table.leadId,
      table.status,
    ),
    index('cadence_enrollments_next_send_idx').on(table.nextSendAt),
    index('cadence_enrollments_cadence_idx').on(table.cadenceId),
  ],
)

export const cadenceTasks = pgTable(
  'cadence_tasks',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => cadenceEnrollments.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    cadenceId: uuid('cadence_id')
      .notNull()
      .references(() => cadences.id, { onDelete: 'cascade' }),
    stepId: uuid('step_id')
      .notNull()
      .references(() => cadenceSteps.id, { onDelete: 'cascade' }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    status: cadenceTaskStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('cadence_tasks_enrollment_step_unique').on(table.enrollmentId, table.stepId),
    index('cadence_tasks_status_scheduled_idx').on(table.status, table.scheduledAt),
    index('cadence_tasks_next_attempt_idx').on(table.nextAttemptAt),
    index('cadence_tasks_tenant_idx').on(table.tenantId),
  ],
)

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notifications_user_unread_idx').on(table.tenantId, table.userId, table.readAt),
    index('notifications_tenant_created_idx').on(table.tenantId, table.createdAt),
  ],
)

export const aiInsights = pgTable(
  'ai_insights',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    status: aiInsightStatusEnum('status').notNull().default('pending'),
    result: jsonb('result').$type<Record<string, unknown>>(),
    confidence: integer('confidence'),
    model: text('model'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ai_insights_message_type_unique').on(table.messageId, table.type),
    index('ai_insights_status_next_attempt_idx').on(table.status, table.nextAttemptAt),
    index('ai_insights_tenant_lead_idx').on(table.tenantId, table.leadId),
  ],
)

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  whatsappAccounts: many(whatsappAccounts),
  leads: many(leads),
  conversations: many(conversations),
  messages: many(messages),
  webhookEvents: many(webhookEvents),
  appointments: many(appointments),
  messageTemplates: many(messageTemplates),
  cadences: many(cadences),
  cadenceEnrollments: many(cadenceEnrollments),
  cadenceTasks: many(cadenceTasks),
  notifications: many(notifications),
  aiInsights: many(aiInsights),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  refreshTokens: many(refreshTokens),
}))

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}))

export const whatsappAccountsRelations = relations(whatsappAccounts, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [whatsappAccounts.tenantId],
    references: [tenants.id],
  }),
  conversations: many(conversations),
  messages: many(messages),
}))

export const leadsRelations = relations(leads, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [leads.tenantId],
    references: [tenants.id],
  }),
  owner: one(users, {
    fields: [leads.ownerUserId],
    references: [users.id],
  }),
  conversations: many(conversations),
  messages: many(messages),
  appointments: many(appointments),
  cadenceEnrollments: many(cadenceEnrollments),
  cadenceTasks: many(cadenceTasks),
  aiInsights: many(aiInsights),
}))

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [conversations.tenantId],
    references: [tenants.id],
  }),
  lead: one(leads, {
    fields: [conversations.leadId],
    references: [leads.id],
  }),
  whatsappAccount: one(whatsappAccounts, {
    fields: [conversations.whatsappAccountId],
    references: [whatsappAccounts.id],
  }),
  messages: many(messages),
  aiInsights: many(aiInsights),
}))

export const messagesRelations = relations(messages, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [messages.tenantId],
    references: [tenants.id],
  }),
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  lead: one(leads, {
    fields: [messages.leadId],
    references: [leads.id],
  }),
  whatsappAccount: one(whatsappAccounts, {
    fields: [messages.whatsappAccountId],
    references: [whatsappAccounts.id],
  }),
  sender: one(users, {
    fields: [messages.senderUserId],
    references: [users.id],
  }),
  aiInsights: many(aiInsights),
}))

export const webhookEventsRelations = relations(webhookEvents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [webhookEvents.tenantId],
    references: [tenants.id],
  }),
}))

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  tenant: one(tenants, {
    fields: [appointments.tenantId],
    references: [tenants.id],
  }),
  lead: one(leads, {
    fields: [appointments.leadId],
    references: [leads.id],
  }),
  owner: one(users, {
    relationName: 'appointmentOwner',
    fields: [appointments.ownerUserId],
    references: [users.id],
  }),
  createdBy: one(users, {
    relationName: 'appointmentCreator',
    fields: [appointments.createdByUserId],
    references: [users.id],
  }),
}))

export const messageTemplatesRelations = relations(messageTemplates, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [messageTemplates.tenantId],
    references: [tenants.id],
  }),
  createdBy: one(users, {
    fields: [messageTemplates.createdByUserId],
    references: [users.id],
  }),
  steps: many(cadenceSteps),
}))

export const cadencesRelations = relations(cadences, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [cadences.tenantId],
    references: [tenants.id],
  }),
  createdBy: one(users, {
    fields: [cadences.createdByUserId],
    references: [users.id],
  }),
  steps: many(cadenceSteps),
  enrollments: many(cadenceEnrollments),
  tasks: many(cadenceTasks),
}))

export const cadenceStepsRelations = relations(cadenceSteps, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [cadenceSteps.tenantId],
    references: [tenants.id],
  }),
  cadence: one(cadences, {
    fields: [cadenceSteps.cadenceId],
    references: [cadences.id],
  }),
  template: one(messageTemplates, {
    fields: [cadenceSteps.templateId],
    references: [messageTemplates.id],
  }),
  tasks: many(cadenceTasks),
}))

export const cadenceEnrollmentsRelations = relations(cadenceEnrollments, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [cadenceEnrollments.tenantId],
    references: [tenants.id],
  }),
  lead: one(leads, {
    fields: [cadenceEnrollments.leadId],
    references: [leads.id],
  }),
  cadence: one(cadences, {
    fields: [cadenceEnrollments.cadenceId],
    references: [cadences.id],
  }),
  createdBy: one(users, {
    fields: [cadenceEnrollments.createdByUserId],
    references: [users.id],
  }),
  tasks: many(cadenceTasks),
}))

export const cadenceTasksRelations = relations(cadenceTasks, ({ one }) => ({
  tenant: one(tenants, {
    fields: [cadenceTasks.tenantId],
    references: [tenants.id],
  }),
  enrollment: one(cadenceEnrollments, {
    fields: [cadenceTasks.enrollmentId],
    references: [cadenceEnrollments.id],
  }),
  lead: one(leads, {
    fields: [cadenceTasks.leadId],
    references: [leads.id],
  }),
  cadence: one(cadences, {
    fields: [cadenceTasks.cadenceId],
    references: [cadences.id],
  }),
  step: one(cadenceSteps, {
    fields: [cadenceTasks.stepId],
    references: [cadenceSteps.id],
  }),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  tenant: one(tenants, {
    fields: [notifications.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}))

export const aiInsightsRelations = relations(aiInsights, ({ one }) => ({
  tenant: one(tenants, {
    fields: [aiInsights.tenantId],
    references: [tenants.id],
  }),
  lead: one(leads, {
    fields: [aiInsights.leadId],
    references: [leads.id],
  }),
  conversation: one(conversations, {
    fields: [aiInsights.conversationId],
    references: [conversations.id],
  }),
  message: one(messages, {
    fields: [aiInsights.messageId],
    references: [messages.id],
  }),
}))

export type TenantRecord = typeof tenants.$inferSelect
export type UserRecord = typeof users.$inferSelect
export type RefreshTokenRecord = typeof refreshTokens.$inferSelect
export type AuditLogRecord = typeof auditLogs.$inferSelect
export type LeadRecord = typeof leads.$inferSelect
export type ConversationRecord = typeof conversations.$inferSelect
export type MessageRecord = typeof messages.$inferSelect
export type WhatsAppAccountRecord = typeof whatsappAccounts.$inferSelect
export type WebhookEventRecord = typeof webhookEvents.$inferSelect
export type AppointmentRecord = typeof appointments.$inferSelect
export type MessageTemplateRecord = typeof messageTemplates.$inferSelect
export type CadenceRecord = typeof cadences.$inferSelect
export type CadenceStepRecord = typeof cadenceSteps.$inferSelect
export type CadenceEnrollmentRecord = typeof cadenceEnrollments.$inferSelect
export type CadenceTaskRecord = typeof cadenceTasks.$inferSelect
export type NotificationRecord = typeof notifications.$inferSelect
export type AiInsightRecord = typeof aiInsights.$inferSelect
