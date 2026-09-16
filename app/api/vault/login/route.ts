// ============================================================
// app/api/vault/login/route.ts
//
// Username + password login. Verifies against the hashed users
// store (seeded on first use) and issues an identity cookie that
// carries the person's role and finance entity.
// ============================================================

import { NextResponse } from 'next/server'
import { createSession } from '@/lib/vault-auth'
import { verifyLogin } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { username, password } = await request.json().catch(() => ({} as { username?: string; password?: string }))
  if (!username || !password) {
    return NextResponse.json({ error: 'Enter a username and password' }, { status: 400 })
  }
  const user = await verifyLogin(String(username), String(password))
  if (!user) {
    return NextResponse.json({ error: 'Wrong username or password' }, { status: 401 })
  }
  const cookie = await createSession({ u: user.id, r: user.role, e: user.entityId })
  const res = NextResponse.json({ ok: true, role: user.role, name: user.name, entityId: user.entityId, mustReset: user.mustReset ?? false })
  res.cookies.set(cookie.name, cookie.value, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: cookie.maxAge })
  return res
}
