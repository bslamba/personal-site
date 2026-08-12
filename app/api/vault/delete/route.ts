// ============================================================
// app/api/vault/delete/route.ts
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession, VAULT_COOKIE } from '@/lib/vault-auth'
import { deleteKey, deleteFolder } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const jar = await cookies()
  if (!await verifySession(jar.get(VAULT_COOKIE)?.value)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { key, isFolder } = await request.json().catch(() => ({}))
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })

  try {
    if (isFolder) {
      const removed = await deleteFolder(key)
      return NextResponse.json({ ok: true, removed })
    }
    await deleteKey(key)
    return NextResponse.json({ ok: true, removed: 1 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Delete failed' }, { status: 500 })
  }
}
