import { randomUUID } from 'node:crypto'
import type { AppConfig } from '../../config/env.js'
import type { WhatsAppAccountRecord } from '../../db/schema/index.js'

export interface WhatsAppSendResult {
  providerMessageId: string | null
  status: 'sent' | 'failed'
  errorMessage: string | null
  dryRun: boolean
}

interface GraphErrorBody {
  error?: {
    message?: string
    code?: number
  }
}

function toGraphPhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

function truncateError(value: string): string {
  return value.length > 500 ? `${value.slice(0, 500)}...` : value
}

export async function sendWhatsAppText(
  config: AppConfig,
  account: WhatsAppAccountRecord,
  to: string,
  body: string,
): Promise<WhatsAppSendResult> {
  if (config.whatsappMode === 'disabled') {
    return {
      providerMessageId: null,
      status: 'failed',
      errorMessage: 'Envio pelo WhatsApp está desabilitado neste ambiente.',
      dryRun: false,
    }
  }

  if (config.whatsappMode === 'dry-run') {
    return {
      providerMessageId: `dry-run-${randomUUID()}`,
      status: 'sent',
      errorMessage: null,
      dryRun: true,
    }
  }

  if (!config.whatsappAccessToken) {
    return {
      providerMessageId: null,
      status: 'failed',
      errorMessage: 'Token de acesso do WhatsApp não configurado.',
      dryRun: false,
    }
  }

  const url = `https://graph.facebook.com/${config.whatsappApiVersion}/${account.phoneNumberId}/messages`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.whatsappAccessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toGraphPhone(to),
        type: 'text',
        text: {
          preview_url: false,
          body,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      let message = `A Cloud API respondeu com status ${response.status}.`

      try {
        const payload = (await response.json()) as GraphErrorBody
        if (payload.error?.message) {
          message = payload.error.message
        }
      } catch {
        message = `A Cloud API respondeu com status ${response.status}.`
      }

      return {
        providerMessageId: null,
        status: 'failed',
        errorMessage: truncateError(message),
        dryRun: false,
      }
    }

    const payload = (await response.json()) as {
      messages?: Array<{ id?: string }>
    }

    return {
      providerMessageId: payload.messages?.[0]?.id ?? null,
      status: 'sent',
      errorMessage: null,
      dryRun: false,
    }
  } catch (error) {
    return {
      providerMessageId: null,
      status: 'failed',
      errorMessage: truncateError(
        error instanceof Error ? error.message : 'Falha ao contatar a Cloud API.',
      ),
      dryRun: false,
    }
  }
}
