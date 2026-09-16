// ============================================================
// app/api/vault/password/reset/route.ts
//
// Finish a password reset: verify the emailed one-time code and set
// a new password. Email OTP is the ONLY reset path — no old password
// and no admin needed. No session required.
// ============================================================

import { NextResponse } from 'next/server'
import { verifyOtp } from '@/lib/otp'
import { setPassword, findUser } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { username, otp, newPassword } = await request.json().catch(() => ({} as { username?: string; otp?: string; newPassword?: string }))
  if (!username || !otp || !newPassword) return NextResponse.json({ error: 'Missing details' }, { status: 400 })
  if (String(newPassword).length < 6) return NextResponse.json({ error: 'Use at least 6 characters' }, { status: 400 })

  const user = await findUser(String(username))
  if (!user) return NextResponse.json({ error: 'No login by that name' }, { status: 404 })

  const ok = await verifyOtp(user.username, String(otp))
  if (!ok) return NextResponse.json({ error: 'That code is wrong or expired.' }, { status: 401 })

  await setPassword(user.username, String(newPassword))
  return NextResponse.json({ ok: true })
}
