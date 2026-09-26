// ============================================================
// app/api/vault/finance/sheet/route.ts
//
// POST { month, format: 'xlsx' | 'csv', actingAs? }
//        builds that month's sheet from what the caller may see, keeps a
//        copy for their profile, and returns the file.
// GET  ?month=YYYY-MM   the sheets kept for the caller's profile (all months
//                       without it)
// GET  ?key=…           one kept sheet, if it belongs to the caller's profile
//
// A member's sheets are theirs alone; the family admin's are the
// household's. Someone managing another member's finances works with that
// member's sheets, within the access they were given.
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSession, VAULT_COOKIE, type Session } from '@/lib/vault-auth'
import { migrate, activeDelegation, can, entName, monthLabel, type FinanceDoc } from '@/lib/finance-data'
import { monthCsv } from '@/lib/finance-sheet'
import { listSheets, readSheet, profileFolder } from '@/lib/finance-sheet-store'
import { readRaw, viewFor, viewForGrant } from '../route'
import { buildAndKeep } from '../sheets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MONTH = /^\d{4}-\d{2}$/
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Whose sheets these are, and the view they are built from. */
async function resolve(session: Session, actingAs: string | null): Promise<{ doc: FinanceDoc; view: FinanceDoc; profile: string; profileName: string; viewer: string | null; by: string } | { error: string; status: number }> {
  const doc = migrate((await readRaw()) ?? {})
  const by = session.r === 'super' ? 'Family admin' : entName(doc.entities, session.e ?? '')
  if (actingAs && actingAs !== session.e) {
    const g = session.r === 'member' && session.e ? activeDelegation(doc, session.e, actingAs) : null
    if (!g) return { error: 'Your access to that profile has been revoked or has expired.', status: 403 }
    if (!can(g.perms, 'expenses', 'view')) return { error: 'You have not been given access to their expenses.', status: 403 }
    return { doc, view: viewForGrant(doc, g), profile: g.owner, profileName: entName(doc.entities, g.owner), viewer: g.owner, by: `${by} (on behalf of ${entName(doc.entities, g.owner)})` }
  }
  if (session.r === 'super' || !session.e) return { doc, view: viewFor(session, doc), profile: 'household', profileName: 'Household', viewer: null, by }
  return { doc, view: viewFor(session, doc), profile: session.e, profileName: entName(doc.entities, session.e), viewer: session.e, by }
}

const fileName = (profileName: string, mk: string, ext: string) =>
  `Lamba Family ${monthLabel(mk)} - ${profileName}.${ext}`.replace(/[^\w .\-]+/g, '')

export async function POST(request: Request) {
  const session = await getSession((await cookies()).get(VAULT_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const body = await request.json().catch(() => null) as { month?: string; format?: string; actingAs?: string } | null
  const mk = body?.month ?? ''
  if (!MONTH.test(mk)) return NextResponse.json({ error: 'Pick a month.' }, { status: 400 })
  const r = await resolve(session, body?.actingAs ?? null)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
  try {
    // The Excel copy is always the one kept, whichever format was asked for.
    const { body: xlsx } = await buildAndKeep(r.view, mk, { profile: r.profile, profileName: r.profileName, viewer: r.viewer, by: r.by, final: false })
    if (body?.format === 'csv') {
      const csv = monthCsv(r.view, mk, { profileName: r.profileName, viewer: r.viewer, by: r.by, at: new Date(), final: false })
      return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${fileName(r.profileName, mk, 'csv')}"`, 'Cache-Control': 'no-store' } })
    }
    return new Response(new Uint8Array(xlsx), { headers: { 'Content-Type': XLSX, 'Content-Disposition': `attachment; filename="${fileName(r.profileName, mk, 'xlsx')}"`, 'Cache-Control': 'no-store' } })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not build the sheet' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const session = await getSession((await cookies()).get(VAULT_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const url = new URL(request.url)
  const r = await resolve(session, url.searchParams.get('as'))
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
  const key = url.searchParams.get('key')
  try {
    if (key) {
      // Only ever a sheet from this profile's own folder.
      if (!key.startsWith(profileFolder(r.profile)) || key.includes('..')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const buf = await readSheet(key)
      const name = key.split('/').pop() ?? 'sheet.xlsx'
      return new Response(new Uint8Array(buf), { headers: { 'Content-Type': XLSX, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } })
    }
    const month = url.searchParams.get('month')
    const sheets = await listSheets(r.profile, month && MONTH.test(month) ? month : undefined)
    return NextResponse.json({ sheets, profileName: r.profileName })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Storage error' }, { status: 500 })
  }
}
