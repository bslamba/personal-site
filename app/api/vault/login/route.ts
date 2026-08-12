// ============================================================
// app/api/vault/login/route.ts
// ============================================================

import { NextResponse } from 'next/server'
import { createSession, safeEqual } from '@/lib/vault-auth'

export async function POST(request: Request) {
  const { username, password } = await request.json().catch(() => ({}))

  const u = process.env.VAULT_USERNAME ?? ''
  const p = process.env.VAULT_PASSWORD ?? ''

  if (!u || !p) {
    return NextResponse.json({ error: 'Vault is not configured' }, { status: 500 })
  }

  // Deliberate delay to blunt brute-force attempts
  await new Promise(r => setTimeout(r, 400))

  const ok = safeEqual(String(username ?? ''), u) && safeEqual(String(password ?? ''), p)
  if (!ok) {
    return NextResponse.json({ error: 'Incorrect username or password' }, { status: 401 })
  }

  const session = await createSession()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(session.name, session.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: session.maxAge,
  })
  return res
}
