import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  type LeadListItem,
} from '@crm/shared'
import { MessageSquare, Search, SlidersHorizontal, UserRound } from 'lucide-react'
import Link from 'next/link'
import { NewLeadForm } from '@/components/leads/new-lead-form'
import { PageHeader } from '@/components/shell/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, inputClasses } from '@/components/ui/input'
import { getLeads, getSession, getTeamMembers } from '@/lib/api'
import { isLeadStatus, leadStatusTone } from '@/lib/presentation'
import { cn, formatDateTime, initials } from '@/lib/utils'

export const metadata = {
  title: 'Leads',
}

function LeadRow({ lead }: { lead: LeadListItem }) {
  return (
    <Link
      href={`/leads/${lead.id}`}
      className="group grid gap-3 px-5 py-4 transition-colors hover:bg-surface-muted sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
          {initials(lead.name ?? lead.phone)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{lead.name ?? 'Sem nome'}</p>
          <p className="truncate text-xs text-muted">{lead.phone}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={leadStatusTone(lead.status)}>{LEAD_STATUS_LABELS[lead.status]}</Badge>
        <span className="text-xs text-muted">{LEAD_SOURCE_LABELS[lead.source]}</span>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm text-ink-soft">
          {lead.lastMessagePreview ?? 'Sem conversa iniciada'}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {lead.lastMessageAt ? formatDateTime(lead.lastMessageAt) : 'Cadastro manual'}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="flex max-w-[12rem] items-center gap-1.5 truncate text-xs text-muted">
          <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
          {lead.ownerName ?? 'Não atribuído'}
        </span>
        {lead.unreadCount > 0 ? (
          <span className="flex min-w-6 items-center justify-center rounded-full bg-brand-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
            {lead.unreadCount}
          </span>
        ) : null}
      </div>
    </Link>
  )
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>
}) {
  const params = await searchParams
  const search = typeof params.search === 'string' ? params.search.trim() : ''
  const status = isLeadStatus(params.status) ? params.status : undefined
  const [session, leads, team] = await Promise.all([
    getSession(),
    getLeads({ search: search || undefined, status }),
    getTeamMembers(),
  ])

  if (!session) return null

  const canAssign = session.user.role === 'admin' || session.user.role === 'manager'
  const hasFilters = search.length > 0 || status !== undefined

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CRM comercial"
        title="Leads"
        description="Todos os contatos da clínica em um só lugar. A conversa do WhatsApp cria o lead automaticamente e o cadastro manual segue a mesma deduplicação por telefone."
        actions={
          <Badge tone="brand">
            {leads.total} lead{leads.total === 1 ? '' : 's'}
          </Badge>
        }
      />

      <NewLeadForm team={canAssign ? team : []} />

      <Card>
        <form
          method="GET"
          className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center"
        >
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              name="search"
              defaultValue={search}
              placeholder="Buscar por nome ou telefone"
              className="pl-10"
              aria-label="Buscar leads"
            />
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-muted" aria-hidden="true" />
            <select
              name="status"
              defaultValue={status ?? ''}
              className={`${inputClasses} min-w-48`}
              aria-label="Filtrar por status"
            >
              <option value="">Todos os status</option>
              {LEAD_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {LEAD_STATUS_LABELS[option]}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary" size="sm">
              Filtrar
            </Button>
            {hasFilters ? (
              <Link href="/leads" className="text-sm font-medium text-muted hover:text-brand-700">
                Limpar
              </Link>
            ) : null}
          </div>
        </form>

        {leads.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <MessageSquare className="size-5" aria-hidden="true" />
            </div>
            <p className="mt-4 text-sm font-semibold text-ink">
              {hasFilters ? 'Nenhum lead encontrado' : 'Nenhum lead ainda'}
            </p>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">
              {hasFilters
                ? 'Ajuste os filtros ou limpe a busca para ver todos os contatos.'
                : 'Cadastre um lead manualmente ou configure o webhook do WhatsApp para receber contatos automaticamente.'}
            </p>
            <Link
              href="/configuracoes"
              className="mt-4 text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              Configurar WhatsApp
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-line">
            <div className="hidden px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]">
              <span>Contato</span>
              <span>Etapa</span>
              <span>Última mensagem</span>
              <span className="sr-only">Responsável</span>
            </div>
            {leads.items.map((lead) => (
              <LeadRow key={lead.id} lead={lead} />
            ))}
          </div>
        )}
      </Card>

      {leads.total > leads.items.length ? (
        <p className={cn('text-center text-xs text-muted')}>
          Exibindo {leads.items.length} de {leads.total} leads. Refine a busca para encontrar um
          contato específico.
        </p>
      ) : null}
    </div>
  )
}
