import {
  type BusinessHours,
  CONSENT_STATUSES,
  CONVERSATION_STATUSES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  MESSAGE_DIRECTIONS,
  MESSAGE_STATUSES,
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

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  whatsappAccounts: many(whatsappAccounts),
  leads: many(leads),
  conversations: many(conversations),
  messages: many(messages),
  webhookEvents: many(webhookEvents),
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
}))

export const messagesRelations = relations(messages, ({ one }) => ({
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
}))

export const webhookEventsRelations = relations(webhookEvents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [webhookEvents.tenantId],
    references: [tenants.id],
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
