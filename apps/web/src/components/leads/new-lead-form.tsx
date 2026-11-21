'use client'

import { type AuthUser, LEAD_SOURCE_LABELS, LEAD_SOURCES, type LeadDetail } from '@crm/shared'
import { Loader2, Plus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, inputClasses } from '@/components/ui/input'
import { ApiClientError, apiRequest } from '@/lib/client-api'

export function NewLeadForm({ team }: { team: AuthUser[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const form = new FormData(event.currentTarget)
    const ownerUserId = String(form.get('ownerUserId') ?? '').trim()

    try {
      const result = await apiRequest<{ lead: LeadDetail }>('/v1/leads', {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          phone: String(form.get('phone') ?? ''),
          source: String(form.get('source') ?? 'manual'),
          ownerUserId: ownerUserId || null,
          interestProcedure: String(form.get('interestProcedure') ?? ''),
        }),
      })

      router.push(`/leads/${result.lead.id}`)
      router.refresh()
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError
          ? requestError.message
          : 'Não foi possível cadastrar o lead.',
      )
    } finally {
      setPending(false)
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        Novo lead
      </Button>
    )
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Cadastrar lead manualmente</h2>
          <p className="mt-1 text-sm text-muted">
            O telefone é normalizado e não pode duplicar outro lead da clínica.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-ink"
          aria-label="Fechar formulário"
        >
          <X className="size-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label htmlFor="lead-name" className="text-sm font-medium text-ink-soft">
          Nome
          <Input
            id="lead-name"
            name="name"
            required
            minLength={2}
            maxLength={120}
            className="mt-1.5"
          />
        </label>
        <label htmlFor="lead-phone" className="text-sm font-medium text-ink-soft">
          WhatsApp
          <Input
            id="lead-phone"
            name="phone"
            required
            placeholder="(11) 99999-9999"
            className="mt-1.5"
            inputMode="tel"
          />
        </label>
        <label className="text-sm font-medium text-ink-soft">
          Origem
          <select name="source" className={`${inputClasses} mt-1.5`} defaultValue="manual">
            {LEAD_SOURCES.map((source) => (
              <option key={source} value={source}>
                {LEAD_SOURCE_LABELS[source]}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="lead-interest" className="text-sm font-medium text-ink-soft">
          Interesse
          <Input
            id="lead-interest"
            name="interestProcedure"
            maxLength={120}
            placeholder="Ex.: criolipólise"
            className="mt-1.5"
          />
        </label>
        {team.length > 0 ? (
          <label className="text-sm font-medium text-ink-soft">
            Responsável
            <select name="ownerUserId" className={`${inputClasses} mt-1.5`} defaultValue="">
              <option value="">Não atribuído</option>
              {team.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Salvar lead
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
        {error ? (
          <p className="text-sm text-danger-700 sm:col-span-2 lg:col-span-3" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Card>
  )
}
