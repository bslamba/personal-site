// ============================================================
// app/api/vault/download-url/route.ts
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession, VAULT_COOKIE } from '@/lib/vault-auth'
import { presignDownload } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const jar = await cookies()
  if (!await verifySession(jar.get(VAULT_COOKIE)?.value)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  const key = params.get('key')
  const inline = params.get('inline') === '1'
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })

  try {
    const url = await presignDownload(key, !inline)
    return NextResponse.json({ url })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Could not sign download' }, { status: 500 })
  }
}
