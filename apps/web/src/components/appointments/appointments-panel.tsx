'use client'

import type { AppointmentStatus, AppointmentView } from '@crm/shared'
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

const statusTone: Record<AppointmentStatus, 'brand' | 'neutral' | 'sand' | 'danger' | 'success'> = {
  scheduled: 'sand',
  confirmed: 'brand',
  completed: 'success',
  cancelled: 'danger',
  no_show: 'neutral',
}

export function AppointmentsPanel({
  leads,
  appointments,
}: {
  leads: LeadOption[]
  appointments: AppointmentView[]
}) {
  const router = useRouter()
  const [leadId, setLeadId] = useState(leads[0]?.id ?? '')
  const [scheduledAt, setScheduledAt] = useState('')
  const [duration, setDuration] = useState('60')
  const [procedure, setProcedure] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (!leadId || !scheduledAt) {
      setError('Informe o lead e a data do agendamento.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      await apiRequest('/v1/appointments', {
        method: 'POST',
        body: JSON.stringify({
          leadId,
          scheduledAt: new Date(scheduledAt).toISOString(),
          durationMinutes: Number(duration),
          procedure: procedure || undefined,
        }),
      })
      setScheduledAt('')
      setProcedure('')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Não foi possível agendar.')
    } finally {
      setBusy(false)
    }
  }

  const updateStatus = async (id: string, status: AppointmentStatus) => {
    setBusy(true)
    setError(null)

    try {
      await apiRequest(`/v1/appointments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(
          status === 'cancelled'
            ? { status, cancellationReason: 'Cancelado pelo painel' }
            : { status },
        ),
      })
      router.refresh()
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Não foi possível atualizar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Novo agendamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block space-y-1.5">
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
          <label className="block space-y-1.5" htmlFor="appointment-scheduled-at">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Data e hora
            </span>
            <Input
              id="appointment-scheduled-at"
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Duração
            </span>
            <select
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-ink"
            >
              <option value="30">30 minutos</option>
              <option value="60">60 minutos</option>
              <option value="90">90 minutos</option>
            </select>
          </label>
          <label className="block space-y-1.5" htmlFor="appointment-procedure">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Procedimento
            </span>
            <Input
              id="appointment-procedure"
              value={procedure}
              onChange={(event) => setProcedure(event.target.value)}
              placeholder="Ex.: Botox"
            />
          </label>
          {error ? <p className="text-sm text-danger-700">{error}</p> : null}
          <Button onClick={() => void create()} disabled={busy || leads.length === 0}>
            {busy ? 'Salvando...' : 'Agendar'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Próximos agendamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {appointments.length === 0 ? (
            <p className="text-sm text-muted">Nenhum agendamento registrado no período.</p>
          ) : (
            <div className="divide-y divide-line">
              {appointments.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-44 flex-1">
                    <p className="text-sm font-semibold text-ink">{item.leadName ?? item.phone}</p>
                    <p className="text-xs text-muted">
                      {new Date(item.scheduledAt).toLocaleString('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                      })}{' '}
                      · {item.durationMinutes} min
                      {item.procedure ? ` · ${item.procedure}` : ''}
                    </p>
                  </div>
                  <Badge tone={statusTone[item.status]}>{item.status}</Badge>
                  {item.status === 'scheduled' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void updateStatus(item.id, 'confirmed')}
                    >
                      Confirmar
                    </Button>
                  ) : null}
                  {item.status === 'scheduled' || item.status === 'confirmed' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void updateStatus(item.id, 'cancelled')}
                    >
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
