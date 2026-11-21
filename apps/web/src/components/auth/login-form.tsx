'use client'

import type { SessionResponse } from '@crm/shared'
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, Mail } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiClientError, apiRequest } from '@/lib/client-api'

const highlights = [
  'Leads do WhatsApp centralizados e sem duplicidade',
  'IA que pré-qualifica sem substituir a SDR',
  'Cadências com controle, horário e conformidade',
]

export function LoginForm({ showDemoHints }: { showDemoHints: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantSlug, setTenantSlug] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const payload: { email: string; password: string; tenantSlug?: string } = {
        email,
        password,
      }

      if (tenantSlug.trim()) {
        payload.tenantSlug = tenantSlug.trim()
      }

      await apiRequest<SessionResponse>('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      router.replace('/dashboard')
      router.refresh()
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError
          ? requestError.message
          : 'Não foi possível entrar. Verifique sua conexão e tente novamente.',
      )
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.08fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute -left-32 top-1/3 size-[34rem] rounded-full opacity-40 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(79,174,128,0.55) 0%, rgba(21,116,83,0.08) 62%, transparent 72%)',
          }}
        />
        <div
          className="pointer-events-none absolute -right-40 -top-32 size-[28rem] rounded-full opacity-30 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(199,154,58,0.55) 0%, rgba(199,154,58,0.04) 65%, transparent 75%)',
          }}
        />

        <div className="relative flex items-center gap-3">
          <BrandMark className="bg-white/10 text-white ring-1 ring-white/15" />
          <div>
            <p className="font-display text-lg font-semibold leading-tight">CRM Clínicas</p>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-200">
              Estética e emagrecimento
            </p>
          </div>
        </div>

        <div className="relative max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">
            Operação comercial
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.12] text-balance">
            Atendimento que acolhe. Processo que converte.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-brand-100/85">
            Um só lugar para responder leads, organizar a pré-qualificação e recuperar oportunidades
            com segurança.
          </p>

          <ul className="mt-9 space-y-4">
            {highlights.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-brand-50/90">
                <CheckCircle2
                  className="mt-0.5 size-5 shrink-0 text-brand-300"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between border-t border-white/10 pt-6 text-xs text-brand-200">
          <span>WhatsApp Cloud API oficial</span>
          <span>Dados segregados por clínica</span>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-[26rem] animate-rise">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <div>
              <p className="font-display text-lg font-semibold leading-tight">CRM Clínicas</p>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                Estética e emagrecimento
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-brand-700">Bem-vindo de volta</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-ink">Entrar no painel</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Use as credenciais fornecidas pelo administrador da sua clínica.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-ink-soft">
                E-mail
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="voce@clinica.com.br"
                  className="pl-10"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-ink-soft">
                  Senha
                </label>
                <span className="text-xs text-muted">Mínimo de 10 caracteres</span>
              </div>
              <div className="relative">
                <LockKeyhole
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="Sua senha"
                  className="pl-10 pr-11"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:bg-brand-50 hover:text-brand-700"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="tenantSlug" className="text-sm font-medium text-ink-soft">
                Código da clínica <span className="font-normal text-muted">(opcional)</span>
              </label>
              <Input
                id="tenantSlug"
                name="tenantSlug"
                autoComplete="organization"
                placeholder="clinica-demo"
                value={tenantSlug}
                onChange={(event) => setTenantSlug(event.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-muted">
                Necessário apenas se seu e-mail estiver vinculado a mais de uma clínica.
              </p>
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-xl border border-danger-500/20 bg-danger-50 px-3.5 py-3 text-sm text-danger-700"
              >
                {error}
              </div>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Entrando...
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight className="size-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </form>

          {showDemoHints ? (
            <div className="mt-6 rounded-xl border border-sand-300/70 bg-sand-100 px-4 py-3 text-xs text-sand-700">
              <p className="font-semibold">Ambiente de demonstração</p>
              <p className="mt-1">
                admin@clinica.demo · ChangeMe123!{' '}
                <span className="opacity-70">(troque no primeiro acesso)</span>
              </p>
            </div>
          ) : null}

          <p className="mt-8 text-xs leading-relaxed text-muted">
            Ao entrar, você concorda com as políticas de uso e privacidade da clínica. Dados de
            saúde são tratados conforme a LGPD.
          </p>
        </div>
      </section>
    </main>
  )
}
