// ============================================================
// app/api/vault/upload-url/route.ts
//
// Returns a presigned PUT URL. The browser uploads straight to
// R2 — bytes never pass through Vercel, so there is no 4.5 MB
// body limit and no bandwidth cost.
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession, VAULT_COOKIE } from '@/lib/vault-auth'
import { presignUpload } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const jar = await cookies()
  if (!await verifySession(jar.get(VAULT_COOKIE)?.value)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { key, contentType } = await request.json().catch(() => ({}))
  if (!key || typeof key !== 'string') {
    return NextResponse.json({ error: 'Missing key' }, { status: 400 })
  }

  try {
    const url = await presignUpload(key, contentType)
    return NextResponse.json({ url })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Could not sign upload' }, { status: 500 })
  }
}
