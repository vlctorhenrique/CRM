import { AppointmentsPanel } from '@/components/appointments/appointments-panel'
import { PageHeader } from '@/components/shell/page-header'
import { getAppointments, getLeads } from '@/lib/api'

export const metadata = {
  title: 'Agenda',
}

export default async function AgendaPage() {
  const [appointments, leads] = await Promise.all([getAppointments({}), getLeads({ limit: 100 })])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agendamentos"
        title="Agenda"
        description="Registre e acompanhe os agendamentos feitos no sistema da clínica."
      />
      <AppointmentsPanel
        leads={leads.items.map((item) => ({
          id: item.id,
          name: item.name,
          phone: item.phone,
        }))}
        appointments={appointments.items}
      />
    </div>
  )
}
