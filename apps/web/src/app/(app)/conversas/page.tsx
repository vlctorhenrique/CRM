import { MessageSquare, UserRound } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/shell/page-header'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { getConversations } from '@/lib/api'
import { formatDateTime, initials } from '@/lib/utils'

export const metadata = {
  title: 'Conversas',
}

export default async function ConversationsPage() {
  const conversations = await getConversations(50)
  const unread = conversations.items.reduce((total, item) => total + item.unreadCount, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Atendimento"
        title="Conversas"
        description="As conversas ativas do WhatsApp, com última mensagem, responsável e pendências de leitura. Abra um lead para responder dentro da janela de 24 horas."
        actions={
          unread > 0 ? (
            <Badge tone="brand">{unread} não lida(s)</Badge>
          ) : (
            <Badge tone="success">Tudo lido</Badge>
          )
        }
      />

      <Card>
        {conversations.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <MessageSquare className="size-5" aria-hidden="true" />
            </div>
            <p className="mt-4 text-sm font-semibold text-ink">Nenhuma conversa ainda</p>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">
              As conversas aparecem aqui quando um contato envia a primeira mensagem pelo WhatsApp
              conectado à clínica.
            </p>
            <Link
              href="/configuracoes"
              className="mt-4 text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              Ver configuração do WhatsApp
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {conversations.items.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/leads/${conversation.leadId}`}
                className="grid gap-3 px-5 py-4 transition-colors hover:bg-surface-muted sm:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] sm:items-center"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
                    {initials(conversation.leadName ?? conversation.phone)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {conversation.leadName ?? conversation.phone}
                    </p>
                    <p className="truncate text-xs text-muted">{conversation.phone}</p>
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm text-ink-soft">
                    {conversation.lastMessagePreview ?? 'Sem mensagens'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {conversation.lastMessageAt
                      ? formatDateTime(conversation.lastMessageAt)
                      : 'Sem data'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <UserRound className="size-3.5" aria-hidden="true" />
                    {conversation.assignedUserName ?? 'Não atribuído'}
                  </span>
                  <Badge tone={conversation.humanTakeover ? 'brand' : 'neutral'}>
                    {conversation.humanTakeover ? 'Humano' : 'Automático'}
                  </Badge>
                  {conversation.unreadCount > 0 ? (
                    <span className="flex min-w-6 items-center justify-center rounded-full bg-brand-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                      {conversation.unreadCount}
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
