import { ROLE_LABELS, USER_STATUS_LABELS, WEEKDAY_LABELS } from '@crm/shared'
import { Bot, CalendarClock, LockKeyhole, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { redirect } from 'next/navigation'
import { ChangePasswordForm } from '@/components/auth/change-password-form'
import { WhatsAppSettingsForm } from '@/components/settings/whatsapp-settings-form'
import { PageHeader } from '@/components/shell/page-header'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { getSession, getTeamMembers, getWhatsAppAccount } from '@/lib/api'
import { formatDateTime, initials } from '@/lib/utils'

export const metadata = {
  title: 'Configurações',
}

export default async function SettingsPage() {
  const session = await getSession()

  if (!session) {
    redirect('/login')
  }

  const canSeeTeam = session.user.role === 'admin' || session.user.role === 'manager'
  const [team, whatsapp] = await Promise.all([
    canSeeTeam ? getTeamMembers() : Promise.resolve([]),
    getWhatsAppAccount(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administração"
        title="Configurações"
        description="Dados da clínica, equipe e recursos fundamentais da operação."
        actions={
          <Badge tone="success">
            <LockKeyhole className="size-3.5" aria-hidden="true" />
            Ambiente protegido
          </Badge>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                Clínica
              </p>
              <h2 className="mt-2 font-display text-xl font-semibold text-ink">
                {session.tenant.name}
              </h2>
              <p className="mt-1 text-sm text-muted">Código: {session.tenant.slug}</p>
            </div>
            <Badge tone={session.tenant.isActive ? 'success' : 'danger'}>
              {session.tenant.isActive ? 'Ativa' : 'Inativa'}
            </Badge>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface-muted px-4 py-3.5">
              <dt className="text-xs font-medium text-muted">Fuso horário</dt>
              <dd className="mt-1 text-sm font-semibold text-ink">{session.tenant.timezone}</dd>
            </div>
            <div className="rounded-xl border border-line bg-surface-muted px-4 py-3.5">
              <dt className="text-xs font-medium text-muted">Cadastro</dt>
              <dd className="mt-1 text-sm font-semibold text-ink">
                {formatDateTime(session.user.createdAt)}
              </dd>
            </div>
          </dl>

          <div className="mt-6">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-brand-600" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-ink">Janela de envio permitida</h3>
            </div>
            <p className="mt-1 text-xs text-muted">
              O motor de cadência consultará estas regras antes de cada envio.
            </p>

            <div className="mt-3 overflow-hidden rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Dia</th>
                    <th className="px-4 py-2.5 font-semibold">Início</th>
                    <th className="px-4 py-2.5 font-semibold">Fim</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {session.tenant.businessHours.days.map((day) => (
                    <tr key={day.weekday} className={day.enabled ? '' : 'opacity-55'}>
                      <td className="px-4 py-2.5 text-ink-soft">{WEEKDAY_LABELS[day.weekday]}</td>
                      <td className="px-4 py-2.5 text-ink-soft">{day.enabled ? day.start : '—'}</td>
                      <td className="px-4 py-2.5 text-ink-soft">{day.enabled ? day.end : '—'}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={day.enabled ? 'success' : 'neutral'}>
                          {day.enabled ? 'Habilitado' : 'Bloqueado'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {session.tenant.businessHours.holidays.length > 0 ? (
              <p className="mt-3 text-xs text-muted">
                {session.tenant.businessHours.holidays.length} feriado(s) configurado(s).
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted">Nenhum feriado configurado.</p>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              Sua conta
            </p>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">
                {initials(session.user.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{session.user.name}</p>
                <p className="truncate text-xs text-muted">{session.user.email}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="brand">{ROLE_LABELS[session.user.role]}</Badge>
              <Badge tone="success">{USER_STATUS_LABELS[session.user.status]}</Badge>
            </div>
            <p className="mt-4 text-xs text-muted">
              Último acesso:{' '}
              {session.user.lastLoginAt ? formatDateTime(session.user.lastLoginAt) : 'Nunca'}
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-brand-600" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-ink">Segurança da fundação</h2>
            </div>
            <ul className="mt-4 space-y-3 text-sm text-ink-soft">
              <li className="flex gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                Cookies de sessão HttpOnly e SameSite
              </li>
              <li className="flex gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                Senhas com Argon2id e RBAC por perfil
              </li>
              <li className="flex gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                Isolamento por clínica em todas as consultas
              </li>
              <li className="flex gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                Trilha de auditoria para ações relevantes
              </li>
            </ul>
          </Card>

          <Card className="p-5">
            <ChangePasswordForm />
          </Card>
        </div>
      </div>

      <WhatsAppSettingsForm account={whatsapp} canEdit={session.user.role === 'admin'} />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <Users className="size-4 text-brand-600" aria-hidden="true" />
              <h2 className="text-base font-semibold text-ink">Equipe</h2>
            </div>
            <p className="mt-1 text-sm text-muted">
              {canSeeTeam
                ? 'Usuários vinculados a esta clínica.'
                : 'Seu perfil visualiza apenas os próprios resultados.'}
            </p>
          </div>
          {canSeeTeam ? <Badge tone="neutral">{team.length} usuário(s)</Badge> : null}
        </div>

        {canSeeTeam ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-6 py-3 font-semibold">Usuário</th>
                  <th className="px-6 py-3 font-semibold">Perfil</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Último acesso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {team.map((member) => (
                  <tr key={member.id}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-800">
                          {initials(member.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{member.name}</p>
                          <p className="truncate text-xs text-muted">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge tone={member.role === 'admin' ? 'brand' : 'neutral'}>
                        {ROLE_LABELS[member.role]}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Badge tone={member.status === 'active' ? 'success' : 'danger'}>
                        {USER_STATUS_LABELS[member.status]}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-muted">
                      {member.lastLoginAt ? formatDateTime(member.lastLoginAt) : 'Nunca acessou'}
                    </td>
                  </tr>
                ))}
                {team.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-sm text-muted">
                      Nenhum usuário disponível para exibição.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-medium text-ink-soft">
              Acesso restrito ao seu próprio resultado
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">
              Por decisão de privacidade do MVP, a SDR não visualiza os resultados individuais de
              outras SDRs. Administradores e gerentes acessam a equipe conforme permissão.
            </p>
          </div>
        )}
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        {[
          {
            icon: Bot,
            title: 'IA assistiva',
            stage: 'Etapa 3',
            description: 'Extração de dados, classificação e resumo silencioso.',
          },
          {
            icon: RefreshCw,
            title: 'Motor de cadências',
            stage: 'Etapa 5',
            description: 'Filas persistentes, idempotência e janela de envio.',
          },
        ].map((integration) => {
          const Icon = integration.icon

          return (
            <Card key={integration.title} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <Badge tone="neutral">{integration.stage}</Badge>
              </div>
              <h3 className="mt-4 text-sm font-semibold text-ink">{integration.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{integration.description}</p>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
