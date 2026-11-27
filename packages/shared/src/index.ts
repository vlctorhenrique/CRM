import { z } from 'zod'

export const USER_ROLES = ['admin', 'manager', 'sdr'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const USER_STATUSES = ['active', 'disabled'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  sdr: 'SDR',
}

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Ativo',
  disabled: 'Desativado',
}

export const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM')

export const businessDaySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    enabled: z.boolean(),
    start: timeOfDaySchema,
    end: timeOfDaySchema,
  })
  .refine((day) => !day.enabled || day.end > day.start, {
    message: 'O horário final deve ser posterior ao inicial',
    path: ['end'],
  })

export const businessHoursSchema = z.object({
  days: z.array(businessDaySchema).length(7),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(200),
})

export type BusinessDay = z.infer<typeof businessDaySchema>
export type BusinessHours = z.infer<typeof businessHoursSchema>

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  days: [
    { weekday: 0, enabled: false, start: '08:00', end: '18:00' },
    { weekday: 1, enabled: true, start: '08:00', end: '18:00' },
    { weekday: 2, enabled: true, start: '08:00', end: '18:00' },
    { weekday: 3, enabled: true, start: '08:00', end: '18:00' },
    { weekday: 4, enabled: true, start: '08:00', end: '18:00' },
    { weekday: 5, enabled: true, start: '08:00', end: '18:00' },
    { weekday: 6, enabled: false, start: '08:00', end: '18:00' },
  ],
  holidays: [],
}

export const loginSchema = z.object({
  email: z
    .email('Informe um e-mail válido')
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1, 'Informe a senha').max(128),
  tenantSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, 'Slug inválido')
    .max(64)
    .optional(),
})

export type LoginInput = z.infer<typeof loginSchema>

export const passwordSchema = z
  .string()
  .min(10, 'A senha deve ter pelo menos 10 caracteres')
  .max(128)
  .regex(/[A-Za-z]/, 'A senha deve conter letras')
  .regex(/\d/, 'A senha deve conter números')

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(120),
  email: z
    .email('Informe um e-mail válido')
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: passwordSchema,
  role: z.enum(USER_ROLES),
})

export type CreateUserInput = z.infer<typeof createUserSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual').max(128),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'A nova senha deve ser diferente da atual',
    path: ['newPassword'],
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.email('Informe um e-mail válido').max(254).toLowerCase().optional(),
    role: z.enum(USER_ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
    password: passwordSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  })

export type UpdateUserInput = z.infer<typeof updateUserSchema>

export const updateTenantSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    businessHours: businessHoursSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  })

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
  lastLoginAt: string | null
  createdAt: string
}

export interface TenantSummary {
  id: string
  name: string
  slug: string
  timezone: string
  businessHours: BusinessHours
  isActive: boolean
}

export interface MeResponse {
  user: AuthUser
  tenant: TenantSummary
}

export interface SessionResponse extends MeResponse {
  accessTokenExpiresAt: string
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
    requestId?: string
  }
}

export interface HealthResponse {
  status: 'ok' | 'degraded'
  version: string
  uptimeSeconds: number
  checks: {
    database: 'ok' | 'error'
    redis: 'ok' | 'disabled' | 'error'
  }
  backlog?: {
    cadenceTasksPending: number
    cadenceTasksStale: number
    aiInsightsPending: number
  }
  backup?: {
    configured: boolean
    lastRunAt: string | null
    lastStatus: 'ok' | 'failed' | 'unknown'
    ageHours: number | null
    stale: boolean
  }
  timestamp: string
}

export function normalizePhone(input: string, defaultCountryCode = '55'): string {
  const digits = input.replace(/\D/g, '').replace(/^0+/, '')

  if (!digits) {
    return ''
  }

  if (digits.startsWith(defaultCountryCode)) {
    return `+${digits}`
  }

  if (digits.length === 10 || digits.length === 11) {
    return `+${defaultCountryCode}${digits}`
  }

  return `+${digits}`
}

export function isValidPhone(input: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(input)
}

