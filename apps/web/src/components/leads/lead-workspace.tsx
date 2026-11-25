'use client'

import {
  type AuthUser,
  CONSENT_STATUS_LABELS,
  CONSENT_STATUSES,
  type ConversationView,
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  type LeadDetail,
  type LeadDetailResponse,
  MESSAGE_STATUS_LABELS,
  type MessageView,
  WHATSAPP_CONNECTION_LABELS,
  WHATSAPP_MODE_LABELS,
} from '@crm/shared'
import { AlertTriangle, CheckCircle2, Loader2, MessageSquare, Save, Send } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, inputClasses } from '@/components/ui/input'
import { ApiClientError, apiRequest } from '@/lib/client-api'
import { connectionTone, leadStatusTone, modeTone } from '@/lib/presentation'
import { cn, formatDateTime } from '@/lib/utils'

interface LeadWorkspaceProps {
  lead: LeadDetail
  conversation: ConversationView | null
  messages: MessageView[]
  whatsapp: LeadDetailResponse['whatsapp']
  team: AuthUser[]
  canAssign: boolean
}

function nullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function LeadWorkspace({
  lead,
  conversation,
  messages,
  whatsapp,
  team,
  canAssign,
}: LeadWorkspaceProps) {
  const router = useRouter()
  const markedRead = useRef(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: lead.name ?? '',
    status: lead.status,
    ownerUserId: lead.ownerUserId ?? '',
    interestProcedure: lead.interestProcedure ?? '',
    objective: lead.objective ?? '',
    bodyRegion: lead.bodyRegion ?? '',
    previousTreatment: lead.previousTreatment ?? '',
    notes: lead.notes ?? '',
    consentStatus: lead.consentStatus,
  })

  useEffect(() => {
    if (!conversation || markedRead.current || lead.unreadCount === 0) {
      return
    }

    markedRead.current = true
    void apiRequest(`/v1/leads/${lead.id}/read`, { method: 'POST' }).catch(() => undefined)
  }, [conversation, lead.id, lead.unreadCount])

  const sendBlockedReason = lead.optOutAt
    ? 'Este contato solicitou opt-out e não pode receber mensagens.'
    : !conversation
      ? 'Este lead ainda não possui conversa no WhatsApp.'
      : !whatsapp
        ? 'Número de WhatsApp da clínica não configurado.'
        : whatsapp.mode === 'disabled'
          ? 'O envio está desabilitado neste ambiente.'
          : !whatsapp.windowOpen
            ? 'A janela de 24 horas expirou. É necessário um template aprovado para retomar.'
            : null

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)

    try {
      await apiRequest(`/v1/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          status: form.status,
          ownerUserId: canAssign ? form.ownerUserId || null : undefined,
          interestProcedure: nullable(form.interestProcedure),
          objective: nullable(form.objective),
          bodyRegion: nullable(form.bodyRegion),
          previousTreatment: nullable(form.previousTreatment),
          notes: nullable(form.notes),
          consentStatus: form.consentStatus,
        }),
      })

      setNotice('Dados do lead atualizados.')
      router.refresh()
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError
          ? requestError.message
          : 'Não foi possível atualizar o lead.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!text.trim() || sendBlockedReason) {
      return
    }

    setSending(true)
    setError(null)
    setNotice(null)

    try {
      await apiRequest(`/v1/leads/${lead.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: text }),
      })
      setText('')
      setNotice(
        whatsapp?.mode === 'dry-run'
          ? 'Mensagem registrada em modo simulado (sem envio real).'
          : 'Mensagem enviada.',
      )
      router.refresh()
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError
          ? requestError.message
          : 'Não foi possível enviar a mensagem.',
      )
    } finally {
      setSending(false)
    }
  }

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <Card className="flex min-h-[36rem] flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-brand-600" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-ink">Conversa</h2>
            {conversation ? (
              <Badge tone={conversation.humanTakeover ? 'brand' : 'neutral'}>
                {conversation.humanTakeover ? 'Atendimento humano' : 'Automático'}
              </Badge>
            ) : null}
          </div>
          {whatsapp ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone={connectionTone(whatsapp.status)}>
                {WHATSAPP_CONNECTION_LABELS[whatsapp.status]}
              </Badge>
              <Badge tone={modeTone(whatsapp.mode)}>{WHATSAPP_MODE_LABELS[whatsapp.mode]}</Badge>
              <span className="text-muted">{whatsapp.displayPhoneNumber}</span>
            </div>
          ) : null}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto bg-surface-muted/60 p-5">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <MessageSquare className="size-8 text-muted" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-ink-soft">Nenhuma mensagem ainda</p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">
                Quando o contato enviar uma mensagem no WhatsApp, o histórico aparecerá aqui.
              </p>
            </div>
          ) : (
            messages.map((message) => {
              const inbound = message.direction === 'inbound'

              return (
                <div
                  key={message.id}
                  className={cn('flex', inbound ? 'justify-start' : 'justify-end')}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                      inbound
                        ? 'rounded-bl-md border border-line bg-surface text-ink'
                        : 'rounded-br-md bg-brand-700 text-white',
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words leading-relaxed">
                      {message.body ?? `[${message.type}]`}
                    </p>
                    <div
                      className={cn(
                        'mt-1.5 flex flex-wrap items-center gap-2 text-[10px]',
                        inbound ? 'text-muted' : 'text-brand-100/80',
                      )}
                    >
                      <span>{formatDateTime(message.createdAt)}</span>
                      {!inbound ? (
                        <span className="font-semibold">
                          {MESSAGE_STATUS_LABELS[message.status]}
                        </span>
                      ) : null}
                      {message.senderName ? <span>{message.senderName}</span> : null}
                    </div>
                    {message.errorMessage ? (
                      <p className="mt-1 text-[11px] font-medium text-danger-100">
                        {message.errorMessage}
                      </p>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="border-t border-line p-4">
          {error ? (
            <p
              className="mb-3 rounded-xl bg-danger-50 px-3 py-2 text-xs text-danger-700"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="mb-3 rounded-xl bg-success-50 px-3 py-2 text-xs text-success-700">
              {notice}
            </p>
          ) : null}

          {sendBlockedReason ? (
            <div className="flex items-start gap-2 rounded-xl bg-sand-100 px-3.5 py-3 text-xs leading-relaxed text-sand-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {sendBlockedReason}
            </div>
          ) : (
            <form onSubmit={handleSend} className="space-y-2">
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Escreva uma mensagem para o WhatsApp do lead"
                maxLength={4096}
                rows={3}
                className="w-full resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted">
                  A janela de atendimento fecha em{' '}
                  {whatsapp?.windowExpiresAt
                    ? formatDateTime(whatsapp.windowExpiresAt)
                    : '24 horas após a última mensagem recebida'}
                  .
                </p>
                <Button type="submit" size="sm" disabled={sending || !text.trim()}>
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Enviar
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Dados do lead</h2>
            <p className="mt-0.5 text-xs text-muted">Qualificação e responsável</p>
          </div>
          <Badge tone={leadStatusTone(lead.status)}>{LEAD_STATUS_LABELS[lead.status]}</Badge>
        </div>

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <label htmlFor="lead-detail-name" className="block text-sm font-medium text-ink-soft">
            Nome
            <Input
              id="lead-detail-name"
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              className="mt-1.5"
              required
              minLength={2}
              maxLength={120}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-ink-soft">
              Status
              <select
                value={form.status}
                onChange={(event) =>
                  updateField('status', event.target.value as typeof form.status)
                }
                className={`${inputClasses} mt-1.5`}
              >
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {LEAD_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-ink-soft">
              Responsável
              <select
                value={form.ownerUserId}
                onChange={(event) => updateField('ownerUserId', event.target.value)}
                disabled={!canAssign}
                className={`${inputClasses} mt-1.5 disabled:bg-surface-muted disabled:text-muted`}
              >
                <option value="">Não atribuído</option>
                {team.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label htmlFor="lead-detail-interest" className="block text-sm font-medium text-ink-soft">
            Procedimento de interesse
            <Input
              id="lead-detail-interest"
              value={form.interestProcedure}
              onChange={(event) => updateField('interestProcedure', event.target.value)}
              maxLength={120}
              className="mt-1.5"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label
              htmlFor="lead-detail-objective"
              className="block text-sm font-medium text-ink-soft"
            >
              Objetivo
              <Input
                id="lead-detail-objective"
                value={form.objective}
                onChange={(event) => updateField('objective', event.target.value)}
                maxLength={240}
                className="mt-1.5"
              />
            </label>
            <label
              htmlFor="lead-detail-body-region"
              className="block text-sm font-medium text-ink-soft"
            >
              Região do corpo
              <Input
                id="lead-detail-body-region"
                value={form.bodyRegion}
                onChange={(event) => updateField('bodyRegion', event.target.value)}
                maxLength={120}
                className="mt-1.5"
              />
            </label>
          </div>

          <label
            htmlFor="lead-detail-previous-treatment"
            className="block text-sm font-medium text-ink-soft"
          >
            Tratamento anterior
            <Input
              id="lead-detail-previous-treatment"
              value={form.previousTreatment}
              onChange={(event) => updateField('previousTreatment', event.target.value)}
              maxLength={240}
              className="mt-1.5"
            />
          </label>

          <label className="block text-sm font-medium text-ink-soft">
            Observações
            <textarea
              value={form.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              maxLength={4000}
              rows={4}
              className="mt-1.5 w-full resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
            />
          </label>

          <div>
            <label className="block text-sm font-medium text-ink-soft">
              Consentimento para contato
              <select
                value={form.consentStatus}
                onChange={(event) =>
                  updateField('consentStatus', event.target.value as typeof form.consentStatus)
                }
                className={`${inputClasses} mt-1.5`}
              >
                {CONSENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {CONSENT_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              O recebimento de uma mensagem não equivale a consentimento amplo. Registre apenas o
              que foi comprovadamente autorizado.
            </p>
            {form.consentStatus === 'granted' ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-success-700">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                Consentimento registrado para contato.
              </p>
            ) : null}
          </div>

          {lead.consentEvidence ? (
            <p className="rounded-xl bg-surface-muted px-3 py-2 text-[11px] leading-relaxed text-muted">
              Evidência: {lead.consentEvidence}
            </p>
          ) : null}

          {canAssign ? null : (
            <p className="rounded-xl bg-surface-muted px-3 py-2 text-[11px] text-muted">
              A atribuição de responsável é restrita a administradores e gerentes.
            </p>
          )}

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar alterações
          </Button>
        </form>

        <dl className="mt-5 space-y-2 border-t border-line pt-4 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Criado em</dt>
            <dd className="font-medium text-ink-soft">{formatDateTime(lead.createdAt)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Último contato</dt>
            <dd className="font-medium text-ink-soft">
              {lead.lastContactAt ? formatDateTime(lead.lastContactAt) : 'Sem contato'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Mensagem inicial</dt>
            <dd className="font-medium text-ink-soft">
              {lead.initialMessageSentAt ? formatDateTime(lead.initialMessageSentAt) : 'Pendente'}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  )
}
