// ============================================================
// app/api/vault/folder/route.ts
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession, VAULT_COOKIE } from '@/lib/vault-auth'
import { createFolder } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const jar = await cookies()
  if (!await verifySession(jar.get(VAULT_COOKIE)?.value)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { prefix } = await request.json().catch(() => ({}))
  if (!prefix) return NextResponse.json({ error: 'Missing prefix' }, { status: 400 })

  try {
    await createFolder(prefix)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Could not create folder' }, { status: 500 })
  }
}
