import type { LeadStatus, MessageStatus, WhatsAppConnectionStatus, WhatsAppMode } from '@crm/shared'

export type Tone = 'brand' | 'neutral' | 'sand' | 'danger' | 'success'

const leadStatusTones: Record<LeadStatus, Tone> = {
  new: 'brand',
  first_contact: 'sand',
  qualifying: 'sand',
  waiting_sdr: 'sand',
  human_service: 'brand',
  waiting_schedule: 'sand',
  scheduled: 'success',
  waiting_cadence: 'neutral',
  in_cadence: 'brand',
  cadence_completed: 'neutral',
  future_recovery: 'neutral',
  lost: 'danger',
  opt_out: 'danger',
}

const messageStatusTones: Record<MessageStatus, Tone> = {
  pending: 'neutral',
  sent: 'sand',
  delivered: 'brand',
  read: 'success',
  failed: 'danger',
  received: 'neutral',
}

const connectionTones: Record<WhatsAppConnectionStatus, Tone> = {
  connected: 'success',
  disconnected: 'neutral',
  error: 'danger',
}

const modeTones: Record<WhatsAppMode, Tone> = {
  disabled: 'neutral',
  'dry-run': 'sand',
  live: 'success',
}

export function leadStatusTone(status: LeadStatus): Tone {
  return leadStatusTones[status]
}

export function messageStatusTone(status: MessageStatus): Tone {
  return messageStatusTones[status]
}

export function connectionTone(status: WhatsAppConnectionStatus): Tone {
  return connectionTones[status]
}

export function modeTone(mode: WhatsAppMode): Tone {
  return modeTones[mode]
}

export function isLeadStatus(value: string | undefined): value is LeadStatus {
  return value !== undefined && value in leadStatusTones
}
