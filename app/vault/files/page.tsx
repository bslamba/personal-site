// ============================================================
// app/vault/files/page.tsx
//
// The original file vault, now one tile behind the landing page.
// ============================================================

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { ArrowLeft } from 'lucide-react'
import { getSession, VAULT_COOKIE } from '@/lib/vault-auth'
import VaultExplorer from '@/components/vault-explorer'
import { VaultAppsBar } from '@/components/vault/vault-chrome'
import { findUser } from '@/lib/users'

export const metadata: Metadata = {
  title: 'Files · Vault',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

export default async function VaultFilesPage() {
  const jar = await cookies()
  const session = await getSession(jar.get(VAULT_COOKIE)?.value)
  if (!session) redirect('/vault/login')
  if (session.r !== 'super') redirect('/vault')
  const u = await findUser(session.u)

  return (
    <div className="container-page py-10 sm:py-12 vg-files-page">
      {/* The phone app's top bar and tab bar (hidden on a desktop). */}
      <div className="vg vg-phone-bars">
        <VaultAppsBar active="files" me={{ firstName: u?.firstName, name: u?.name, username: session.u, avatar: u?.avatar }} />
      </div>
      <Link
        href="/vault"
        className="mb-6 inline-flex items-center gap-2 text-sm text-signal-500 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Vault home
      </Link>
      <div className="mb-6 flex items-center gap-4">
        <span className="h-px w-12 bg-signal-500" />
        <span className="label text-signal-500">Private</span>
      </div>
      <h1 className="heading mb-8 text-[clamp(1.75rem,3.4vw,2.5rem)]">Files</h1>
      <VaultExplorer />
    </div>
  )
}
