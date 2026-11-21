import {
  type DashboardSummary,
  LEAD_STATUS_LABELS,
  ROLE_LABELS,
  WHATSAPP_CONNECTION_LABELS,
  WHATSAPP_MODE_LABELS,
} from '@crm/shared'
import {
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Database,
  Inbox,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/shell/page-header'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  getDashboardSummary,
  getHealth,
  getLeads,
  getSession,
  getTeamMembers,
  getWhatsAppAccount,
} from '@/lib/api'
import { connectionTone, leadStatusTone, modeTone } from '@/lib/presentation'
import { formatDateTime, initials } from '@/lib/utils'

export const metadata = {
  title: 'Visão geral',
}

const emptySummary: DashboardSummary = {
  totalLeads: 0,
  newLeads: 0,
  inService: 0,
  waitingSdr: 0,
  scheduled: 0,
  lost: 0,
  unreadConversations: 0,
  messagesSentToday: 0,
  conversionRate: 0,
}

const roadmap = [
  { stage: 'Etapa 1', title: 'Fundação', status: 'Concluída', done: true },
  { stage: 'Etapa 2', title: 'CRM e WhatsApp', status: 'Concluída', done: true },
  { stage: 'Etapa 3', title: 'IA assistiva', status: 'Próxima', done: false },
  { stage: 'Etapa 4', title: 'SDR e agendamento', status: 'Planejada', done: false },
  { stage: 'Etapa 5', title: 'Cadências', status: 'Planejada', done: false },
  { stage: 'Etapa 6', title: 'Indicadores e robustez', status: 'Planejada', done: false },
]

