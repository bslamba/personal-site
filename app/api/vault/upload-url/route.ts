// ============================================================
// app/api/vault/upload-url/route.ts
//
// Presigned PUT so the browser uploads straight to storage. Super
// users may upload anywhere in the vault; members may only upload
// receipt images (keys under "receipts/"), which is all the finance
// page needs from them.
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSession, VAULT_COOKIE } from '@/lib/vault-auth'
import { presignUpload } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const jar = await cookies()
  const session = await getSession(jar.get(VAULT_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { key, contentType } = await request.json().catch(() => ({}))
  if (!key || typeof key !== 'string') return NextResponse.json({ error: 'Missing key' }, { status: 400 })

  if (session.r !== 'super' && !key.replace(/^\/+/, '').startsWith('receipts/')) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }

  try {
    const url = await presignUpload(key, contentType)
    return NextResponse.json({ url })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not sign upload' }, { status: 500 })
  }
}
