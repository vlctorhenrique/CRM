import { NotificationsPanel } from '@/components/notifications/notifications-panel'
import { PageHeader } from '@/components/shell/page-header'
import { getNotifications } from '@/lib/api'

export const metadata = {
  title: 'Notificações',
}

export default async function NotificationsPage() {
  const notifications = await getNotifications()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Acompanhamento"
        title="Notificações"
        description="Avisos internos de agendamentos, cadências e insights de IA."
      />
      <NotificationsPanel initial={notifications} />
    </div>
  )
}