export const LEAD_STATUSES = [
  'new',
  'first_contact',
  'qualifying',
  'waiting_sdr',
  'human_service',
  'waiting_schedule',
  'scheduled',
  'waiting_cadence',
  'in_cadence',
  'cadence_completed',
  'future_recovery',
  'lost',
  'opt_out',
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Novo lead',
  first_contact: 'Primeiro atendimento',
  qualifying: 'Em pré-qualificação',
  waiting_sdr: 'Aguardando SDR',
  human_service: 'Em atendimento humano',
  waiting_schedule: 'Aguardando agendamento',
  scheduled: 'Agendado',
  waiting_cadence: 'Aguardando seleção para cadência',
  in_cadence: 'Em cadência',
  cadence_completed: 'Cadência concluída',
  future_recovery: 'Recuperação futura',
  lost: 'Perdido',
  opt_out: 'Opt-out / bloqueado',
}

export const LEAD_SOURCES = [
  'whatsapp',
  'manual',
  'site',
  'instagram',
  'google',
  'indicacao',
  'outro',
] as const

export type LeadSource = (typeof LEAD_SOURCES)[number]

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  whatsapp: 'WhatsApp',
  manual: 'Cadastro manual',
  site: 'Site',
  instagram: 'Instagram',
  google: 'Google',
  indicacao: 'Indicação',
  outro: 'Outro',
}

export const CONSENT_STATUSES = ['unknown', 'granted', 'revoked'] as const

export type ConsentStatus = (typeof CONSENT_STATUSES)[number]

export const CONSENT_STATUS_LABELS: Record<ConsentStatus, string> = {
  unknown: 'Não registrado',
  granted: 'Registrado',
  revoked: 'Revogado',
}

export const DEFAULT_CONSENT_TEXT_VERSION = '2026-11-v1'

export const APPOINTMENT_STATUSES = [
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
] as const

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  completed: 'Compareceu',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
}

export const CADENCE_STATUSES = ['draft', 'active', 'paused', 'archived'] as const
export type CadenceStatus = (typeof CADENCE_STATUSES)[number]

export const CADENCE_STATUS_LABELS: Record<CadenceStatus, string> = {
  draft: 'Rascunho',
  active: 'Ativa',
  paused: 'Pausada',
  archived: 'Arquivada',
}

export const CADENCE_ENROLLMENT_STATUSES = [
  'active',
  'paused',
  'completed',
  'cancelled',
  'failed',
] as const

export type CadenceEnrollmentStatus = (typeof CADENCE_ENROLLMENT_STATUSES)[number]

export const CADENCE_ENROLLMENT_STATUS_LABELS: Record<CadenceEnrollmentStatus, string> = {
  active: 'Ativa',
  paused: 'Pausada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  failed: 'Falhou',
}

export const CADENCE_TASK_STATUSES = [
  'pending',
  'processing',
  'sent',
  'skipped',
  'failed',
  'cancelled',
] as const

export type CadenceTaskStatus = (typeof CADENCE_TASK_STATUSES)[number]

export const TEMPLATE_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'paused'] as const
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number]

export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  draft: 'Rascunho',
  pending: 'Em aprovação',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  paused: 'Pausado',
}

export const TEMPLATE_CATEGORIES = ['marketing', 'utility'] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  marketing: 'Marketing',
  utility: 'Utilidade',
}

export const NOTIFICATION_TYPES = [
  'lead_assigned',
  'appointment_created',
  'appointment_cancelled',
  'cadence_completed',
  'cadence_failed',
  'ai_insight',
  'system',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export const AI_MODES = ['off', 'fallback', 'llm'] as const
export type AiMode = (typeof AI_MODES)[number]

export const AI_INSIGHT_TYPES = ['extraction', 'summary', 'classification'] as const
export type AiInsightType = (typeof AI_INSIGHT_TYPES)[number]

export const AI_INSIGHT_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const
export type AiInsightStatus = (typeof AI_INSIGHT_STATUSES)[number]

export const MESSAGE_DIRECTIONS = ['inbound', 'outbound'] as const

export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number]

export const MESSAGE_STATUSES = [
  'pending',
  'sent',
  'delivered',
  'read',
  'failed',
  'received',
] as const

export type MessageStatus = (typeof MESSAGE_STATUSES)[number]

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  pending: 'Pendente',
  sent: 'Enviada',
  delivered: 'Entregue',
  read: 'Lida',
  failed: 'Falhou',
  received: 'Recebida',
}

