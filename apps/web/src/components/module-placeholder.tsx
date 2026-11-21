import { ArrowRight, CheckCircle2, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/shell/page-header'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

export function ModulePlaceholder({
  icon: Icon,
  eyebrow,
  title,
  description,
  stage,
  features,
}: {
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  stage: string
  features: string[]
}) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <Card className="overflow-hidden">
        <div className="relative border-b border-line bg-surface-muted px-6 py-10 sm:px-10">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(21,116,83,0.12) 1px, transparent 0)',
              backgroundSize: '22px 22px',
            }}
          />
          <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm">
              <Icon className="size-6" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <Badge tone="sand">{stage}</Badge>
              <h2 className="mt-3 font-display text-xl font-semibold text-ink">
                Módulo preparado no roadmap
              </h2>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
                A fundação já está pronta. Esta área será entregue na etapa indicada, sem antecipar
                regras de negócio.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
            >
              Ver visão geral
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="grid gap-6 p-6 sm:grid-cols-2 sm:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              O que será entregue
            </p>
            <ul className="mt-4 space-y-3">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm text-ink-soft">
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-brand-500"
                    aria-hidden="true"
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-line bg-surface-muted p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              Escopo respeitado
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Nenhuma funcionalidade fora do PRD é simulada. A evolução segue as etapas aprovadas
              com testes e revisão ao final de cada entrega.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="brand">Multiempresa</Badge>
              <Badge tone="neutral">Auditoria</Badge>
              <Badge tone="neutral">LGPD</Badge>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
