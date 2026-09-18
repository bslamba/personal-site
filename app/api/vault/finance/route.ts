// ============================================================
// app/api/vault/finance/route.ts
//
// GET  — returns the finance doc AS THIS PERSON MAY SEE IT.
//        Super-users get everything; members get a filtered view
//        (common + expenses that involve them + only their own
//        savings, budget and pending approvals). Privacy is enforced
//        here on the server, not in the browser.
// PUT  — full-document write. SUPER-USERS ONLY. Members change data
//        through /api/vault/finance/action instead.
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { CopyObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSession, VAULT_COOKIE, type Session } from '@/lib/vault-auth'
import { findUser } from '@/lib/users'
import { s3 } from '@/lib/storage'
import { seedDoc, migrate, filterDocForMember, type FinanceDoc } from '@/lib/finance-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = process.env.S3_BUCKET!
const KEY = '_finance/data.json'

export async function readRaw(): Promise<unknown | null> {
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }))
    return JSON.parse(await out.Body!.transformToString())
  } catch { return null }
}
export const BACKUP_PREFIX = '_finance/backups/'
export const BACKUP_DAYS = 183           // roughly six months of history
/** A backup key for an ordinary day, e.g. _finance/backups/2026-09-18.json.
 *  Safety copies taken before a restore are named differently on purpose, so
 *  the daily clean-up can never remove one. */
const dayKey = (day: string) => `${BACKUP_PREFIX}${day}.json`
const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.json$/

export const istDay = (d: Date = new Date()) =>
  new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)

/** Drop daily snapshots beyond the retention window. Only files named exactly
 *  YYYY-MM-DD.json under the backups prefix are ever considered, so neither
 *  the live document nor a pre-restore copy can be caught by this. */
async function pruneBackups(): Promise<void> {
  const cutoff = istDay(new Date(Date.now() - BACKUP_DAYS * 24 * 60 * 60 * 1000))
  try {
    let token: string | undefined
    const stale: { Key: string }[] = []
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: BACKUP_PREFIX, ContinuationToken: token }))
      for (const o of page.Contents ?? []) {
        const name = (o.Key ?? '').slice(BACKUP_PREFIX.length)
        if (DAY_FILE.test(name) && name.slice(0, 10) < cutoff) stale.push({ Key: o.Key! })
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
    for (let i = 0; i < stale.length; i += 1000) {
      await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: stale.slice(i, i + 1000) } }))
    }
  } catch { /* housekeeping only — it must never interfere with a save */ }
}

// Keep one snapshot per day: the first write of each day copies the document
// as it stood BEFORE that write, so every day of history is recoverable. The
// day already taken is remembered per instance to keep this to one HEAD call.
let snapshotDay = ''
export async function snapshotOnce(): Promise<void> {
  const day = istDay()
  if (snapshotDay === day) return
  snapshotDay = day
  const Key = dayKey(day)
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key }))
    return                                            // today's copy is already there
  } catch { /* not taken yet */ }
  try {
    await s3.send(new CopyObjectCommand({ Bucket: BUCKET, Key, CopySource: `${BUCKET}/${KEY}` }))
    await pruneBackups()                              // once a day, with the snapshot
  } catch { /* nothing to copy yet, or storage hiccup — never block a save */ }
}

/** Persist the document. Every write stamps `updatedAt`, which is the version
 *  token a full-document PUT is checked against, so a stale overwrite is
 *  caught rather than silently applied. */
export async function writeDoc(doc: FinanceDoc): Promise<void> {
  await snapshotOnce()
  doc.updatedAt = new Date().toISOString()
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: KEY, Body: JSON.stringify(doc), ContentType: 'application/json' }))
}
// Savings and personal (non-common) income are private to each individual
// profile — not even the super-user sees them. Strip them from the super
// view; PUT re-merges the stored copies so they are never lost.
function stripPrivate(doc: FinanceDoc): FinanceDoc {
  const months: FinanceDoc['months'] = {}
  for (const [k, m] of Object.entries(doc.months)) months[k] = { ...m, income: m.income.filter(i => i.entity === 'common') }
  return {
    ...doc,
    savings: [],
    months,
    template: { ...doc.template, income: doc.template.income.filter(i => i.entity === 'common') },
    // The super sees shared history, but not other people's purely-personal edits.
    auditLog: (doc.auditLog ?? []).filter(a => !a.personal),
    reminders: (doc.reminders ?? []).filter(r => r.scope === 'common'),
  }
}

