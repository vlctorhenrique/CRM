import { CalendarDays } from 'lucide-react'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = {
  title: 'Agenda',
}

export default function AgendaPage() {
  return (
    <ModulePlaceholder
      icon={CalendarDays}
      eyebrow="Agendamentos"
      title="Agenda"
      description="Registro manual do agendamento feito no sistema atual da clínica, preparado para uma agenda nativa futura."
      stage="Etapa 4"
      features={[
        'Registro manual de data, horário, unidade e profissional',
        'Marcação de agendamento com cancelamento automático das cadências',
        'Observações e histórico vinculados ao lead',
        'Modelo de dados preparado para agenda nativa, sem integração com o UNO no MVP',
      ]}
    />
  )
}
