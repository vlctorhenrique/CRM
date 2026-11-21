'use client'

import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiClientError, apiRequest } from '@/lib/client-api'

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(false)

    if (newPassword !== confirmPassword) {
      setError('A confirmação não corresponde à nova senha.')
      return
    }

    setLoading(true)

    try {
      await apiRequest<void>('/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess(true)
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError
          ? requestError.message
          : 'Não foi possível alterar a senha. Tente novamente.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-brand-600" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ink">Alterar senha</h2>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        As outras sessões deixam de ser renovadas e expiram em até 30 minutos.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="currentPassword" className="text-xs font-medium text-ink-soft">
            Senha atual
          </label>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            disabled={loading}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="newPassword" className="text-xs font-medium text-ink-soft">
            Nova senha
          </label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            disabled={loading}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="text-xs font-medium text-ink-soft">
            Confirmar nova senha
          </label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={loading}
          />
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-700">
            {error}
          </p>
        ) : null}

        {success ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-success-50 px-3 py-2 text-xs text-success-700">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Senha alterada com sucesso.
          </p>
        ) : null}

        <Button type="submit" size="sm" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Alterando...
            </>
          ) : (
            'Salvar nova senha'
          )}
        </Button>
      </form>
    </div>
  )
}