export const MESSAGE_TYPES = [
  'text',
  'image',
  'audio',
  'video',
  'document',
  'sticker',
  'location',
  'contacts',
  'button',
  'interactive',
  'reaction',
  'other',
] as const

export type MessageType = (typeof MESSAGE_TYPES)[number]

export const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  text: 'Texto',
  image: 'Imagem',
  audio: 'Áudio',
  video: 'Vídeo',
  document: 'Documento',
  sticker: 'Figurinha',
  location: 'Localização',
  contacts: 'Contato',
  button: 'Botão',
  interactive: 'Resposta interativa',
  reaction: 'Reação',
  other: 'Outro',
}

export const CONVERSATION_STATUSES = ['open', 'closed'] as const

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number]

export const WHATSAPP_CONNECTION_STATUSES = ['connected', 'disconnected', 'error'] as const

export type WhatsAppConnectionStatus = (typeof WHATSAPP_CONNECTION_STATUSES)[number]

export const WHATSAPP_CONNECTION_LABELS: Record<WhatsAppConnectionStatus, string> = {
  connected: 'Conectado',
  disconnected: 'Desconectado',
  error: 'Com erro',
}

export const WHATSAPP_MODES = ['disabled', 'dry-run', 'live'] as const

export type WhatsAppMode = (typeof WHATSAPP_MODES)[number]

export const WHATSAPP_MODE_LABELS: Record<WhatsAppMode, string> = {
  disabled: 'Desabilitado',
  'dry-run': 'Modo simulado',
  live: 'Produção',
}

export const createLeadSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(120),
  phone: z.string().trim().min(8, 'Informe o telefone').max(24),
  source: z.enum(LEAD_SOURCES).default('manual'),
  ownerUserId: z.uuid().nullable().optional(),
  interestProcedure: z.string().trim().max(120).optional(),
  objective: z.string().trim().max(240).optional(),
  bodyRegion: z.string().trim().max(120).optional(),
  previousTreatment: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(4000).optional(),
})

export type CreateLeadInput = z.infer<typeof createLeadSchema>

export const updateLeadSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome').max(120).optional(),
    status: z.enum(LEAD_STATUSES).optional(),
    ownerUserId: z.uuid().nullable().optional(),
    interestProcedure: z.string().trim().max(120).nullable().optional(),
    objective: z.string().trim().max(240).nullable().optional(),
    bodyRegion: z.string().trim().max(120).nullable().optional(),
    previousTreatment: z.string().trim().max(240).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    consentStatus: z.enum(CONSENT_STATUSES).optional(),
    consentTextVersion: z.string().trim().max(80).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  })

export type UpdateLeadInput = z.infer<typeof updateLeadSchema>

export const sendMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Escreva uma mensagem')
    .max(4096, 'A mensagem deve ter no máximo 4096 caracteres'),
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>

export const updateWhatsAppAccountSchema = z
  .object({
    phoneNumberId: z.string().trim().min(1, 'Informe o phone number ID').max(64).optional(),
    wabaId: z.string().trim().max(64).nullable().optional(),
    displayPhoneNumber: z.string().trim().min(1, 'Informe o número exibido').max(32).optional(),
    initialMessage: z.string().trim().max(1024).nullable().optional(),
    aiEnabled: z.boolean().optional(),
    status: z.enum(WHATSAPP_CONNECTION_STATUSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  })

export type UpdateWhatsAppAccountInput = z.infer<typeof updateWhatsAppAccountSchema>

export const consentLeadSchema = z.object({
  status: z.enum(['granted', 'revoked']),
  evidence: z.string().trim().min(3, 'Registre a evidência do consentimento').max(2000),
  textVersion: z.string().trim().min(1, 'Informe a versão do texto').max(80),
})

export type ConsentLeadInput = z.infer<typeof consentLeadSchema>

export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES)

export const listAppointmentsQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: appointmentStatusSchema.optional(),
  leadId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>

export const createAppointmentSchema = z.object({
  leadId: z.uuid(),
  scheduledAt: z.string().datetime({ offset: true }),
  durationMinutes: z.coerce.number().int().min(15).max(480).default(60),
  procedure: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
  ownerUserId: z.uuid().nullable().optional(),
})

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>

