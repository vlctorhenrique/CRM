import { CadencesPanel } from '@/components/cadences/cadences-panel'
import { PageHeader } from '@/components/shell/page-header'
import { getCadences, getEnrollments, getLeads, getTemplates } from '@/lib/api'

export const metadata = {
  title: 'Cadências',
}

export default async function CadencesPage() {
  const [cadences, templates, enrollments, leads] = await Promise.all([
    getCadences(),
    getTemplates(),
    getEnrollments(),
    getLeads({ limit: 100 }),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recuperação de leads"
        title="Cadências"
        description="Crie cadências com templates aprovados, inscreva leads elegíveis e acompanhe o envio assistivo."
      />
      <CadencesPanel
        leads={leads.items.map((item) => ({
          id: item.id,
          name: item.name,
          phone: item.phone,
        }))}
        cadences={cadences.items}
        templates={templates}
        enrollments={enrollments}
      />
    </div>
  )
}
