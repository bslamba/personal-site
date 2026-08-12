// ============================================================
// app/api/vault/logout/route.ts
// ============================================================

import { NextResponse } from 'next/server'
import { VAULT_COOKIE } from '@/lib/vault-auth'

export async function POST(request: Request) {
  const res = NextResponse.redirect(new URL('/vault/login', request.url), { status: 302 })
  res.cookies.set(VAULT_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