export const updateAppointmentSchema = z
  .object({
    status: appointmentStatusSchema.optional(),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
    durationMinutes: z.coerce.number().int().min(15).max(480).optional(),
    procedure: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    ownerUserId: z.uuid().nullable().optional(),
    cancellationReason: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  })

export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>

export const createTemplateSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(120),
  category: z.enum(TEMPLATE_CATEGORIES).default('marketing'),
  language: z
    .string()
    .trim()
    .regex(/^[a-z]{2}(?:_[A-Z]{2})?$/, 'Use o formato pt_BR')
    .default('pt_BR'),
  body: z.string().trim().min(1, 'Escreva o conteúdo').max(1024),
})

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>

export const updateTemplateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    category: z.enum(TEMPLATE_CATEGORIES).optional(),
    language: z
      .string()
      .trim()
      .regex(/^[a-z]{2}(?:_[A-Z]{2})?$/)
      .optional(),
    body: z.string().trim().min(1).max(1024).optional(),
    status: z.enum(TEMPLATE_STATUSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  })

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>

export const cadenceStepInputSchema = z.object({
  templateId: z.uuid(),
  delayHours: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 14),
})

export const createCadenceSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(120),
  description: z.string().trim().max(500).optional(),
  steps: z.array(cadenceStepInputSchema).min(1, 'Adicione ao menos um passo').max(20),
})

export type CreateCadenceInput = z.infer<typeof createCadenceSchema>

export const updateCadenceSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    status: z.enum(CADENCE_STATUSES).optional(),
    steps: z.array(cadenceStepInputSchema).min(1).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  })

export type UpdateCadenceInput = z.infer<typeof updateCadenceSchema>

export const enrollLeadSchema = z.object({
  leadId: z.uuid(),
  cadenceId: z.uuid(),
})

export type EnrollLeadInput = z.infer<typeof enrollLeadSchema>

export const updateCadenceEnrollmentSchema = z
  .object({
    status: z.enum(['active', 'paused', 'cancelled']),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.status !== 'cancelled' || Boolean(value.reason?.trim()), {
    message: 'Informe o motivo do cancelamento',
    path: ['reason'],
  })

export type UpdateCadenceEnrollmentInput = z.infer<typeof updateCadenceEnrollmentSchema>

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>

export const markNotificationsReadSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
})

export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>

export const listReportsQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  ownerUserId: z.uuid().optional(),
})

export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>

export interface LeadListItem {
  id: string
  name: string | null
  phone: string
  status: LeadStatus
  source: LeadSource
  ownerUserId: string | null
  ownerName: string | null
  interestProcedure: string | null
  consentStatus: ConsentStatus
  optOutAt: string | null
  lastContactAt: string | null
  createdAt: string
  unreadCount: number
  lastMessagePreview: string | null
  lastMessageAt: string | null
}

export interface LeadListResponse {
  items: LeadListItem[]
  total: number
}

export interface LeadDetail {
  id: string
  name: string | null
  phone: string
  phoneRaw: string | null
  status: LeadStatus
  source: LeadSource
  ownerUserId: string | null
  ownerName: string | null
  interestProcedure: string | null
  objective: string | null
  bodyRegion: string | null
  previousTreatment: string | null
  notes: string | null
  consentStatus: ConsentStatus
  consentEvidence: string | null
  consentAt: string | null
  consentTextVersion: string | null
  optOutAt: string | null
  lastContactAt: string | null
  initialMessageSentAt: string | null
  createdAt: string
  updatedAt: string
  conversationId: string | null
  unreadCount: number
}

export interface ConversationView {
  id: string
  leadId: string
  leadName: string | null
  phone: string
  status: ConversationStatus
  humanTakeover: boolean
  aiEnabled: boolean
  unreadCount: number
  lastMessagePreview: string | null
  lastMessageAt: string | null
  lastInboundAt: string | null
  assignedUserId: string | null
  assignedUserName: string | null
}

export interface ConversationListResponse {
  items: ConversationView[]
  total: number
}

