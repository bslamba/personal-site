// ============================================================
// app/vault/photos/page.tsx
// ============================================================

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getSession, VAULT_COOKIE } from '@/lib/vault-auth'
import PhotoWall from '@/components/vault/photo-wall'

export const metadata: Metadata = {
  title: 'Family Photos · Vault',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

export default async function PhotosPage() {
  const jar = await cookies()
  const session = await getSession(jar.get(VAULT_COOKIE)?.value)
  if (!session) redirect('/vault/login')
  if (session.r !== 'super') redirect('/vault')
  return <PhotoWall />
}
