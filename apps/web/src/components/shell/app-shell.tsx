'use client'

import { type MeResponse, ROLE_LABELS } from '@crm/shared'
import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode, useState } from 'react'
import { BrandMark } from '@/components/brand-mark'
import { Badge } from '@/components/ui/badge'
import { logoutRequest } from '@/lib/client-api'
import { cn, formatDate, initials } from '@/lib/utils'

const navigation = [
  { href: '/dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/conversas', label: 'Conversas', icon: MessageSquare },
  { href: '/cadencias', label: 'Cadências', icon: RefreshCw, phase: 'Etapa 5' },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays, phase: 'Etapa 4' },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3, phase: 'Etapa 6' },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]

function activeItem(pathname: string) {
  return navigation.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
}

export function AppShell({ session, children }: { session: MeResponse; children: ReactNode }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const current = activeItem(pathname)

  async function handleLogout() {
    setLoggingOut(true)

    try {
      await logoutRequest()
    } finally {
      window.location.assign('/login')
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-5 pt-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <BrandMark />
          <div>
            <p className="font-display text-base font-semibold leading-tight text-ink">
              CRM Clínicas
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Estética e emagrecimento
            </p>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen(false)}
          className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-brand-50 hover:text-brand-700 lg:hidden"
          aria-label="Fechar menu"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mx-4 rounded-xl border border-line bg-surface-muted px-3.5 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Clínica</p>
        <p className="mt-1 truncate text-sm font-semibold text-ink">{session.tenant.name}</p>
        <p className="truncate text-xs text-muted">/{session.tenant.slug}</p>
      </div>

      <nav className="mt-5 flex-1 space-y-1 overflow-y-auto px-3 scrollbar-thin" aria-label="Menu">
        {navigation.map((item) => {
          const Icon = item.icon
          const isActive = current?.href === item.href

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-ink-soft hover:bg-brand-50 hover:text-brand-800',
              )}
            >
              <Icon
                className={cn(
                  'size-[18px] shrink-0',
                  isActive ? 'text-white' : 'text-muted group-hover:text-brand-600',
                )}
                aria-hidden="true"
              />
              <span className="flex-1">{item.label}</span>
              {item.phase ? (
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                    isActive ? 'bg-white/15 text-white' : 'bg-surface text-muted ring-1 ring-line',
                  )}
                >
                  {item.phase}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-xl bg-surface-muted px-3 py-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
            {initials(session.user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{session.user.name}</p>
            <p className="truncate text-xs text-muted">{ROLE_LABELS[session.user.role]}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-50 hover:text-danger-700 disabled:opacity-60"
            aria-label="Sair"
            title="Sair"
          >
            {loggingOut ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LogOut className="size-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-40 w-[272px] -translate-x-full border-r border-line bg-surface transition-transform duration-200 lg:translate-x-0">
        {sidebar}
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
            onClick={() => setMenuOpen(false)}
            aria-label="Fechar menu"
          />
          <aside className="relative h-full w-[272px] translate-x-0 border-r border-line bg-surface shadow-2xl">
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex size-10 items-center justify-center rounded-xl border border-line bg-surface text-ink-soft lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="size-5" />
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {current?.label ?? 'Painel'}
              </p>
              <p className="hidden text-xs text-muted sm:block">{formatDate()}</p>
            </div>

            <Badge tone="success" className="hidden md:inline-flex">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Sessão protegida
            </Badge>

            <div className="flex items-center gap-2.5">
              <div className="hidden text-right sm:block">
                <p className="max-w-[18ch] truncate text-sm font-semibold text-ink">
                  {session.user.name}
                </p>
                <p className="text-xs text-muted">{ROLE_LABELS[session.user.role]}</p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
                {initials(session.user.name)}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
