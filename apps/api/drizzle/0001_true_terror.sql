CREATE TYPE "public"."consent_status" AS ENUM('unknown', 'granted', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('whatsapp', 'manual', 'site', 'instagram', 'google', 'indicacao', 'outro');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'first_contact', 'qualifying', 'waiting_sdr', 'human_service', 'waiting_schedule', 'scheduled', 'waiting_cadence', 'in_cadence', 'cadence_completed', 'future_recovery', 'lost', 'opt_out');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('pending', 'sent', 'delivered', 'read', 'failed', 'received');--> statement-breakpoint
CREATE TYPE "public"."webhook_event_status" AS ENUM('pending', 'processed', 'ignored', 'failed');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_connection_status" AS ENUM('connected', 'disconnected', 'error');--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"whatsapp_account_id" uuid NOT NULL,
	"status" "conversation_status" DEFAULT 'open' NOT NULL,
	"human_takeover" boolean DEFAULT false NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_message_preview" text,
	"last_message_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text,
	"phone_normalized" text NOT NULL,
	"phone_raw" text,
	"source" "lead_source" DEFAULT 'manual' NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"owner_user_id" uuid,
	"interest_procedure" text,
	"objective" text,
	"body_region" text,
	"previous_treatment" text,
	"notes" text,
	"consent_status" "consent_status" DEFAULT 'unknown' NOT NULL,
	"consent_evidence" text,
	"consent_at" timestamp with time zone,
	"consent_text_version" text,
	"opt_out_at" timestamp with time zone,
	"last_contact_at" timestamp with time zone,
	"initial_message_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"whatsapp_account_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"status" "message_status" DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"body" text,
	"sender_user_id" uuid,
	"error_message" text,
	"provider_timestamp" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"provider" text DEFAULT 'whatsapp' NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"status" "webhook_event_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "whatsapp_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone_number_id" text NOT NULL,
	"waba_id" text,
	"display_phone_number" text NOT NULL,
	"status" "whatsapp_connection_status" DEFAULT 'disconnected' NOT NULL,
	"initial_message" text,
	"ai_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_whatsapp_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("whatsapp_account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_whatsapp_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("whatsapp_account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_lead_account_unique" ON "conversations" USING btree ("lead_id","whatsapp_account_id");--> statement-breakpoint
CREATE INDEX "conversations_tenant_last_message_idx" ON "conversations" USING btree ("tenant_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_tenant_phone_unique" ON "leads" USING btree ("tenant_id","phone_normalized");--> statement-breakpoint
CREATE INDEX "leads_tenant_status_idx" ON "leads" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "leads_tenant_owner_idx" ON "leads" USING btree ("tenant_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "leads_tenant_created_idx" ON "leads" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_provider_message_id_unique" ON "messages" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_lead_idx" ON "messages" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "messages_tenant_idx" ON "messages" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_event_key_unique" ON "webhook_events" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "webhook_events_tenant_received_idx" ON "webhook_events" USING btree ("tenant_id","received_at");--> statement-breakpoint
CREATE INDEX "webhook_events_status_idx" ON "webhook_events" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_accounts_phone_number_id_unique" ON "whatsapp_accounts" USING btree ("phone_number_id");--> statement-breakpoint
CREATE INDEX "whatsapp_accounts_tenant_idx" ON "whatsapp_accounts" USING btree ("tenant_id");