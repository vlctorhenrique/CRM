import { LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS } from '@crm/shared'
import { ArrowLeft, CheckCircle2, Phone, ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LeadWorkspace } from '@/components/leads/lead-workspace'
import { Badge } from '@/components/ui/badge'
import { getLeadDetails, getSession, getTeamMembers } from '@/lib/api'
import { leadStatusTone } from '@/lib/presentation'

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  const [session, detail, team] = await Promise.all([
    getSession(),
    getLeadDetails(leadId),
    getTeamMembers(),
  ])

  if (!session) return null
  if (!detail) notFound()

  const { lead, conversation, messages, whatsapp } = detail
  const canAssign = session.user.role === 'admin' || session.user.role === 'manager'

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/leads"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-brand-700"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar para leads
        </Link>

        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={leadStatusTone(lead.status)}>{LEAD_STATUS_LABELS[lead.status]}</Badge>
              <span className="text-xs text-muted">{LEAD_SOURCE_LABELS[lead.source]}</span>
              {lead.unreadCount > 0 ? <Badge tone="brand">{lead.unreadCount} nova(s)</Badge> : null}
            </div>
            <h1 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl">
              {lead.name ?? 'Lead sem nome'}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5" aria-hidden="true" />
                {lead.phone}
              </span>
              <span>{lead.ownerName ? `Responsável: ${lead.ownerName}` : 'Sem responsável'}</span>
              {lead.interestProcedure ? <span>Interesse: {lead.interestProcedure}</span> : null}
            </div>
          </div>

          {conversation ? (
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs text-muted">
              <CheckCircle2 className="size-4 text-brand-600" aria-hidden="true" />
              {messages.length} mensagem(ns) no histórico
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-muted px-3.5 py-2.5 text-xs text-muted">
              Sem conversa no WhatsApp
            </div>
          )}
        </div>
      </div>

      {lead.optOutAt ? (
        <div className="flex items-start gap-3 rounded-2xl border border-danger-500/20 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Contato em opt-out</p>
            <p className="mt-0.5 text-xs leading-relaxed">
              Solicitado em {new Date(lead.optOutAt).toLocaleString('pt-BR')}. Novos envios estão
              bloqueados até que haja uma nova autorização registrada.
            </p>
          </div>
        </div>
      ) : null}

      <LeadWorkspace
        lead={lead}
        conversation={conversation}
        messages={messages}
        whatsapp={whatsapp}
        team={canAssign ? team : []}
        canAssign={canAssign}
      />
    </div>
  )
}
