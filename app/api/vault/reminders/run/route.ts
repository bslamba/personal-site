// ============================================================
// app/api/vault/reminders/run/route.ts
//
// Fires due payment reminders by email. Meant to be hit once a day
// by Vercel Cron (see vercel.json). It also runs for a logged-in
// super-user so you can trigger a manual send / test.
//
// A reminder is "due" when today's day-of-month (IST) has reached its
// dayOfMonth and it hasn't been resolved for the current month. While
// unresolved it re-sends at most once per calendar day, so it keeps
// nudging until someone marks it paid with proof.
//
// Requires RESEND_API_KEY (+ REMINDER_FROM) for mail to actually send;
// without them it reports configured:false and changes nothing.
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSession, VAULT_COOKIE } from '@/lib/vault-auth'
import { getUsers } from '@/lib/users'
import { sendReminderEmail } from '@/lib/mailer'
import { migrate, financeAlerts, type FinanceDoc, type Reminder } from '@/lib/finance-data'
import { readRaw, writeDoc, snapshotOnce } from '../../finance/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Current date in IST, as { key: 'YYYY-MM', day, iso: 'YYYY-MM-DD' }.
function istToday() {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1, d = now.getUTCDate()
  const key = `${y}-${String(m).padStart(2, '0')}`
  return { key, day: d, iso: `${key}-${String(d).padStart(2, '0')}` }
}

async function authorized(request: Request): Promise<boolean> {
  if (request.headers.get('x-vercel-cron')) return true
  const url = new URL(request.url)
  const secret = process.env.CRON_SECRET
  if (secret && url.searchParams.get('key') === secret) return true
  const auth = request.headers.get('authorization')
  if (secret && auth === `Bearer ${secret}`) return true
  // A signed-in super-user may trigger it manually.
  const jar = await cookies()
  const s = await getSession(jar.get(VAULT_COOKIE)?.value)
  return s?.r === 'super'
}

async function run() {
  // The daily backup normally rides along with the first write of the day, so
  // a day when nobody touched anything would have no snapshot. This cron runs
  // every day regardless, which keeps the restore calendar unbroken.
  await snapshotOnce()
  const raw = await readRaw()
  const doc: FinanceDoc = migrate(raw ?? {})
  const reminders = doc.reminders ?? []
  const users = await getUsers()
  const emailFor = (entityId: string): string | undefined => users.find(u => u.entityId === entityId)?.email
  const { key: mk, day, iso } = istToday()

  let sent = 0, skipped = 0, notConfigured = false
  const errors: string[] = []

  for (const r of reminders as Reminder[]) {
    if (!r.active) { skipped++; continue }
    if (day < r.dayOfMonth) { skipped++; continue }
    if (r.done?.[mk]) { skipped++; continue }
    if (r.lastSent?.[mk] === iso) { skipped++; continue }   // already nudged today

    const to = [...new Set((r.notify ?? []).map(emailFor).filter((e): e is string => !!e))]
    if (to.length === 0) { skipped++; continue }

    const amt = r.amount ? ` of ₹${r.amount.toLocaleString('en-IN')}` : ''
    const res = await sendReminderEmail(to, {
      title: `Payment due: ${r.label}`,
      body: `A ${r.scope === 'common' ? 'common household' : 'personal'} payment${amt} — "${r.label}" — is due (from day ${r.dayOfMonth} of ${mk}). It will keep reminding you until it's marked paid with proof in the Family Vault.`,
    })
    if (res.configured === false) { notConfigured = true; break }
    if (res.ok) { r.lastSent = { ...(r.lastSent ?? {}), [mk]: iso }; sent++ }
    else { errors.push(res.error || 'send failed'); skipped++ }
  }

  // Budget and spending alerts. Each goes only to the person it concerns, and
  // each piece of news goes out once — the key changes only when the news
  // does, so nobody is told the same thing every morning.
  let alerted = 0
  if (!notConfigured) {
    const already = doc.alertsSent ?? {}
    for (const a of financeAlerts(doc, mk)) {
      if (already[a.key]) { skipped++; continue }
      const to = emailFor(a.entity)
      if (!to) { skipped++; continue }
      const res = await sendReminderEmail([to], {
        title: a.title,
        body: `${a.body}\n\nYou are seeing this because it is about your own spending — nobody else is copied.`,
      })
      if (res.configured === false) { notConfigured = true; break }
      if (res.ok) { already[a.key] = iso; alerted++ }
      else { errors.push(res.error || 'send failed'); skipped++ }
    }
    doc.alertsSent = already
  }

  if (sent > 0 || alerted > 0) await writeDoc(doc)
  return { ok: true, configured: !notConfigured, sent, alerted, skipped, month: mk, day, errors: errors.slice(0, 5) }
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try { return NextResponse.json(await run()) }
  catch (e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 }) }
}

export async function POST(request: Request) { return GET(request) }
