// ============================================================
// app/vault/page.tsx
// ============================================================

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { verifySession, VAULT_COOKIE } from '@/lib/vault-auth'
import VaultExplorer from '@/components/vault-explorer'

export const metadata: Metadata = {
  title: 'Vault',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

export default async function VaultPage() {
  const jar = await cookies()
  if (!await verifySession(jar.get(VAULT_COOKIE)?.value)) redirect('/vault/login')

  return (
    <div className="container-page py-10 sm:py-12">
      <div className="mb-6 flex items-center gap-4">
        <span className="h-px w-12 bg-signal-500" />
        <span className="label text-signal-500">Private</span>
      </div>
      <h1 className="heading mb-8 text-[clamp(1.75rem,3.4vw,2.5rem)]">Vault</h1>
      <VaultExplorer />
    </div>
  )
}
