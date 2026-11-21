import { BarChart3 } from 'lucide-react'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = {
  title: 'Relatórios',
}

export default function ReportsPage() {
  return (
    <ModulePlaceholder
      icon={BarChart3}
      eyebrow="Indicadores"
      title="Relatórios"
      description="Desempenho comercial da clínica e da SDR, com filtros por período, responsável e origem."
      stage="Etapa 6"
      features={[
        'Total de leads, novos, em atendimento e aguardando agendamento',
        'Agendamentos, perdidos, taxa de conversão e mensagens enviadas',
        'Desempenho individual da SDR, respeitando permissões',
        'Notificações internas para respostas e falhas de integração',
      ]}
    />
  )
}
