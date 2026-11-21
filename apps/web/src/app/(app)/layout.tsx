import { redirect } from 'next/navigation'
import { AppShell } from '@/components/shell/app-shell'
import { SessionKeeper } from '@/components/shell/session-keeper'
import { getSession } from '@/lib/api'

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  if (!session) {
    redirect('/login')
  }

  return (
    <AppShell session={session}>
      <SessionKeeper />
      {children}
    </AppShell>
  )
}
