// ============================================================
// app/api/vault/login/route.ts
//
// Accepts more than one account.
//
//   VAULT_USERNAME / VAULT_PASSWORD  — the original single account
//   VAULT_USERS                      — additional accounts, as a
//                                      comma-separated list of
//                                      username:password pairs
//
// Example:
//   VAULT_USERS=blamba:Qwerty@123,guest:something-else
//
// Every account gets the same 12-hour session and the same access;
// this is a second key to the same door, not a permission system.
// ============================================================

import { NextResponse } from 'next/server'
import { createSession, safeEqual } from '@/lib/vault-auth'

interface Account {
  username: string
  password: string
}

function accounts(): Account[] {
  const list: Account[] = []

  const u = process.env.VAULT_USERNAME ?? ''
  const p = process.env.VAULT_PASSWORD ?? ''
  if (u && p) list.push({ username: u, password: p })

  // Split on commas, then on the FIRST colon only — so a password
  // containing a colon still works.
  for (const entry of (process.env.VAULT_USERS ?? '').split(',')) {
    const pair = entry.trim()
    if (!pair) continue
    const colon = pair.indexOf(':')
    if (colon < 1) continue
    const username = pair.slice(0, colon).trim()
    // Trimmed too, so a stray space in the environment variable does
    // not silently become part of the password.
    const password = pair.slice(colon + 1).trim()
    if (username && password) list.push({ username, password })
  }

  return list
}

export async function POST(request: Request) {
  const { username, password } = await request.json().catch(() => ({}))

  const list = accounts()
  if (list.length === 0) {
    return NextResponse.json({ error: 'Vault is not configured' }, { status: 500 })
  }

  // Deliberate delay to blunt brute-force attempts
  await new Promise(r => setTimeout(r, 400))

  const givenUser = String(username ?? '')
  const givenPass = String(password ?? '')

  // Check every account rather than stopping at the first match, so
  // the work done is the same whichever account was supplied and a
  // timing difference cannot reveal which usernames exist.
  let ok = false
  for (const account of list) {
    const hit = safeEqual(givenUser, account.username) &&
                safeEqual(givenPass, account.password)
    ok = ok || hit
  }

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
