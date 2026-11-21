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
