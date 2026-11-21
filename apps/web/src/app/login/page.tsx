import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/auth/login-form'
import { getSession } from '@/lib/api'

export const metadata = {
  title: 'Entrar',
}

export default async function LoginPage() {
  const session = await getSession()

  if (session) {
    redirect('/dashboard')
  }

  return <LoginForm showDemoHints={process.env.NEXT_PUBLIC_SHOW_DEMO_HINTS === 'true'} />
}
