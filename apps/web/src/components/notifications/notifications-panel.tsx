'use client'

import type { NotificationListResponse, NotificationView } from '@crm/shared'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ApiClientError, apiRequest } from '@/lib/client-api'

export function NotificationsPanel({ initial }: { initial: NotificationListResponse }) {
  const router = useRouter()
  const [items, setItems] = useState(initial.items)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const markRead = async (ids: string[]) => {
    setBusy(true)
    setError(null)

    try {
      await apiRequest('/v1/notifications/read', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      })
      setItems((current) =>
        current.map((item) =>
          ids.includes(item.id) ? { ...item, readAt: new Date().toISOString() } : item,
        ),
      )
      router.refresh()
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : 'Não foi possível marcar como lida.',
      )
    } finally {
      setBusy(false)
    }
  }

  const unread = items.filter((item) => !item.readAt).map((item) => item.id)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notificações</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {unread.length > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void markRead(unread)}
          >
            Marcar todas como lidas
          </Button>
        ) : null}
        {error ? <p className="text-sm text-danger-700">{error}</p> : null}
        {items.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma notificação por enquanto.</p>
        ) : (
          <div className="divide-y divide-line">
            {items.map((item: NotificationView) => (
              <div key={item.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{item.title}</p>
                    {!item.readAt ? <Badge tone="brand">Nova</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{item.body}</p>
                  <p className="mt-1 text-xs text-muted">
                    {new Date(item.createdAt).toLocaleString('pt-BR', {
                      timeZone: 'America/Sao_Paulo',
                    })}
                  </p>
                </div>
                {!item.readAt ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void markRead([item.id])}
                  >
                    Marcar como lida
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
