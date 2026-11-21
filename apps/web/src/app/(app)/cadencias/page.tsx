import { RefreshCw } from 'lucide-react'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = {
  title: 'Cadências',
}

export default function CadencesPage() {
  return (
    <ModulePlaceholder
      icon={RefreshCw}
      eyebrow="Recuperação de leads"
      title="Cadências"
      description="Fila de elegíveis, seleção pela SDR, modelos de mensagem e motor de envio com conformidade."
      stage="Etapa 5"
      features={[
        'Fila automática de leads não agendados aguardando seleção',
        'Seleção individual, em lote ou de todos os elegíveis',
        'Até sete dias com uma tentativa diária e horário comercial configurável',
        'Pausa ao receber resposta, opt-out e proteção contra duplicidade',
      ]}
    />
  )
}
