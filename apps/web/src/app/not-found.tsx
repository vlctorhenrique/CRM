import Link from 'next/link'
import { BrandMark } from '@/components/brand-mark'
import { buttonClasses } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-8 text-center shadow-card">
        <BrandMark className="mx-auto" />
        <p className="mt-6 text-sm font-semibold text-brand-700">404</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Página não encontrada</h1>
        <p className="mt-2 text-sm text-muted">O endereço acessado não existe ou foi movido.</p>
        <Link href="/dashboard" className={buttonClasses('primary', 'md', 'mt-6')}>
          Voltar ao painel
        </Link>
      </div>
    </main>
  )
}
