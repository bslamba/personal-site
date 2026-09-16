// ============================================================
// lib/mailer.ts
//
// Send a one-time-code email. Uses Resend (https://resend.com) when
// RESEND_API_KEY is set — the simplest provider to run on Vercel.
// With no key it reports { configured: false } so the flow can tell
// the user email isn't set up yet, instead of failing silently.
//   RESEND_API_KEY  — your Resend API key
//   OTP_FROM        — sender, e.g. "Vault <noreply@yourdomain>"
//                     (defaults to Resend's shared test sender)
// ============================================================

export interface MailResult { ok: boolean; configured: boolean; error?: string }

export async function sendOtpEmail(to: string, code: string, name?: string): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, configured: false }
  const from = process.env.OTP_FROM || 'Vault <onboarding@resend.dev>'
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px">
      <p>Hi ${name || 'there'},</p>
      <p>Your one-time code for the family vault is:</p>
      <p style="font-size:30px;font-weight:800;letter-spacing:6px;color:#6d4bd8">${code}</p>
      <p>It expires in 10 minutes. If you didn't ask for this, you can ignore this email.</p>
    </div>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: `Your vault code: ${code}`, html }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return { ok: false, configured: true, error: `Mail error ${res.status}: ${t.slice(0, 160)}` }
    }
    return { ok: true, configured: true }
  } catch (e: unknown) {
    return { ok: false, configured: true, error: e instanceof Error ? e.message : 'Mail failed' }
  }
}

/** A no-reply payment reminder. Returns configured:false when email isn't set up. */
export async function sendReminderEmail(to: string[], opts: { title: string; body: string; name?: string }): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, configured: false }
  const recipients = to.filter(Boolean)
  if (recipients.length === 0) return { ok: false, configured: true, error: 'No recipient email' }
  const from = process.env.REMINDER_FROM || process.env.OTP_FROM || 'Family Vault <onboarding@resend.dev>'
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px">
      <p>Hi ${opts.name || 'there'},</p>
      <p style="font-size:16px;font-weight:700;color:#6d4bd8">${opts.title}</p>
      <p>${opts.body}</p>
      <p style="color:#6b6b6b;font-size:12px;margin-top:20px">This is an automated reminder from your Family Vault. Please do not reply — mark it paid in the app once done.</p>
    </div>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: recipients, subject: opts.title, html }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return { ok: false, configured: true, error: `Mail error ${res.status}: ${t.slice(0, 160)}` }
    }
    return { ok: true, configured: true }
  } catch (e: unknown) {
    return { ok: false, configured: true, error: e instanceof Error ? e.message : 'Mail failed' }
  }
}