export interface MessageView {
  id: string
  direction: MessageDirection
  type: MessageType
  status: MessageStatus
  body: string | null
  providerMessageId: string | null
  senderName: string | null
  errorMessage: string | null
  providerTimestamp: string | null
  createdAt: string
}

export interface LeadDetailResponse {
  lead: LeadDetail
  conversation: ConversationView | null
  messages: MessageView[]
  whatsapp: {
    displayPhoneNumber: string
    status: WhatsAppConnectionStatus
    mode: WhatsAppMode
    windowOpen: boolean
    windowExpiresAt: string | null
  } | null
}

export interface WhatsAppAccountView {
  id: string
  phoneNumberId: string
  wabaId: string | null
  displayPhoneNumber: string
  status: WhatsAppConnectionStatus
  initialMessage: string | null
  aiEnabled: boolean
  mode: WhatsAppMode
  credentialsConfigured: boolean
  updatedAt: string
}

export interface DashboardSummary {
  totalLeads: number
  newLeads: number
  inService: number
  waitingSdr: number
  scheduled: number
  lost: number
  unreadConversations: number
  messagesSentToday: number
  conversionRate: number
}

export interface AppointmentView {
  id: string
  leadId: string
  leadName: string | null
  phone: string
  procedure: string | null
  scheduledAt: string
  durationMinutes: number
  status: AppointmentStatus
  notes: string | null
  ownerUserId: string | null
  ownerName: string | null
  createdByUserId: string | null
  cancellationReason: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AppointmentListResponse {
  items: AppointmentView[]
  total: number
}

export interface MessageTemplateView {
  id: string
  name: string
  category: TemplateCategory
  language: string
  body: string
  variables: string[]
  status: TemplateStatus
  metaTemplateId: string | null
  rejectionReason: string | null
  createdAt: string
  updatedAt: string
}

export interface TemplateListResponse {
  items: MessageTemplateView[]
  total: number
}

export interface CadenceStepView {
  id: string
  position: number
  delayHours: number
  templateId: string
  templateName: string
  templateStatus: TemplateStatus
}

export interface CadenceView {
  id: string
  name: string
  description: string | null
  status: CadenceStatus
  steps: CadenceStepView[]
  activeEnrollments: number
  createdAt: string
  updatedAt: string
}

export interface CadenceListResponse {
  items: CadenceView[]
  total: number
}

export interface CadenceEnrollmentView {
  id: string
  leadId: string
  leadName: string | null
  phone: string
  cadenceId: string
  cadenceName: string
  status: CadenceEnrollmentStatus
  currentStep: number
  nextSendAt: string | null
  startedAt: string
  pausedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  createdAt: string
}

export interface CadenceEligibleLead {
  leadId: string
  name: string | null
  phone: string
  status: LeadStatus
  ownerUserId: string | null
  ownerName: string | null
  interestProcedure: string | null
  eligible: boolean
  reasons: string[]
}

export interface CadenceEligibleLeadsResponse {
  items: CadenceEligibleLead[]
  total: number
}

export interface CadenceBatchPreview {
  selected: number
  eligible: number
  ineligible: Array<{ leadId: string; reason: string }>
}

export interface CadenceBatchResult {
  preview: CadenceBatchPreview
  enrolled: number
  failed: Array<{ leadId: string; reason: string }>
}

export interface NotificationView {
  id: string
  type: NotificationType
  title: string
  body: string
  entityType: string | null
  entityId: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationListResponse {
  items: NotificationView[]
  total: number
  unreadCount: number
}

export interface AiInsightView {
  id: string
  leadId: string
  type: AiInsightType
  status: AiInsightStatus
  result: Record<string, unknown> | null
  confidence: number | null
  model: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface ReportsSummary {
  period: {
    from: string
    to: string
  }
  leads: {
    total: number
    new: number
    scheduled: number
    lost: number
    optOut: number
  }
  appointments: {
    total: number
    scheduled: number
    completed: number
    cancelled: number
    noShow: number
    conversionRate: number
  }
  cadences: {
    activeEnrollments: number
    completedEnrollments: number
    failedEnrollments: number
    tasksSent: number
    tasksFailed: number
  }
  messaging: {
    inbound: number
    outbound: number
    failed: number
  }
}
