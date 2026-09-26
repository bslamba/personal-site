// ============================================================
// app/api/vault/profile/route.ts
//
// Self-service profile for the logged-in user: read and update
// their own first/last name, email and avatar. Password changes go
// through the email-OTP flow (/api/vault/otp + /api/vault/password),
// not here.
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSession, VAULT_COOKIE } from '@/lib/vault-auth'
import { findUser, updateProfile, publicUser } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const jar = await cookies()
  const s = await getSession(jar.get(VAULT_COOKIE)?.value)
  if (!s) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const u = await findUser(s.u)
  if (!u) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Details are the person's own, so they come only with their own profile.
  return NextResponse.json({ user: publicUser(u), details: u.details ?? {} })
}

export async function POST(request: Request) {
  const jar = await cookies()
  const s = await getSession(jar.get(VAULT_COOKIE)?.value)
  if (!s) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const b = await request.json().catch(() => ({})) as { firstName?: string; lastName?: string; email?: string; avatar?: string; details?: unknown }
  const emailOk = (e?: string) => e === undefined || (!!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()))
  if (!emailOk(b.email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  // Guard avatar size (data URL) — keep the users store small.
  if (b.avatar && b.avatar.length > 300_000) return NextResponse.json({ error: 'Image is too large — please use one under ~200 KB.' }, { status: 400 })
  const ok = await updateProfile(s.u, b)
  if (!ok) return NextResponse.json({ error: 'Could not update profile' }, { status: 500 })
  const u = await findUser(s.u)
  return NextResponse.json({ ok: true, user: u ? publicUser(u) : null, details: u?.details ?? {} })
}
