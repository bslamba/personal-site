// ============================================================
// app/api/vault/list/route.ts
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession, VAULT_COOKIE } from '@/lib/vault-auth'
import { listPrefix, totalUsage } from '@/lib/storage'

export const dynamic = 'force-dynamic'

async function guard() {
  const jar = await cookies()
  return verifySession(jar.get(VAULT_COOKIE)?.value)
}

export async function GET(request: Request) {
  if (!await guard()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const prefix = new URL(request.url).searchParams.get('prefix') ?? ''
  try {
    const [entries, usage] = await Promise.all([listPrefix(prefix), totalUsage()])
    return NextResponse.json({ prefix, entries, usage })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Storage error' }, { status: 500 })
  }
}
