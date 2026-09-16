// ============================================================
// app/vault/finance/page.tsx
//
// Server guard; the dashboard itself is a client component that
// loads and saves through /api/vault/finance.
// ============================================================

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getSession, VAULT_COOKIE } from '@/lib/vault-auth'
import FinanceDashboard from '@/components/vault/finance-dashboard'

export const metadata: Metadata = {
  title: 'Finance · Vault',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

export default async function FinancePage() {
  const jar = await cookies()
  if (!(await getSession(jar.get(VAULT_COOKIE)?.value))) redirect('/vault/login')
  return <FinanceDashboard />
}
