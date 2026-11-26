'use client'

import type { CadenceEnrollmentView, CadenceView, MessageTemplateView } from '@crm/shared'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ApiClientError, apiRequest } from '@/lib/client-api'

interface LeadOption {
  id: string
  name: string | null
  phone: string
}

export function CadencesPanel({
  leads,
  cadences,
  templates,
  enrollments,
}: {
  leads: LeadOption[]
  cadences: CadenceView[]
  templates: MessageTemplateView[]
  enrollments: CadenceEnrollmentView[]
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [delay, setDelay] = useState('24')
  const [leadId, setLeadId] = useState(leads[0]?.id ?? '')
  const [enrollCadenceId, setEnrollCadenceId] = useState(cadences[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      router.refresh()
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Não foi possível concluir.')
    } finally {
      setBusy(false)
    }
  }

  const createCadence = () =>
    run(async () => {
      if (!name.trim() || !templateId) {
        throw new ApiClientError('Informe nome e template.', 'MISSING_FIELDS', 422)
      }
      await apiRequest('/v1/cadences', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          steps: [{ templateId, delayHours: Number(delay) }],
        }),
      })
      setName('')
    })

  const activate = (id: string) =>
    run(async () => {
      await apiRequest(`/v1/cadences/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      })
    })

  const enroll = () =>
    run(async () => {
      if (!leadId || !enrollCadenceId) {
        throw new ApiClientError('Selecione lead e cadência.', 'MISSING_FIELDS', 422)
      }
      await apiRequest(`/v1/cadences/${enrollCadenceId}/enroll`, {
        method: 'POST',
        body: JSON.stringify({ leadId }),
      })
    })

  const updateEnrollment = (id: string, status: 'paused' | 'active' | 'cancelled') =>
    run(async () => {
      await apiRequest(`/v1/cadence-enrollments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(
          status === 'cancelled' ? { status, reason: 'Cancelado pelo painel' } : { status },
        ),
      })
    })

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Nova cadência</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block space-y-1.5" htmlFor="cadence-name">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Nome</span>
              <Input
                id="cadence-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Template aprovado
              </span>
              <select
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
                className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-ink"
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.status})
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5" htmlFor="cadence-delay">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Primeiro envio (horas)
              </span>
              <Input
                id="cadence-delay"
                type="number"
                min={0}
                max={336}
                value={delay}
                onChange={(event) => setDelay(event.target.value)}
              />
            </label>
            {error ? <p className="text-sm text-danger-700">{error}</p> : null}
            <Button onClick={() => void createCadence()} disabled={busy}>
              Criar rascunho
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cadências</CardTitle>
          </CardHeader>
          <CardContent>
            {cadences.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma cadência cadastrada.</p>
            ) : (
              <div className="divide-y divide-line">
                {cadences.map((cadence) => (
                  <div key={cadence.id} className="flex items-center gap-3 py-3">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-ink">{cadence.name}</p>
                      <p className="text-xs text-muted">
                        {cadence.steps.length} passos · {cadence.activeEnrollments} ativas
                      </p>
                    </div>
                    <Badge tone={cadence.status === 'active' ? 'success' : 'neutral'}>
                      {cadence.status}
                    </Badge>
                    {cadence.status === 'draft' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void activate(cadence.id)}
                      >
                        Ativar
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inscrições</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-48 flex-1 space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Lead</span>
              <select
                value={leadId}
                onChange={(event) => setLeadId(event.target.value)}
                className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-ink"
              >
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.name ?? lead.phone}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-48 flex-1 space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Cadência ativa
              </span>
              <select
                value={enrollCadenceId}
                onChange={(event) => setEnrollCadenceId(event.target.value)}
                className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-ink"
              >
                {cadences.map((cadence) => (
                  <option key={cadence.id} value={cadence.id}>
                    {cadence.name}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={() => void enroll()} disabled={busy}>
              Inscrever
            </Button>
          </div>

          <div className="divide-y divide-line">
            {enrollments.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma inscrição ativa.</p>
            ) : (
              enrollments.map((enrollment) => (
                <div key={enrollment.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-44 flex-1">
                    <p className="text-sm font-semibold text-ink">
                      {enrollment.leadName ?? enrollment.phone}
                    </p>
                    <p className="text-xs text-muted">{enrollment.cadenceName}</p>
                  </div>
                  <Badge tone={enrollment.status === 'active' ? 'success' : 'neutral'}>
                    {enrollment.status}
                  </Badge>
                  {enrollment.status === 'active' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void updateEnrollment(enrollment.id, 'paused')}
                    >
                      Pausar
                    </Button>
                  ) : null}
                  {enrollment.status === 'paused' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void updateEnrollment(enrollment.id, 'active')}
                    >
                      Retomar
                    </Button>
                  ) : null}
                  {enrollment.status !== 'cancelled' && enrollment.status !== 'completed' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void updateEnrollment(enrollment.id, 'cancelled')}
                    >
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
