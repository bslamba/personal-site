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
import { seedDoc, migrate, filterDocForMember, activeDelegation, can, isLiquid, type FinanceDoc, type Delegation } from '@/lib/finance-data'

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
  for (const [k, m] of Object.entries(doc.months)) months[k] = {
    ...m, income: m.income.filter(i => i.entity === 'common'),
    frozen: m.frozen ? { ...m.frozen, income: m.frozen.income.filter(i => i.entity === 'common') } : undefined,
  }
  return {
    ...doc,
    savings: [],
    months,
    template: { ...doc.template, income: doc.template.income.filter(i => i.entity === 'common') },
    // The super sees shared history, but not other people's purely-personal edits.
    auditLog: (doc.auditLog ?? []).filter(a => !a.personal),
    reminders: (doc.reminders ?? []).filter(r => r.scope === 'common'),
    // The admin sees the common account and household goals — never anyone's
    // own accounts, goals or surplus decisions. Grants are shown (not their
    // contents' data) so a runaway grant can always be revoked.
    accounts: (doc.accounts ?? []).filter(a => a.owner === 'common'),
    transfers: (doc.transfers ?? []).filter(t => (doc.accounts ?? []).some(a => a.owner === 'common' && (a.id === t.from || a.id === t.to))),
    goals: (doc.goals ?? []).filter(g => g.owner === 'household'),
    allocRules: {},
    allocations: [],
  }
}

/**
 * What a delegate sees while managing someone else's finances: the owner's
 * own view, cut down to exactly what the grant allows. Enforced here, so a
 * grant without "view income" never sends the income to the browser at all.
 */
export function viewForGrant(doc: FinanceDoc, g: Delegation): FinanceDoc {
  const v = filterDocForMember(doc, g.owner)
  const p = g.perms
  const seeExp = can(p, 'expenses', 'view'), seeLoans = can(p, 'loans', 'view'), seeInc = can(p, 'income', 'view')
  const seeDocs = can(p, 'documents', 'view')
  const seeSavings = can(p, 'savings', 'view')
  // An RD's instalment is part of their savings, not a loan.
  const keepItem = (it: { kind: string; rdOf?: string; tmplId?: string }) =>
    it.rdOf || it.tmplId?.startsWith('rd:') ? seeSavings : it.kind === 'emi' ? seeLoans : seeExp
  const scrub = <T extends { receiptKey?: string | null }>(it: T): T => (seeDocs ? it : { ...it, receiptKey: null })
  for (const m of Object.values(v.months)) {
    m.items = m.items.filter(it => keepItem(it)).map(scrub)
    if (!seeInc) m.income = m.income.filter(i => i.entity === 'common')
    if (m.frozen) m.frozen = {
      ...m.frozen,
      items: m.frozen.items.filter(it => keepItem(it)).map(scrub),
      income: seeInc ? m.frozen.income : m.frozen.income.filter(i => i.entity === 'common'),
    }
  }
  v.template = {
    monthly: seeExp ? v.template.monthly.map(scrub) : [],
    annual: seeExp ? v.template.annual.map(scrub) : [],
    emis: v.template.emis.filter(it => keepItem(it)).map(scrub),
    income: seeInc ? v.template.income : v.template.income.filter(i => i.entity === 'common'),
  }
  if (!can(p, 'accounts', 'view')) {
    v.accounts = (v.accounts ?? []).filter(a => a.owner === 'common')
    const ids = new Set(v.accounts.map(a => a.id))
    v.transfers = (v.transfers ?? []).filter(t => ids.has(t.from) || ids.has(t.to))
  }
  const seeSav = can(p, 'savings', 'view'), seeInv = can(p, 'investments', 'view')
  v.savings = v.savings.filter(s => (isLiquid(s) ? seeSav : seeInv))
  if (!seeSav) { v.goals = (v.goals ?? []).filter(x => x.owner === 'household'); v.allocations = []; v.allocRules = {} }
  if (!can(p, 'budgets', 'view')) v.budgets = { ...v.budgets, byEntity: {} }
  if (!seeExp) v.allowances = []
  // The owner's approval queue — theirs to decide, so only with that grant.
  if (!can(p, 'approvals', 'view')) v.proposals = []
  v.auditLog = (v.auditLog ?? []).filter(a => seeExp || a.onBehalfOf === g.owner)
  v.delegations = [g]
  if (!seeExp) v.reminders = (v.reminders ?? []).filter(r => r.scope === 'common')
  return v
}

export function viewFor(session: Session, doc: FinanceDoc): FinanceDoc {
  if (session.r === 'super' || !session.e) return stripPrivate(doc)
  return filterDocForMember(doc, session.e)
}

export async function GET(request: Request) {
  const jar = await cookies()
  const session = await getSession(jar.get(VAULT_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try {
    const raw = await readRaw()
    let doc: FinanceDoc
    if (!raw) { doc = seedDoc(); await writeDoc(doc) }
    else { const wasV2 = (raw as { version?: number }).version === 2; doc = migrate(raw); if (!wasV2) await writeDoc(doc) }
    const u = await findUser(session.u)
    // Managing someone else's finances: only with a live grant from them.
    const as = new URL(request.url).searchParams.get('as')
    if (as && as !== session.e) {
      const g = session.r === 'member' && session.e ? activeDelegation(doc, session.e, as) : null
      if (!g) return NextResponse.json({ error: 'You no longer have access to that profile.', revoked: true }, { status: 403 })
      const name = (id: string) => doc.entities.find(e => e.id === id)?.name ?? id
      return NextResponse.json({
        doc: viewForGrant(doc, g),
        me: {
          role: 'member', entityId: g.owner, username: session.u,
          name: u?.name, firstName: u?.firstName, lastName: u?.lastName, email: u?.email, avatar: u?.avatar,
          acting: { grantId: g.id, owner: g.owner, ownerName: name(g.owner), grantee: g.grantee, granteeName: name(g.grantee), perms: g.perms },
        },
      })
    }
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
    // RD instalments are owned by Savings (syncRdItems): a document write can
    // neither add, change nor drop them.
    body.doc.template.emis = [...body.doc.template.emis.filter(it => !it.rdOf), ...(stored?.template.emis ?? []).filter(it => it.rdOf)]
    // Accounts, transfers, goals, allowances and grants are only ever changed
    // through the action API, and the admin's view of them is partial — so a
    // document write always carries the stored copies forward untouched.
    body.doc.accounts = stored?.accounts ?? []
    body.doc.transfers = stored?.transfers ?? []
    body.doc.goals = stored?.goals ?? []
    body.doc.allocRules = stored?.allocRules ?? {}
    body.doc.allocations = stored?.allocations ?? []
    body.doc.allowances = stored?.allowances ?? []
    body.doc.delegations = stored?.delegations ?? []
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
      // A closed month is read-only: whatever this write carries for it, the
      // stored month (with its frozen copy) stands until someone reopens it.
      for (const [k, m] of Object.entries(stored.months)) {
        if (m.frozen || stored.settlements?.[k]?.closed) body.doc.months[k] = m
      }
    }
    await writeDoc(body.doc)            // stamps updatedAt — the next write's version token
    return NextResponse.json({ ok: true, updatedAt: body.doc.updatedAt })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Storage error' }, { status: 500 })
  }
}
