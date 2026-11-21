import type { FastifyInstance } from 'fastify'
import { AppError } from '../../lib/errors.js'
import {
  isValidWebhookSignature,
  parseWebhookPayload,
  processWebhookPayload,
} from './webhook.service.js'

export async function registerWhatsAppWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/webhooks/whatsapp',
    {
      schema: {
        tags: ['WhatsApp'],
        summary: 'Verifica o webhook da WhatsApp Cloud API',
        hide: true,
      },
    },
    async (request, reply) => {
      const query = request.query as Record<string, string | undefined>
      const mode = query['hub.mode']
      const token = query['hub.verify_token']
      const challenge = query['hub.challenge']

      if (!app.config.whatsappVerifyToken) {
        throw new AppError(
          503,
          'WHATSAPP_NOT_CONFIGURED',
          'Verificação do WhatsApp não configurada.',
        )
      }

      if (mode === 'subscribe' && token === app.config.whatsappVerifyToken && challenge) {
        return reply.type('text/plain').send(challenge)
      }

      throw new AppError(403, 'WEBHOOK_VERIFICATION_FAILED', 'Verificação do webhook recusada.')
    },
  )

  app.post(
    '/webhooks/whatsapp',
    {
      config: {
        rateLimit: {
          max: 600,
          timeWindow: '1 minute',
        },
      },
      schema: {
        tags: ['WhatsApp'],
        summary: 'Recebe eventos da WhatsApp Cloud API',
        hide: true,
      },
    },
    async (request, reply) => {
      const rawBody = request.rawBody

      if (!rawBody) {
        throw new AppError(400, 'INVALID_WEBHOOK_PAYLOAD', 'Corpo do webhook ausente.')
      }

      if (app.config.whatsappAppSecret) {
        const signature = request.headers['x-hub-signature-256']
        const signatureValue = Array.isArray(signature) ? signature[0] : signature

        if (!isValidWebhookSignature(app.config.whatsappAppSecret, rawBody, signatureValue)) {
          throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Assinatura do webhook inválida.')
        }
      }

      const payload = parseWebhookPayload(request.body)
      const result = await processWebhookPayload({ db: app.db, config: app.config }, payload)

      return reply.status(200).send({
        received: true,
        processed: result.processed,
        ignored: result.ignored,
      })
    },
  )
}
