'use client'

import {
  WHATSAPP_CONNECTION_LABELS,
  WHATSAPP_MODE_LABELS,
  type WhatsAppAccountView,
} from '@crm/shared'
import { CheckCircle2, Loader2, MessageSquare, Save, ShieldAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ApiClientError, apiRequest } from '@/lib/client-api'
import { connectionTone, modeTone } from '@/lib/presentation'
import { formatDateTime } from '@/lib/utils'

export function WhatsAppSettingsForm({
  account,
  canEdit,
}: {
  account: WhatsAppAccountView | null
  canEdit: boolean
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    phoneNumberId: account?.phoneNumberId ?? '',
    displayPhoneNumber: account?.displayPhoneNumber ?? '',
    initialMessage: account?.initialMessage ?? '',
    aiEnabled: account?.aiEnabled ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!account || !canEdit) {
      return
    }

    setSaving(true)
    setError(null)
    setNotice(null)

    try {
      await apiRequest('/v1/whatsapp/account', {
        method: 'PATCH',
        body: JSON.stringify({
          phoneNumberId: form.phoneNumberId,
          displayPhoneNumber: form.displayPhoneNumber,
          initialMessage: form.initialMessage,
          aiEnabled: form.aiEnabled,
        }),
      })
      setNotice('Configuração do WhatsApp atualizada.')
      router.refresh()
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError
          ? requestError.message
          : 'Não foi possível salvar a configuração.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-6 py-5">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-brand-600" aria-hidden="true" />
            <h2 className="text-base font-semibold text-ink">WhatsApp Cloud API</h2>
          </div>
          <p className="mt-1 text-sm text-muted">
            Canal oficial de entrada de leads e histórico de atendimento.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {account ? (
            <>
              <Badge tone={connectionTone(account.status)}>
                {WHATSAPP_CONNECTION_LABELS[account.status]}
              </Badge>
              <Badge tone={modeTone(account.mode)}>{WHATSAPP_MODE_LABELS[account.mode]}</Badge>
              <Badge tone={account.credentialsConfigured ? 'success' : 'neutral'}>
                {account.credentialsConfigured ? 'Credenciais ativas' : 'Credenciais pendentes'}
              </Badge>
            </>
          ) : (
            <Badge tone="danger">Não configurado</Badge>
          )}
        </div>
      </div>

      {account ? (
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-ink-soft">
                Phone number ID
                <Input
                  value={form.phoneNumberId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, phoneNumberId: event.target.value }))
                  }
                  disabled={!canEdit}
                  className="mt-1.5"
                  maxLength={64}
                  required
                />
              </label>
              <label className="block text-sm font-medium text-ink-soft">
                Número exibido
                <Input
                  value={form.displayPhoneNumber}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      displayPhoneNumber: event.target.value,
                    }))
                  }
                  disabled={!canEdit}
                  className="mt-1.5"
                  maxLength={32}
                  required
                />
              </label>
            </div>

            <label className="block text-sm font-medium text-ink-soft">
              Mensagem inicial automática
              <textarea
                value={form.initialMessage}
                onChange={(event) =>
                  setForm((current) => ({ ...current, initialMessage: event.target.value }))
                }
                disabled={!canEdit}
                maxLength={1024}
                rows={4}
                placeholder="Deixe em branco para não enviar mensagem automática."
                className="mt-1.5 w-full resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-surface-muted disabled:text-muted"
              />
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-muted px-4 py-3">
              <input
                type="checkbox"
                checked={form.aiEnabled}
                onChange={(event) =>
                  setForm((current) => ({ ...current, aiEnabled: event.target.checked }))
                }
                disabled={!canEdit}
                className="mt-0.5 size-4 accent-brand-600"
              />
              <span className="text-sm text-ink-soft">
                Habilitar IA assistiva nesta conta
                <span className="block text-xs text-muted">
                  A IA entra na Etapa 3; a preferência fica registrada desde já.
                </span>
              </span>
            </label>

            {error ? (
              <p
                className="rounded-xl bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="rounded-xl bg-success-50 px-3.5 py-2.5 text-sm text-success-700">
                {notice}
              </p>
            ) : null}

            {canEdit ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted">
                  Última atualização: {formatDateTime(account.updatedAt)}
                </p>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Salvar
                </Button>
              </div>
            ) : (
              <p className="flex items-center gap-2 rounded-xl bg-sand-100 px-3.5 py-2.5 text-xs text-sand-700">
                <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
                Somente administradores podem alterar a integração.
              </p>
            )}
          </form>

          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-surface-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Webhook
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Configure na Meta a URL pública{' '}
                <span className="font-mono text-xs">&lt;API&gt;/webhooks/whatsapp</span> e o token
                de verificação definido em{' '}
                <span className="font-mono text-xs">WHATSAPP_VERIFY_TOKEN</span>.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                A assinatura HMAC é validada em cada evento. Segredos e access token ficam
                exclusivamente nas variáveis de ambiente.
              </p>
            </div>

            <div className="rounded-xl border border-line p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <CheckCircle2 className="size-4 text-brand-600" aria-hidden="true" />
                Regras ativas
              </p>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted">
                <li>Deduplicação de lead pelo telefone normalizado.</li>
                <li>Primeiro atendimento único, sem repetição em reenvios.</li>
                <li>Opt-out bloqueia novos envios imediatamente.</li>
                <li>Janela de 24 horas aplicada ao envio manual.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-dashed border-line-strong p-4 text-xs leading-relaxed text-muted">
              WABA: {account.wabaId ?? 'não informado'}
              <br />
              ID interno: {account.id}
            </div>
          </div>
        </div>
      ) : (
        <div className="px-6 py-10 text-center">
          <p className="text-sm font-semibold text-ink">Nenhum número vinculado</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted">
            Execute o seed da clínica ou cadastre o número no banco para habilitar o recebimento de
            leads pelo WhatsApp.
          </p>
        </div>
      )}
    </Card>
  )
}
