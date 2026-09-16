// ============================================================
// app/api/vault/users/route.ts
//
// Super-only management of member logins. GET lists the accounts
// (no secrets); POST creates a login for an entity, resets a
// password, or removes a login. Passwords are hashed in the store;
// the plain default is returned once on create/reset so the admin
// can pass it to the person.
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSession, VAULT_COOKIE } from '@/lib/vault-auth'
import { getUsers, upsertUser, setPassword, removeUser, publicUser, setEmail, DEFAULT_PASSWORD } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function guardSuper(): Promise<boolean> {
  const jar = await cookies()
  const s = await getSession(jar.get(VAULT_COOKIE)?.value)
  return s?.r === 'super'
}

export async function GET() {
  if (!(await guardSuper())) return NextResponse.json({ error: 'Super only' }, { status: 403 })
  const users = await getUsers()
  return NextResponse.json({ users: users.map(publicUser) })
}

export async function POST(request: Request) {
  if (!(await guardSuper())) return NextResponse.json({ error: 'Super only' }, { status: 403 })
  const b = await request.json().catch(() => ({})) as { op?: string; username?: string; name?: string; entityId?: string | null; role?: string; password?: string; email?: string }
  const emailOk = (e?: string) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
  try {
    if (b.op === 'create') {
      if (!b.username || !b.name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })
      if (!emailOk(b.email)) return NextResponse.json({ error: 'A valid email is required for every profile (used for password reset).' }, { status: 400 })
      const pw = b.password || DEFAULT_PASSWORD
      const user = await upsertUser({ username: b.username, name: b.name, role: b.role === 'super' ? 'super' : 'member', entityId: b.entityId ?? null, password: pw, email: b.email!.trim() })
      return NextResponse.json({ ok: true, user, password: pw })
    }
    if (b.op === 'setEmail') {
      if (!b.username) return NextResponse.json({ error: 'Missing username' }, { status: 400 })
      if (!emailOk(b.email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
      const ok = await setEmail(b.username, b.email!.trim())
      return NextResponse.json({ ok })
    }
    if (b.op === 'reset') {
      if (!b.username) return NextResponse.json({ error: 'Missing username' }, { status: 400 })
      const pw = b.password || DEFAULT_PASSWORD
      const ok = await setPassword(b.username, pw)
      return NextResponse.json({ ok, password: pw })
    }
    if (b.op === 'remove') {
      if (!b.username) return NextResponse.json({ error: 'Missing username' }, { status: 400 })
      await removeUser(b.username)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Unknown op' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
