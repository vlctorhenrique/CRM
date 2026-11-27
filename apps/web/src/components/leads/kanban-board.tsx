'use client'

import { LEAD_STATUS_LABELS, LEAD_STATUSES, type LeadListItem, type LeadStatus } from '@crm/shared'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { ApiClientError, updateLeadStatus } from '@/lib/client-api'
import { leadStatusTone } from '@/lib/presentation'
import { cn, formatDateTime, initials } from '@/lib/utils'

const LANES: Array<{ title: string; description: string; statuses: LeadStatus[] }> = [
  {
    title: 'Entrada',
    description: 'Primeiro contato e pré-qualificação',
    statuses: ['new', 'first_contact', 'qualifying'],
  },
  {
    title: 'Aguardando SDR',
    description: 'Prontos para assumir',
    statuses: ['waiting_sdr'],
  },
  {
    title: 'Atendimento',
    description: 'Conversa e agendamento',
    statuses: ['human_service', 'waiting_schedule'],
  },
  {
    title: 'Agendado',
    description: 'Horário registrado',
    statuses: ['scheduled'],
  },
  {
    title: 'Cadência',
    description: 'Recuperação de oportunidades',
    statuses: ['waiting_cadence', 'in_cadence', 'cadence_completed', 'future_recovery'],
  },
  {
    title: 'Encerrados',
    description: 'Sem contato ou bloqueados',
    statuses: ['lost', 'opt_out'],
  },
]

export function KanbanBoard({ leads }: { leads: LeadListItem[] }) {
  const router = useRouter()
  const [moving, setMoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function move(leadId: string, status: string) {
    setMoving(leadId)
    setError(null)

    try {
      await updateLeadStatus(leadId, status)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Não foi possível mover o lead.')
    } finally {
      setMoving(null)
    }
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm font-medium text-danger-700">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {LANES.map((lane) => {
          const items = leads.filter((lead) => lane.statuses.includes(lead.status))

          return (
            <section
              key={lane.title}
              className="flex min-h-64 flex-col rounded-2xl border border-line bg-surface-muted/60 p-3"
            >
              <header className="mb-3 flex items-start justify-between gap-2 px-1">
                <div>
                  <h2 className="text-sm font-semibold text-ink">{lane.title}</h2>
                  <p className="text-xs text-muted">{lane.description}</p>
                </div>
                <Badge tone="neutral">{items.length}</Badge>
              </header>

              <div className="flex-1 space-y-2">
                {items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-muted">
                    Nenhum lead nesta etapa
                  </p>
                ) : (
                  items.map((lead) => (
                    <article
                      key={lead.id}
                      className="rounded-xl border border-line bg-surface p-3 shadow-sm"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-800">
                          {initials(lead.name ?? lead.phone)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/leads/${lead.id}`}
                            className="block truncate text-sm font-semibold text-ink hover:text-brand-700"
                          >
                            {lead.name ?? 'Sem nome'}
                          </Link>
                          <p className="truncate text-xs text-muted">{lead.phone}</p>
                        </div>
                        {lead.unreadCount > 0 ? (
                          <Badge tone="brand">{lead.unreadCount}</Badge>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge tone={leadStatusTone(lead.status)}>
                          {LEAD_STATUS_LABELS[lead.status]}
                        </Badge>
                        {lead.interestProcedure ? (
                          <Badge tone="neutral">{lead.interestProcedure}</Badge>
                        ) : null}
                      </div>

                      <p className="mt-2 line-clamp-2 text-xs text-ink-soft">
                        {lead.lastMessagePreview ?? 'Sem conversa iniciada'}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="truncate text-[11px] text-muted">
                          {lead.ownerName ?? 'Não atribuído'}
                          {lead.lastMessageAt ? ` · ${formatDateTime(lead.lastMessageAt)}` : ''}
                        </span>
                        <select
                          aria-label={`Mover ${lead.name ?? lead.phone} para etapa`}
                          value={lead.status}
                          disabled={moving === lead.id}
                          onChange={(event) => void move(lead.id, event.target.value)}
                          className={cn(
                            'max-w-40 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] text-ink-soft',
                            moving === lead.id && 'opacity-60',
                          )}
                        >
                          {LEAD_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {LEAD_STATUS_LABELS[status]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
