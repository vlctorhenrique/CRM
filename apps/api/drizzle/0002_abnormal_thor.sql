CREATE TYPE "public"."ai_insight_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."cadence_enrollment_status" AS ENUM('active', 'paused', 'completed', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."cadence_status" AS ENUM('draft', 'active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."cadence_task_status" AS ENUM('pending', 'processing', 'sent', 'skipped', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."template_category" AS ENUM('marketing', 'utility');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('draft', 'pending', 'approved', 'rejected', 'paused');--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"conversation_id" uuid,
	"message_id" uuid,
	"type" text NOT NULL,
	"status" "ai_insight_status" DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"confidence" integer,
	"model" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"created_by_user_id" uuid,
	"procedure" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"cancellation_reason" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cadence_enrollments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"cadence_id" uuid NOT NULL,
	"status" "cadence_enrollment_status" DEFAULT 'active' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"next_send_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paused_at" timestamp with time zone,
	"pause_reason" text,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cadence_steps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cadence_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"delay_hours" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cadence_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"cadence_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "cadence_task_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"locked_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cadences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "cadence_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "template_category" DEFAULT 'marketing' NOT NULL,
	"language" text DEFAULT 'pt_BR' NOT NULL,
	"body" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "template_status" DEFAULT 'draft' NOT NULL,
	"meta_template_id" text,
	"rejection_reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "ai_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadence_enrollments" ADD CONSTRAINT "cadence_enrollments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadence_enrollments" ADD CONSTRAINT "cadence_enrollments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadence_enrollments" ADD CONSTRAINT "cadence_enrollments_cadence_id_cadences_id_fk" FOREIGN KEY ("cadence_id") REFERENCES "public"."cadences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadence_enrollments" ADD CONSTRAINT "cadence_enrollments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadence_steps" ADD CONSTRAINT "cadence_steps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadence_steps" ADD CONSTRAINT "cadence_steps_cadence_id_cadences_id_fk" FOREIGN KEY ("cadence_id") REFERENCES "public"."cadences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadence_steps" ADD CONSTRAINT "cadence_steps_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadence_tasks" ADD CONSTRAINT "cadence_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadence_tasks" ADD CONSTRAINT "cadence_tasks_enrollment_id_cadence_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."cadence_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadence_tasks" ADD CONSTRAINT "cadence_tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadence_tasks" ADD CONSTRAINT "cadence_tasks_cadence_id_cadences_id_fk" FOREIGN KEY ("cadence_id") REFERENCES "public"."cadences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadence_tasks" ADD CONSTRAINT "cadence_tasks_step_id_cadence_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."cadence_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadences" ADD CONSTRAINT "cadences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadences" ADD CONSTRAINT "cadences_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_insights_message_type_unique" ON "ai_insights" USING btree ("message_id","type");--> statement-breakpoint
CREATE INDEX "ai_insights_status_next_attempt_idx" ON "ai_insights" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "ai_insights_tenant_lead_idx" ON "ai_insights" USING btree ("tenant_id","lead_id");--> statement-breakpoint
CREATE INDEX "appointments_tenant_scheduled_idx" ON "appointments" USING btree ("tenant_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "appointments_tenant_status_idx" ON "appointments" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "appointments_lead_idx" ON "appointments" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "cadence_enrollments_tenant_lead_status_idx" ON "cadence_enrollments" USING btree ("tenant_id","lead_id","status");--> statement-breakpoint
CREATE INDEX "cadence_enrollments_next_send_idx" ON "cadence_enrollments" USING btree ("next_send_at");--> statement-breakpoint
CREATE INDEX "cadence_enrollments_cadence_idx" ON "cadence_enrollments" USING btree ("cadence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cadence_steps_cadence_position_unique" ON "cadence_steps" USING btree ("cadence_id","position");--> statement-breakpoint
CREATE INDEX "cadence_steps_tenant_idx" ON "cadence_steps" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cadence_steps_template_idx" ON "cadence_steps" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cadence_tasks_enrollment_step_unique" ON "cadence_tasks" USING btree ("enrollment_id","step_id");--> statement-breakpoint
CREATE INDEX "cadence_tasks_status_scheduled_idx" ON "cadence_tasks" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "cadence_tasks_next_attempt_idx" ON "cadence_tasks" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE INDEX "cadence_tasks_tenant_idx" ON "cadence_tasks" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cadences_tenant_name_unique" ON "cadences" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "cadences_tenant_status_idx" ON "cadences" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_tenant_name_unique" ON "message_templates" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "message_templates_tenant_status_idx" ON "message_templates" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("tenant_id","user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_tenant_created_idx" ON "notifications" USING btree ("tenant_id","created_at");