export default async function DashboardPage() {
  const session = await getSession()

  if (!session) {
    redirect('/login')
  }

  const canSeeTeam = session.user.role === 'admin' || session.user.role === 'manager'
  const [summary, recentLeads, whatsapp, health, team] = await Promise.all([
    getDashboardSummary(),
    getLeads({ limit: 5 }),
    getWhatsAppAccount(),
    getHealth(),
    canSeeTeam ? getTeamMembers() : Promise.resolve([]),
  ])

  const data = summary ?? emptySummary
  const apiOnline = health !== null
  const redisOk = health?.checks.redis === 'ok'
  const metrics = [
    {
      label: 'Leads na base',
      value: data.totalLeads,
      hint: `${data.newLeads} novo(s) nos últimos 7 dias`,
      icon: Users,
    },
    {
      label: 'Aguardando SDR',
      value: data.waitingSdr,
      hint: 'Prioridade de atendimento',
      icon: Inbox,
    },
    {
      label: 'Agendados',
      value: data.scheduled,
      hint: `${data.conversionRate}% de conversão da base`,
      icon: CalendarCheck2,
    },
    {
      label: 'Conversas não lidas',
      value: data.unreadConversations,
      hint: `${data.messagesSentToday} mensagem(ns) enviada(s) em 24h`,
      icon: MessageSquare,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Painel comercial"
        title={`Olá, ${session.user.name.split(' ')[0]}`}
        description="Acompanhe a operação de WhatsApp, os leads em atendimento e as pendências da clínica em tempo real."
        actions={
          <Link
            href="/leads"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            Ver leads
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon

          return (
            <Card key={metric.label} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-muted">{metric.label}</p>
                <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">
                {metric.value}
              </p>
              <p className="mt-1.5 text-xs text-muted">{metric.hint}</p>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-ink">Leads recentes</h2>
              <p className="mt-0.5 text-sm text-muted">Últimos contatos que entraram no CRM.</p>
            </div>
            <Link
              href="/leads"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              Ver todos
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          {recentLeads.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <Users className="size-7 text-muted" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-ink">Nenhum lead cadastrado</p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">
                Configure o webhook do WhatsApp ou cadastre um contato manualmente para começar.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {recentLeads.items.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-muted"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-800">
                    {initials(lead.name ?? lead.phone)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {lead.name ?? lead.phone}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {lead.lastMessagePreview ?? 'Cadastro manual'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={leadStatusTone(lead.status)}>
                      {LEAD_STATUS_LABELS[lead.status]}
                    </Badge>
                    <span className="text-[10px] text-muted">
                      {formatDateTime(lead.lastMessageAt ?? lead.createdAt)}
                    </span>
                  </div>
                  {lead.unreadCount > 0 ? (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                      {lead.unreadCount}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">WhatsApp da clínica</h2>
                <p className="mt-0.5 text-sm text-muted">Canal oficial de atendimento.</p>
              </div>
              <MessageSquare className="size-5 text-brand-600" aria-hidden="true" />
            </div>

            {whatsapp ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-line bg-surface-muted px-3.5 py-3">
                  <p className="text-sm font-semibold text-ink">{whatsapp.displayPhoneNumber}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted">
                    ID {whatsapp.phoneNumberId}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={connectionTone(whatsapp.status)}>
                    {WHATSAPP_CONNECTION_LABELS[whatsapp.status]}
                  </Badge>
                  <Badge tone={modeTone(whatsapp.mode)}>
                    {WHATSAPP_MODE_LABELS[whatsapp.mode]}
                  </Badge>
                  <Badge tone={whatsapp.credentialsConfigured ? 'success' : 'neutral'}>
                    {whatsapp.credentialsConfigured
                      ? 'Credenciais ativas'
                      : 'Credenciais pendentes'}
                  </Badge>
                </div>
                {whatsapp.initialMessage ? (
                  <p className="line-clamp-3 rounded-xl bg-sand-100/60 px-3.5 py-3 text-xs leading-relaxed text-sand-700">
                    {whatsapp.initialMessage}
                  </p>
                ) : (
                  <p className="text-xs text-muted">Mensagem inicial automática desativada.</p>
                )}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-line-strong bg-surface-muted px-4 py-6 text-center text-xs leading-relaxed text-muted">
                Nenhum número configurado. Cadastre o phone number ID para receber leads do
                WhatsApp.
              </p>
            )}

            <Link
              href="/configuracoes"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              Gerenciar integração
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink">Resumo do pipeline</h2>
            <dl className="mt-4 space-y-2 text-sm">
              {[
                ['Em atendimento', data.inService],
                ['Aguardando SDR', data.waitingSdr],
                ['Agendados', data.scheduled],
                ['Perdidos', data.lost],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between rounded-xl border border-line bg-surface-muted px-3.5 py-2.5"
                >
                  <dt className="text-ink-soft">{label}</dt>
                  <dd className="font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-ink">Roadmap de implementação</h2>
              <p className="mt-1 text-sm text-muted">Entregas incrementais conforme o PRD.</p>
            </div>
            <ShieldCheck className="size-5 text-brand-600" aria-hidden="true" />
          </div>

          <ol className="mt-5 space-y-1">
            {roadmap.map((item, index) => (
              <li key={item.stage} className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span
                    className={
                      item.done
                        ? 'flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white'
                        : 'flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-[11px] font-bold text-muted'
                    }
                  >
                    {item.done ? <CheckCircle2 className="size-4" /> : index + 1}
                  </span>
                  {index < roadmap.length - 1 ? (
                    <span className="my-1 w-px flex-1 bg-line" />
                  ) : null}
                </div>
                <div className="flex flex-1 items-start justify-between gap-3 pb-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      {item.stage}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-ink">{item.title}</p>
                  </div>
                  <Badge tone={item.done ? 'success' : index === 2 ? 'sand' : 'neutral'}>
                    {item.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">Status da operação</h2>
              <Badge tone={apiOnline ? 'success' : 'danger'}>
                {apiOnline ? 'Operacional' : 'Offline'}
              </Badge>
            </div>

            <div className="mt-4 space-y-2.5">
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface-muted px-3.5 py-3">
                <span className="flex items-center gap-2 text-sm text-ink-soft">
                  <Database className="size-4 text-muted" aria-hidden="true" />
                  API e PostgreSQL
                </span>
                <Badge tone={apiOnline ? 'success' : 'danger'}>
                  {apiOnline
                    ? health.checks.database === 'ok'
                      ? 'Operacional'
                      : 'Degradado'
                    : 'Offline'}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface-muted px-3.5 py-3">
                <span className="flex items-center gap-2 text-sm text-ink-soft">
                  <RefreshCw className="size-4 text-muted" aria-hidden="true" />
                  Redis / filas
                </span>
                <Badge
                  tone={
                    redisOk ? 'success' : health?.checks.redis === 'disabled' ? 'neutral' : 'danger'
                  }
                >
                  {health?.checks.redis === 'ok'
                    ? 'Operacional'
                    : health?.checks.redis === 'disabled'
                      ? 'Aguardando Etapa 5'
                      : 'Verificar'}
                </Badge>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-muted">
              <span>{health ? `Versão ${health.version}` : 'Sem resposta da API'}</span>
              {health ? <span>Uptime {Math.floor(health.uptimeSeconds / 60)} min</span> : null}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
                {initials(session.user.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{session.user.name}</p>
                <p className="truncate text-xs text-muted">
                  {ROLE_LABELS[session.user.role]} · {session.user.email}
                </p>
              </div>
            </div>

            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted">Clínica</dt>
                <dd className="text-right font-medium text-ink">{session.tenant.name}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted">Fuso horário</dt>
                <dd className="text-right font-medium text-ink">{session.tenant.timezone}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted">Equipe</dt>
                <dd className="text-right font-medium text-ink">
                  {canSeeTeam
                    ? `${team.length} usuário${team.length === 1 ? '' : 's'}`
                    : 'Restrito ao seu perfil'}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  )
}
