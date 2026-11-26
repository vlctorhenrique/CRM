import { PageHeader } from '@/components/shell/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getHealth, getReports } from '@/lib/api'

export const metadata = {
  title: 'Relatórios',
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-surface-muted p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold text-ink">{value}</p>
    </div>
  )
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const filters = await searchParams
  const [summary, health] = await Promise.all([getReports(filters), getHealth()])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Indicadores"
        title="Relatórios"
        description="Resumo comercial do período selecionado, com os mesmos filtros de permissão da API."
      />

      <Card>
        <CardHeader>
          <CardTitle>Filtrar período</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" action="/relatorios" className="flex flex-wrap items-end gap-3">
            <label className="space-y-1.5" htmlFor="reports-from">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">De</span>
              <Input id="reports-from" name="from" type="date" defaultValue={filters.from ?? ''} />
            </label>
            <label className="space-y-1.5" htmlFor="reports-to">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Até</span>
              <Input id="reports-to" name="to" type="date" defaultValue={filters.to ?? ''} />
            </label>
            <Button type="submit" variant="secondary">
              Aplicar
            </Button>
          </form>
        </CardContent>
      </Card>

      {!summary ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted">
              Não foi possível carregar os indicadores. Verifique se a API está disponível.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Período</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <span>{new Date(summary.period.from).toLocaleDateString('pt-BR')}</span>
              <span>até</span>
              <span>{new Date(summary.period.to).toLocaleDateString('pt-BR')}</span>
              {health?.backlog ? (
                <Badge tone="neutral">{health.backlog.cadenceTasksPending} tarefas na fila</Badge>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Funil de leads</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Total" value={summary.leads.total} />
              <Metric label="Novos" value={summary.leads.new} />
              <Metric label="Agendados" value={summary.leads.scheduled} />
              <Metric label="Perdidos" value={summary.leads.lost} />
              <Metric label="Opt-out" value={summary.leads.optOut} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Agenda</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Metric label="Agendamentos" value={summary.appointments.total} />
                <Metric label="Conversão" value={`${summary.appointments.conversionRate}%`} />
                <Metric label="Concluídos" value={summary.appointments.completed} />
                <Metric label="Cancelados" value={summary.appointments.cancelled} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cadências e mensagens</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Metric label="Inscrições ativas" value={summary.cadences.activeEnrollments} />
                <Metric label="Mensagens enviadas" value={summary.cadences.tasksSent} />
                <Metric label="Inbound" value={summary.messaging.inbound} />
                <Metric label="Outbound" value={summary.messaging.outbound} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