export function viewFor(session: Session, doc: FinanceDoc): FinanceDoc {
  if (session.r === 'super' || !session.e) return stripPrivate(doc)
  return filterDocForMember(doc, session.e)
}

export async function GET() {
  const jar = await cookies()
  const session = await getSession(jar.get(VAULT_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try {
    const raw = await readRaw()
    let doc: FinanceDoc
    if (!raw) { doc = seedDoc(); await writeDoc(doc) }
    else { const wasV2 = (raw as { version?: number }).version === 2; doc = migrate(raw); if (!wasV2) await writeDoc(doc) }
    const u = await findUser(session.u)
    return NextResponse.json({
      doc: viewFor(session, doc),
      me: {
        role: session.r, entityId: session.e, username: session.u,
        name: u?.name, firstName: u?.firstName, lastName: u?.lastName,
        email: u?.email, avatar: u?.avatar,
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Storage error' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const jar = await cookies()
  const session = await getSession(jar.get(VAULT_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.r !== 'super') return NextResponse.json({ error: 'Members cannot overwrite the shared sheet' }, { status: 403 })
  try {
    const body = (await request.json().catch(() => null)) as { doc?: FinanceDoc; baseUpdatedAt?: string } | null
    if (!body?.doc || body.doc.version !== 2) return NextResponse.json({ error: 'Bad document' }, { status: 400 })
    // The super view never contains savings or personal income (both are
    // private to each profile), so a super PUT must NOT overwrite them —
    // re-merge the stored copies before writing.
    const rawStored = await readRaw()
    const stored = rawStored ? migrate(rawStored) : null
    // A full-document write replaces the whole sheet, so it must be based on
    // the version that is actually stored. If a member has since acted (or
    // another tab saved), refuse and hand back the current document instead of
    // quietly overwriting what they did.
    if (stored && body.baseUpdatedAt && stored.updatedAt !== body.baseUpdatedAt) {
      return NextResponse.json(
        { error: 'The sheet changed since this page loaded — reloaded it, please redo that last edit.', conflict: true, doc: viewFor(session, stored) },
        { status: 409 },
      )
    }
    // Proposals are only ever created and decided through the action API.
    // A document write must never carry a stale copy of them back.
    body.doc.proposals = stored?.proposals ?? body.doc.proposals ?? []
    body.doc.savings = stored?.savings ?? []
    body.doc.auditLog = stored?.auditLog ?? body.doc.auditLog ?? []
    body.doc.settlements = stored?.settlements ?? body.doc.settlements ?? {}
    // Personal reminders are stripped from the super view — re-merge them, and
    // keep stored reminders as the source of truth (managed via the action API).
    body.doc.reminders = stored?.reminders ?? body.doc.reminders ?? []
    body.doc.envelopes = body.doc.envelopes ?? stored?.envelopes
    if (stored) {
      for (const [k, m] of Object.entries(body.doc.months)) {
        const priv = stored.months[k] ? stored.months[k].income.filter(i => i.entity !== 'common') : []
        m.income = [...m.income.filter(i => i.entity === 'common'), ...priv]
      }
      // Preserve any stored months the super view didn't carry.
      for (const [k, m] of Object.entries(stored.months)) if (!body.doc.months[k]) body.doc.months[k] = m
      body.doc.template.income = [
        ...body.doc.template.income.filter(i => i.entity === 'common'),
        ...stored.template.income.filter(i => i.entity !== 'common'),
      ]
    }
    await writeDoc(body.doc)            // stamps updatedAt — the next write's version token
    return NextResponse.json({ ok: true, updatedAt: body.doc.updatedAt })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Storage error' }, { status: 500 })
  }
}
