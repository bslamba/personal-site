// ============================================================
// app/api/vault/otp/request/route.ts
//
// Start a password reset: email a one-time code to the login's
// address. No session required (this is the "forgot password" path),
// but it is rate-limited and reveals nothing beyond a masked email.
// ============================================================

import { NextResponse } from 'next/server'
import { findUser } from '@/lib/users'
import { issueOtp } from '@/lib/otp'
import { sendOtpEmail } from '@/lib/mailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const mask = (e: string) => {
  const [u, d] = e.split('@')
  if (!d) return e
  return `${u.slice(0, 1)}${'*'.repeat(Math.max(1, u.length - 1))}@${d}`
}

export async function POST(request: Request) {
  const { username } = await request.json().catch(() => ({} as { username?: string }))
  if (!username) return NextResponse.json({ error: 'Enter your username' }, { status: 400 })

  const user = await findUser(String(username))
  if (!user) return NextResponse.json({ error: 'No login by that name' }, { status: 404 })
  if (!user.email) return NextResponse.json({ error: 'No email is set for this login yet — ask the admin to add one.', code: 'no-email' }, { status: 400 })

  const { code, waitMs } = await issueOtp(user.username)
  if (!code) return NextResponse.json({ error: `Please wait ${Math.ceil((waitMs ?? 0) / 1000)}s before asking for another code.` }, { status: 429 })

  const mail = await sendOtpEmail(user.email, code, user.name)
  if (!mail.configured) return NextResponse.json({ error: 'Email isn\'t set up yet — add a RESEND_API_KEY in Vercel to enable codes.', configured: false }, { status: 503 })
  if (!mail.ok) return NextResponse.json({ error: mail.error ?? 'Could not send the email.' }, { status: 502 })

  return NextResponse.json({ ok: true, emailHint: mask(user.email) })
}
