// ============================================================
// app/api/vault/finance/action/route.ts
//
// The safe write path for MEMBERS (and a convenience for super).
// A member never overwrites the shared sheet; instead they send a
// small, authorised action and the server applies just that change:
//
//   propose        add an expense — if it is purely theirs it is
//                  added straight away, otherwise it becomes a
//                  proposal the charged / approving people must accept
//   accept/decline act on a proposal that is waiting on you
//   setSavings     replace only your own savings rows
//   setBudget      set only your own budget
//   setFamilyBudget (super only) set the household budget
//   accounts, transfers, goals, surplus allocation, allowances,
//   and delegated access (request / decide / revoke)
//
// Every action is authorised against the caller's identity. A member
// managing someone else's finances sends `actingAs`; the action is then
// checked against the owner's grant — area and operation — and logged as
// "X did this on behalf of Y".
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSession, VAULT_COOKIE } from '@/lib/vault-auth'
import { migrate, approversFor, isPersonalTo, commitProposalItem, applyTemplateOp, materialise, monthKey, uid, paymentsFor, isUpiId,
         currentOf, revertIsSafe, applyRevert, type AuditChange,
         setCommonIncome, computeSettlement, putMonthOverride, deleteMonthTemplate, monthView,
         type FinanceDoc, type Item, type IncomeItem, type Proposal, type SavingItem, type EntityBudget } from '@/lib/finance-data'
import { readRaw, writeDoc, viewFor, viewForGrant } from '../route'
import { activeDelegation, can, ACCESS_AREAS, ACCESS_OPS, ACCESS_LABEL, bearerShares,
         type Delegation, type AccessArea, type AccessOp, type AccessPerms, type Account, type Transfer, type Goal,
         type AllocRule, type Allowance, INR } from '@/lib/finance-data'
import { isLiquid, proposeAllocation, monthSurplus } from '@/lib/finance-plan'
import { getUsers } from '@/lib/users'
import { sendReminderEmail } from '@/lib/mailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const entName = (doc: FinanceDoc, id: string | null) => (id ? doc.entities.find(e => e.id === id)?.name : null) ?? 'Super'
const addToMonth = (doc: FinanceDoc, monthKey: string, it: Item) => {
  const m = doc.months[monthKey] ?? { items: [], income: [], note: '' }
  m.items = [...m.items, { ...it, src: 'manual' as const }]
  doc.months[monthKey] = m
}
// Apply a per-month edit: a template item overrides only this month; a manual
// one-off is edited in place. Never touches the Budget template.
const applyMonthEdit = (doc: FinanceDoc, mk: string, item: Item, op: 'update' | 'delete') => {
  const m = doc.months[mk] ?? { items: [], income: [], note: '' }
  if (op === 'delete') doc.months[mk] = item.src === 'template' ? deleteMonthTemplate(m, item) : { ...m, items: m.items.filter(x => x.id !== item.id) }
  else doc.months[mk] = item.src === 'template' ? putMonthOverride(m, item) : { ...m, items: m.items.map(x => (x.id === item.id ? item : x)) }
}

/**
 * What an action needs from a grant when it is done on someone's behalf.
 * Anything not listed here cannot be done for someone else at all — deciding
 * approvals, settling money, closing a month, or changing who has access are
 * the owner's own acts.
 */
function permFor(body: Record<string, unknown>): { area: AccessArea; op: AccessOp } | null {
  const item = body.item as Item | undefined
  const loanOr = (a: AccessArea) => (item?.kind === 'emi' ? 'loans' : a)
  switch (body.action) {
    case 'propose': return { area: loanOr('expenses'), op: 'add' }
    case 'proposeMonthEdit': return { area: loanOr('expenses'), op: body.op === 'delete' ? 'delete' : 'edit' }
    case 'proposeTemplate': return { area: body.section === 'emis' ? 'loans' : 'expenses', op: body.op === 'delete' ? 'delete' : body.op === 'add' ? 'add' : 'edit' }
    case 'importRows': return { area: 'expenses', op: 'add' }
    case 'setMonthIncome': case 'setTemplateIncome': return { area: 'income', op: 'edit' }
    case 'setSavings': return { area: 'savings', op: 'edit' }          // refined below for investments
    case 'setBudget': return { area: 'budgets', op: 'edit' }
    case 'saveAccount': return { area: 'accounts', op: body.isNew ? 'add' : 'edit' }
    case 'setCheckpoint': return { area: 'accounts', op: 'edit' }
    case 'removeAccount': return { area: 'accounts', op: 'delete' }
    case 'addTransfer': return { area: 'accounts', op: 'add' }
    case 'removeTransfer': return { area: 'accounts', op: 'delete' }
    case 'saveGoal': return { area: 'savings', op: body.isNew ? 'add' : 'edit' }
    case 'contributeGoal': case 'setAllocRules': case 'applyAllocation': case 'undoAllocation': return { area: 'savings', op: 'edit' }
    case 'removeGoal': return { area: 'savings', op: 'delete' }
    default: return null
  }
}

const cleanPerms = (p: unknown): AccessPerms => {
  const out: AccessPerms = {}
  if (!p || typeof p !== 'object') return out
  for (const a of ACCESS_AREAS) {
    const ops = (p as Record<string, unknown>)[a]
    if (Array.isArray(ops)) {
      const ok = ACCESS_OPS.filter(o => ops.includes(o))
      if (ok.length) out[a] = ok.includes('view') ? ok : ['view', ...ok]
    }
  }
  return out
}
const describePerms = (p: AccessPerms) => ACCESS_AREAS.filter(a => p[a]?.length)
  .map(a => `${ACCESS_LABEL[a]}: ${(p[a] ?? []).join(', ')}`).join('\n')

async function emailEntity(entityId: string, title: string, body: string) {
  try {
    const users = await getUsers()
    const u = users.find(x => x.entityId === entityId && x.email)
    if (u?.email) await sendReminderEmail([u.email], { title, body, name: u.firstName || u.name })
  } catch { /* email is a courtesy — the request is in the app regardless */ }
}

export async function POST(request: Request) {
  const jar = await cookies()
  const session = await getSession(jar.get(VAULT_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await request.json().catch(() => null) as
    | { action: string; item?: Item; monthKey?: string; id?: string; savings?: SavingItem[]; budget?: EntityBudget; actingAs?: string } | null
  if (!body?.action) return NextResponse.json({ error: 'No action' }, { status: 400 })

  const raw = await readRaw()
  const doc: FinanceDoc = migrate(raw ?? {})
  const isSuper = session.r === 'super'
  // ----- acting on someone else's behalf --------------------------
  let grant: Delegation | null = null
  if (body.actingAs && body.actingAs !== session.e) {
    if (isSuper || !session.e) return NextResponse.json({ error: 'Only a family member can manage another member’s finances.' }, { status: 403 })
    grant = activeDelegation(doc, session.e, body.actingAs)
    if (!grant) return NextResponse.json({ error: 'Your access to that profile has been revoked or has expired.', revoked: true }, { status: 403 })
    const need = permFor(body as unknown as Record<string, unknown>)
    if (!need) return NextResponse.json({ error: 'That can only be done by the owner themselves.' }, { status: 403 })
    if (!can(grant.perms, need.area, need.op)) {
      return NextResponse.json({ error: `${entName(doc, grant.owner)} has not given you permission to ${need.op} ${ACCESS_LABEL[need.area].toLowerCase()}.` }, { status: 403 })
    }
    // Receipts ride along on expenses — drop them if documents are not granted.
    if (body.item && body.item.receiptKey && !can(grant.perms, 'documents', 'add')) body.item.receiptKey = null
  }
  const actor = grant ? grant.owner : session.e   // whose data this acts on; null for super
  const realActor = session.e                      // who is actually at the keyboard
  const actorName = isSuper ? 'Super admin' : entName(doc, realActor)
  const audit = (event: 'propose' | 'accept' | 'decline' | 'revoke' | 'apply', what: string, extra: { reason?: string; monthKey?: string; proposalId?: string; parties?: string[]; personal?: boolean; change?: AuditChange; revertOf?: string } = {}) => {
    const behalf = grant ? { onBehalfOf: grant.owner, onBehalfName: entName(doc, grant.owner), parties: [...new Set([...(extra.parties ?? []), grant.owner, grant.grantee])] } : {}
    doc.auditLog = [...(doc.auditLog ?? []), { id: uid('log'), ts: new Date().toISOString(), actor: realActor ?? 'super', actorName, event, what, ...extra, ...behalf }].slice(-800)
  }
  const respond = (extra: Record<string, unknown> = {}) => NextResponse.json({
    ok: true, ...extra, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor },
  })
  const byName = grant ? `${entName(doc, grant.owner)} (via ${entName(doc, grant.grantee)})` : entName(doc, actor)
  const partiesOf = (pr: Proposal) => [pr.proposedBy, ...pr.approvers].filter(x => x && x !== 'super')
  // An existing pending proposal that TARGETS a specific item (an edit or a
  // template change/removal) — used to block a second, overlapping edit.
  const pendingEditFor = (id: string) => (doc.proposals ?? []).find(p => p.item?.id === id && (p.monthEdit || (p.template && p.template.op !== 'add')))
  const shortName = (it?: Item) => (it?.name || 'expense')
  // What a change is about to do, captured before it happens, so the entry it
  // writes can be undone on its own later.
  const monthChange = (mk: string, item: Item, after: Item | null): AuditChange => {
    const mode = item.src === 'template' ? ('override' as const) : ('manual' as const)
    const c: AuditChange = { scope: 'month', monthKey: mk, mode, key: mode === 'override' ? (item.tmplId ?? item.id) : item.id, before: null, after }
    c.before = currentOf(doc, c)
    return c
  }
  const templateChange = (section: 'monthly' | 'emis' | 'annual', item: Item, after: Item | null): AuditChange => {
    const c: AuditChange = { scope: 'template', section, key: item.id, before: null, after }
    c.before = currentOf(doc, c)
    return c
  }

  try {
    switch (body.action) {
      case 'propose': {
        const item = body.item, monthKey = body.monthKey
        if (!item || !monthKey) return NextResponse.json({ error: 'Missing item' }, { status: 400 })
        item.id = item.id || uid('one')
        const addLabel = `Add · ${shortName(item)} · ${INR(item.amount || 0)}`
        // A dependent on an allowance: anything above the threshold goes to a
        // parent first, unless a parent is the one recording it.
        const alw = (doc.allowances ?? []).find(a => a.active && a.threshold > 0 && (bearerShares(item)[a.entity] ?? 0) > 0 && (item.amount || 0) > a.threshold)
        if (alw && !isSuper && !(realActor && alw.approvers.includes(realActor))) {
          const approvers = alw.approvers.filter(x => x !== actor)
          if (approvers.length) {
            const pr: Proposal = {
              id: uid('prop'), item: { ...item, src: 'manual' }, monthKey, proposedBy: actor ?? 'super', proposedByName: byName,
              approvers, approved: [], mode: 'any', status: 'pending', createdAt: new Date().toISOString(),
              reason: `Above ${entName(doc, alw.entity)}’s allowance approval limit of ${INR(alw.threshold)}`,
            }
            doc.proposals = [...(doc.proposals ?? []), pr]
            audit('propose', addLabel, { monthKey, proposalId: pr.id, reason: pr.reason, parties: [...new Set([actor ?? '', ...approvers].filter(Boolean))] })
            await writeDoc(doc)
            return respond({ proposed: true, allowance: true })
          }
        }
        // Super, or an expense that is purely the caller's own, is added straight away.
        if (isSuper || (actor && isPersonalTo(item, actor, doc.entities))) {
          const ch = monthChange(monthKey, { ...item, src: 'manual' }, { ...item, src: 'manual' })
          addToMonth(doc, monthKey, item)
          audit('apply', addLabel, { monthKey, personal: !isSuper, parties: !isSuper && actor ? [actor] : undefined, change: ch })
          await writeDoc(doc)
          return NextResponse.json({ ok: true, added: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
        }
        if (!actor) return NextResponse.json({ error: 'No entity' }, { status: 400 })
        const { approvers, mode } = approversFor(item, actor, doc.entities)
        if (approvers.length === 0) {
          const ch = monthChange(monthKey, { ...item, src: 'manual' }, { ...item, src: 'manual' })
          addToMonth(doc, monthKey, item)
          audit('apply', addLabel, { monthKey, personal: true, parties: actor ? [actor] : undefined, change: ch })
          await writeDoc(doc)
          return NextResponse.json({ ok: true, added: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
        }
        const pr: Proposal = {
          id: uid('prop'), item, monthKey, proposedBy: actor, proposedByName: byName,
          approvers, approved: [], mode, status: 'pending', createdAt: new Date().toISOString(),
        }
        doc.proposals = [...(doc.proposals ?? []), pr]
        audit('propose', addLabel, { monthKey, proposalId: pr.id, parties: [actor, ...approvers] })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, proposed: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'accept':
      case 'decline': {
        const pr = (doc.proposals ?? []).find(p => p.id === body.id)
        if (!pr) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        const canAct = isSuper || (actor && pr.approvers.includes(actor))
        if (!canAct) return NextResponse.json({ error: 'Not yours to decide' }, { status: 403 })
        const prLabel = `${pr.monthEdit?.op === 'delete' || pr.template?.op === 'delete' ? 'Remove' : pr.monthEdit || (pr.template && pr.template.op !== 'add') ? 'Change' : 'Add'} · ${shortName(pr.item)}`
        if (body.action === 'decline') {
          pr.status = 'declined'
          doc.proposals = doc.proposals.filter(p => p.id !== pr.id)
          audit('decline', prLabel, { monthKey: pr.monthKey, proposalId: pr.id, reason: pr.reason, parties: partiesOf(pr) })
        } else {
          if (actor && !pr.approved.includes(actor)) pr.approved.push(actor)
          const done = isSuper || pr.mode === 'any' || pr.approvers.every(a => pr.approved.includes(a))
          let ch: AuditChange | undefined
          if (done) {
            // Capture what accepting is about to do, so it can be undone too.
            if (pr.template) ch = templateChange(pr.template.section, pr.item, pr.template.op === 'delete' ? null : pr.item)
            else if (pr.item && !pr.incomeEdit) ch = monthChange(pr.monthKey, pr.monthEdit ? pr.item : { ...pr.item, src: 'manual' }, pr.monthEdit?.op === 'delete' ? null : { ...pr.item, src: pr.monthEdit ? pr.item.src : 'manual' })
            commitProposalItem(doc, pr)
            doc.proposals = doc.proposals.filter(p => p.id !== pr.id)
          }
          audit('accept', prLabel, { monthKey: pr.monthKey, proposalId: pr.id, reason: pr.reason, parties: partiesOf(pr), change: ch })
        }
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'setSavings': {
        // Savings are private to each profile — not even super sees them, so
        // super has nothing to save here. The old super branch replaced the
        // whole savings list, which would have wiped every member's pots.
        if (isSuper || !actor) return NextResponse.json({ error: 'Savings are private to each profile' }, { status: 403 })
        let rows = (body.savings ?? [])
        const who = actor
        const existing = doc.savings.filter(s => s.entity === who)
        if (grant) {
          // A delegate only touches the kind of pot they were given: without
          // investments, the investment rows stay exactly as they were.
          const sav = can(grant.perms, 'savings', 'edit'), inv = can(grant.perms, 'investments', 'edit')
          rows = [...rows.filter(r => (isLiquid(r) ? sav : inv)), ...existing.filter(r => (isLiquid(r) ? !sav : !inv))]
        }
        const mine = rows.map(r => ({ ...r, entity: who }))
        doc.savings = [...doc.savings.filter(s => s.entity !== who), ...mine]
        if (grant) audit('apply', 'Savings updated', { personal: true })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'setMonthIncome': {
        // A member sets their OWN personal income for a month. Private to
        // them, applied directly (never proposed). Common income and
        // everyone else's rows are left untouched.
        if (isSuper || !actor) return NextResponse.json({ error: 'Members only' }, { status: 403 })
        const mk = (body as unknown as { monthKey?: string }).monthKey || monthKey()
        const incoming = ((body as unknown as { income?: { id?: string; source?: string; amount?: number }[] }).income ?? [])
          .map(r => ({ id: r.id || uid('inc'), source: r.source || 'Income', amount: Number(r.amount) || 0, entity: actor, src: 'manual' as const }))
        const m = doc.months[mk] ?? materialise(doc.template, mk)
        m.income = [...m.income.filter(i => i.entity !== actor), ...incoming]
        doc.months[mk] = m
        if (grant) audit('apply', `Income updated · ${INR(incoming.reduce((a, r) => a + r.amount, 0))}`, { monthKey: mk, personal: true })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'setTemplateIncome': {
        // A member manages only their OWN recurring-income template rows —
        // private data, so (like setMonthIncome) it's applied directly, never
        // proposed. The common recurring-income baseline stays super-only,
        // edited from the Budget/Setup tab.
        if (isSuper || !actor) return NextResponse.json({ error: 'Members only' }, { status: 403 })
        const incoming = ((body as unknown as { income?: { id?: string; source?: string; amount?: number }[] }).income ?? [])
          .map(r => ({ id: r.id || uid('inc'), source: r.source || 'Income', amount: Number(r.amount) || 0, entity: actor }))
        doc.template.income = [...doc.template.income.filter(i => i.entity !== actor), ...incoming]
        audit('apply', 'Recurring income updated', { personal: true, parties: [actor] })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'revertChange': {
        // Undo one recorded change, on its own, without disturbing anything else.
        const bt = body as unknown as { auditId?: string; reason?: string }
        const entry = (doc.auditLog ?? []).find(a => a.id === bt.auditId)
        if (!entry?.change) return NextResponse.json({ error: 'There is nothing recorded for that entry to undo.' }, { status: 404 })
        if (entry.revertedAt) return NextResponse.json({ error: 'That change has already been undone.' }, { status: 400 })
        const c = entry.change
        const target = c.before ?? c.after
        const mine = !!(actor && target && isPersonalTo(target, actor, doc.entities))
        if (!isSuper && !mine) {
          return NextResponse.json({ error: 'Only the family admin can undo a shared change. You can change it back the usual way, which goes to the others to approve.' }, { status: 403 })
        }
        if (!revertIsSafe(doc, c)) {
          return NextResponse.json({ error: 'That has been changed again since, so undoing this now would wipe out the newer change. Edit it directly instead.' }, { status: 409 })
        }
        applyRevert(doc, c)
        entry.revertedAt = new Date().toISOString()
        audit('apply', `Undid · ${entry.what}`, {
          monthKey: c.monthKey, reason: (bt.reason ?? '').trim() || undefined,
          revertOf: entry.id, parties: entry.parties, personal: entry.personal,
        })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, reverted: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'setUpi': {
        // Your own UPI id, so the others can settle with you in one tap.
        // Super manages everyone's from the Entities tab instead.
        if (isSuper || !actor) return NextResponse.json({ error: 'Set these from the Entities tab' }, { status: 403 })
        const raw = String((body as unknown as { upi?: string }).upi ?? '').trim()
        if (raw && !isUpiId(raw)) return NextResponse.json({ error: 'That does not look like a UPI id — they are shaped like name@bank.' }, { status: 400 })
        doc.entities = doc.entities.map(e => (e.id === actor ? { ...e, upi: raw || undefined } : e))
        audit('apply', raw ? 'UPI id updated' : 'UPI id removed', { personal: true, parties: [actor] })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'setBudget': {
        if (!body.budget) return NextResponse.json({ error: 'No budget' }, { status: 400 })
        const who = actor ?? 'su'
        doc.budgets.byEntity[who] = body.budget
        if (grant) audit('apply', 'Budget updated', { personal: true })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'setFamilyBudget': {
        if (!isSuper) return NextResponse.json({ error: 'Super only' }, { status: 403 })
        if (!body.budget) return NextResponse.json({ error: 'No budget' }, { status: 400 })
        doc.budgets.family = body.budget
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'importRows': {
        interface Row { date: string; name: string; amount: number; type: 'debit' | 'credit'; category?: string; note?: string; ref?: string; shareWith?: string; sharePct?: number; tags?: string[]; envelope?: string }
        const rows = (body as unknown as { rows?: Row[] }).rows ?? []
        const wantOwner = (body as unknown as { owner?: string }).owner
        // "Paid from" = the logged-in profile (or, for super, the chosen person).
        const owner = isSuper ? (wantOwner || doc.entities.find(e => e.kind === 'person')?.id || '') : (actor ?? '')
        if (!owner) return NextResponse.json({ error: 'No owner' }, { status: 400 })
        // Existing fingerprints across the whole sheet (items, income, pending
        // proposals) — skip anything already imported or awaiting approval.
        const seen = new Set<string>()
        for (const m of Object.values(doc.months)) {
          for (const it of m.items) if (it.ref) seen.add(it.ref)
          for (const inc of m.income) if (inc.ref) seen.add(inc.ref)
        }
        for (const p of (doc.proposals ?? [])) if (p.item?.ref) seen.add(p.item.ref)

        let added = 0, proposed = 0, skipped = 0
        for (const r of rows) {
          if (!r || !r.date || !(r.amount > 0)) continue
          if (r.ref && seen.has(r.ref)) { skipped++; continue }
          const mk = r.date.slice(0, 7)
          const tags = Array.isArray(r.tags) ? r.tags.map(t => String(t).trim()).filter(Boolean) : undefined

          if (r.type === 'credit') {
            if (grant && !can(grant.perms, 'income', 'add')) { skipped++; continue }
            // Credit = income, private to the owner. Applied directly.
            const m = doc.months[mk] ?? materialise(doc.template, mk)
            m.income = [...m.income, { id: uid('inc'), source: r.name || 'Income', entity: owner, amount: r.amount, src: 'manual', ref: r.ref } as IncomeItem]
            doc.months[mk] = m
            if (r.ref) seen.add(r.ref)
            added++
            continue
          }

          const pct = Math.max(0, Math.min(100, Number(r.sharePct) || 0)) / 100
          const shareWith = r.shareWith && r.shareWith !== owner ? r.shareWith : null
          if (shareWith && pct > 0) {
            // Shared expense: build the split and send it to the tagged person
            // to approve. It only enters the common/shared view once accepted.
            const it: Item = {
              id: uid('imp'), name: r.name || 'Expense', amount: r.amount, kind: 'oneoff',
              paidBy: owner, alloc: { mode: 'split', shares: { [owner]: 1 - pct, [shareWith]: pct } },
              category: r.category || undefined, note: r.note || undefined, date: r.date, src: 'manual', ref: r.ref, tags, envelope: r.envelope || 'household',
            }
            const pr: Proposal = {
              id: uid('prop'), item: it, monthKey: mk,
              proposedBy: isSuper ? 'super' : owner, proposedByName: entName(doc, owner),
              approvers: [shareWith], approved: [], mode: 'any', status: 'pending', createdAt: new Date().toISOString(),
              note: r.note || undefined,
            }
            doc.proposals = [...(doc.proposals ?? []), pr]
            if (r.ref) seen.add(r.ref)
            proposed++
          } else {
            // Personal expense: parked on the owner's profile, applied directly.
            // Not part of any shared calculation.
            const m = doc.months[mk] ?? { items: [], income: [], note: '' }
            const it: Item = {
              id: uid('imp'), name: r.name || 'Expense', amount: r.amount, kind: 'oneoff',
              paidBy: owner, alloc: { mode: 'single', who: owner },
              category: r.category || undefined, note: r.note || undefined, date: r.date, src: 'manual', ref: r.ref, tags, envelope: r.envelope || 'household',
            }
            m.items = [...m.items, it]
            doc.months[mk] = m
            if (r.ref) seen.add(r.ref)
            added++
          }
        }
        await writeDoc(doc)
        return NextResponse.json({ ok: true, added, proposed, skipped, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'proposeMonthEdit': {
        const bt = body as unknown as { item?: Item; monthKey?: string; op?: 'update' | 'delete'; reason?: string }
        const item = bt.item, monthKey2 = bt.monthKey, op = bt.op
        const reason = (bt.reason || '').trim()
        if (!item || !monthKey2 || !op) return NextResponse.json({ error: 'Missing item' }, { status: 400 })
        const personal = actor ? isPersonalTo(item, actor, doc.entities) : false
        const applyNow = isSuper || personal
        const label = `${op === 'delete' ? 'Remove' : 'Change'} · ${shortName(item)}`
        if (applyNow) {
          const ch = monthChange(monthKey2, item, op === 'delete' ? null : item)
          applyMonthEdit(doc, monthKey2, item, op)
          audit('apply', label, { monthKey: monthKey2, reason: reason || undefined, personal: !isSuper, parties: !isSuper && actor ? [actor] : undefined, change: ch })
          await writeDoc(doc)
          return NextResponse.json({ ok: true, applied: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
        }
        if (!actor) return NextResponse.json({ error: 'No entity' }, { status: 400 })
        const ap = approversFor(item, actor, doc.entities)
        if (ap.approvers.length === 0) {
          const ch = monthChange(monthKey2, item, op === 'delete' ? null : item)
          applyMonthEdit(doc, monthKey2, item, op)
          audit('apply', label, { monthKey: monthKey2, reason: reason || undefined, personal: !isSuper, parties: !isSuper && actor ? [actor] : undefined, change: ch })
          await writeDoc(doc)
          return NextResponse.json({ ok: true, applied: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
        }
        // Shared edit → needs approval. Require a reason and block a second,
        // overlapping edit on the same expense.
        if (!reason) return NextResponse.json({ error: 'Please give a reason for this change so the other person can review it.' }, { status: 400 })
        if (pendingEditFor(item.id)) return NextResponse.json({ error: 'This expense already has an edit waiting for approval. Revoke that one first, or wait for it to be decided.' }, { status: 409 })
        const pr2: Proposal = {
          id: uid('prop'), item, monthKey: monthKey2, proposedBy: actor, proposedByName: byName,
          approvers: ap.approvers, approved: [], mode: ap.mode, status: 'pending', createdAt: new Date().toISOString(), monthEdit: { op }, reason,
        }
        doc.proposals = [...(doc.proposals ?? []), pr2]
        audit('propose', label, { monthKey: monthKey2, reason, proposalId: pr2.id, parties: [actor, ...ap.approvers] })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, proposed: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'revoke': {
        // The proposer (or super) cancels a pending proposal they raised.
        const pr = (doc.proposals ?? []).find(p => p.id === body.id)
        if (!pr) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        const mine = isSuper || pr.proposedBy === actor
        if (!mine) return NextResponse.json({ error: 'You can only revoke your own requests.' }, { status: 403 })
        doc.proposals = doc.proposals.filter(p => p.id !== pr.id)
        audit('revoke', `Revoked · ${shortName(pr.item)}`, { monthKey: pr.monthKey, proposalId: pr.id, reason: pr.reason, parties: partiesOf(pr) })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, revoked: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'proposeTemplate': {
        const bt = body as unknown as { item?: Item; section?: 'monthly' | 'emis' | 'annual'; op?: 'add' | 'update' | 'delete'; reason?: string }
        const item = bt.item, section = bt.section, op = bt.op
        const reason = (bt.reason || '').trim()
        if (!item || !section || !op) return NextResponse.json({ error: 'Missing item' }, { status: 400 })
        if (op === 'add') item.id = item.id || uid(section)
        const personal = actor ? isPersonalTo(item, actor, doc.entities) : false
        const label = `${op === 'delete' ? 'Remove' : op === 'add' ? 'Add' : 'Change'} recurring · ${shortName(item)}`
        if (isSuper || personal) {
          const ch = templateChange(section, item, op === 'delete' ? null : item)
          applyTemplateOp(doc, section, op, item)
          audit('apply', label, { reason: reason || undefined, personal: !isSuper, parties: !isSuper && actor ? [actor] : undefined, change: ch })
          await writeDoc(doc)
          return NextResponse.json({ ok: true, applied: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
        }
        if (!actor) return NextResponse.json({ error: 'No entity' }, { status: 400 })
        const { approvers, mode } = approversFor(item, actor, doc.entities)
        if (approvers.length === 0) {
          const ch = templateChange(section, item, op === 'delete' ? null : item)
          applyTemplateOp(doc, section, op, item)
          audit('apply', label, { reason: reason || undefined, personal: !isSuper, parties: !isSuper && actor ? [actor] : undefined, change: ch })
          await writeDoc(doc)
          return NextResponse.json({ ok: true, applied: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
        }
        if (op !== 'add' && !reason) return NextResponse.json({ error: 'Please give a reason for this change so the other person can review it.' }, { status: 400 })
        if (op !== 'add' && pendingEditFor(item.id)) return NextResponse.json({ error: 'This item already has a change waiting for approval. Revoke that one first.' }, { status: 409 })
        const pr: Proposal = {
          id: uid('prop'), item, monthKey: monthKey(), proposedBy: actor, proposedByName: byName,
          approvers, approved: [], mode, status: 'pending', createdAt: new Date().toISOString(), template: { section, op }, reason: reason || undefined,
        }
        doc.proposals = [...(doc.proposals ?? []), pr]
        audit('propose', label, { reason: reason || undefined, proposalId: pr.id, parties: [actor, ...approvers] })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, proposed: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'setCommonIncome': {
        // The common account's earning (rent). Everyone can see it; changing it
        // needs approval by a chosen person (super applies directly).
        const bt = body as unknown as { monthKey?: string; amount?: number; approver?: string; reason?: string }
        const mk = bt.monthKey || monthKey()
        const amount = Math.max(0, Number(bt.amount) || 0)
        if (isSuper) {
          setCommonIncome(doc, mk, amount)
          audit('apply', `Common income → ${amount}`, { monthKey: mk })
          await writeDoc(doc)
          return NextResponse.json({ ok: true, applied: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
        }
        if (!actor) return NextResponse.json({ error: 'No entity' }, { status: 400 })
        const approver = bt.approver
        if (!approver || approver === actor) return NextResponse.json({ error: 'Choose someone else to approve this change.' }, { status: 400 })
        const reason = (bt.reason || '').trim()
        if (!reason) return NextResponse.json({ error: 'Please give a reason for changing the common income.' }, { status: 400 })
        const item: Item = { id: uid('cinc'), name: 'Common account income', amount, kind: 'oneoff', paidBy: 'common', alloc: { mode: 'single', who: 'common' } }
        const pr: Proposal = {
          id: uid('prop'), item, monthKey: mk, proposedBy: actor, proposedByName: byName,
          approvers: [approver], approved: [], mode: 'any', status: 'pending', createdAt: new Date().toISOString(),
          incomeEdit: { monthKey: mk, amount }, reason,
        }
        doc.proposals = [...(doc.proposals ?? []), pr]
        audit('propose', `Common income → ${amount}`, { monthKey: mk, reason, proposalId: pr.id, parties: [actor, approver] })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, proposed: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'setCommonDisposition': {
        // Decide what to do with this month's common-account surplus:
        //  'transfer' → pay each earner their equal share as personal income (My Dashboard);
        //  'carry'    → roll the surplus into next month's common income;
        //  'none'     → undo either. Super-controlled (a common-account decision).
        if (!isSuper) return NextResponse.json({ error: 'Only the family admin can settle the common account.' }, { status: 403 })
        const bt = body as unknown as { monthKey?: string; mode?: 'transfer' | 'carry' | 'none' }
        const mk = bt.monthKey || monthKey()
        const mode = bt.mode ?? 'none'
        const mv = monthView(doc, mk)
        const commonIncome = mv.income.filter(i => i.entity === 'common').reduce((s, i) => s + (i.amount || 0), 0) + (doc.months[mk]?.commonCarryIn ?? 0)
        const commonExpenses = mv.items.filter(it => it.paidBy === 'common').reduce((s, it) => s + (it.amount || 0), 0)
        const surplus = commonIncome - commonExpenses
        const earners = doc.entities.filter(e => e.kind === 'person' && e.earning)
        const per = earners.length ? surplus / earners.length : 0
        const m = doc.months[mk] ?? { items: [], income: [], note: '' }
        // Clear any prior payout rows for this month, and reset next month's carry from this month.
        m.income = m.income.filter(i => !(i.ref && i.ref.startsWith(`csurplus:${mk}:`)))
        const [yy, mm] = mk.split('-').map(Number); const nextKey = monthKey(new Date(yy, mm, 1))
        if (doc.months[nextKey]) doc.months[nextKey].commonCarryIn = 0
        if (mode === 'transfer' && surplus > 0.5) {
          for (const e of earners) m.income = [...m.income, { id: uid('inc'), source: 'Common surplus payout', entity: e.id, amount: per, src: 'manual', ref: `csurplus:${mk}:${e.id}` }]
          m.commonDisposition = 'transfer'
        } else if (mode === 'carry' && surplus > 0.5) {
          const nm = doc.months[nextKey] ?? { items: [], income: [], note: '' }
          nm.commonCarryIn = surplus; doc.months[nextKey] = nm
          m.commonDisposition = 'carry'
        } else {
          delete m.commonDisposition
        }
        doc.months[mk] = m
        audit('apply', `Common surplus · ${mode}`, { monthKey: mk })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, applied: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'settlePay': {
        // Record a payment against a transfer — the whole thing, or a part of
        // it. Paying in instalments is normal, and a part payment has to
        // survive the month being closed rather than rounding back to unpaid.
        const bt = body as unknown as { monthKey?: string; transferKey?: string; proofKey?: string; amount?: number }
        const mk = bt.monthKey, key = bt.transferKey
        if (!mk || !key) return NextResponse.json({ error: 'Missing transfer' }, { status: 400 })
        const view = computeSettlement(doc, mk)
        const tr = view.transfers.find(x => x.key === key)
        if (!tr) return NextResponse.json({ error: 'That transfer is no longer part of this month.' }, { status: 404 })
        const asked = Number(bt.amount)
        const amount = Number.isFinite(asked) && asked > 0 ? Math.min(asked, tr.due) : tr.due
        if (!(amount > 0)) return NextResponse.json({ error: 'That transfer is already settled.' }, { status: 400 })
        const st = doc.settlements?.[mk] ?? {}
        // Fold a legacy all-or-nothing proof into the list before adding to it.
        const existing = st.payments?.[key] ?? paymentsFor(st, key, tr.amount)
        st.payments = { ...(st.payments ?? {}), [key]: [...existing, { id: uid('pay'), amount, proofKey: bt.proofKey || undefined, by: actorName, at: new Date().toISOString() }] }
        if (st.paid) delete st.paid[key]
        doc.settlements = { ...(doc.settlements ?? {}), [mk]: st }
        audit('apply', `Settled ${amount >= tr.due ? '' : 'part of '}· ${entName(doc, tr.from)} → ${tr.to === 'common' ? 'common account' : entName(doc, tr.to)}`, { monthKey: mk })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'settleUnpay': {
        // Undo one payment, or every payment on the transfer when no id is given.
        const bt = body as unknown as { monthKey?: string; transferKey?: string; paymentId?: string }
        const mk = bt.monthKey, key = bt.transferKey
        if (!mk || !key) return NextResponse.json({ error: 'Missing transfer' }, { status: 400 })
        const st = doc.settlements?.[mk]
        if (st) {
          if (bt.paymentId) {
            const view = computeSettlement(doc, mk)
            const tr = view.transfers.find(x => x.key === key)
            const list = (st.payments?.[key] ?? paymentsFor(st, key, tr?.amount ?? 0)).filter(x => x.id !== bt.paymentId)
            st.payments = { ...(st.payments ?? {}), [key]: list }
          } else if (st.payments) {
            delete st.payments[key]
          }
          if (st.paid) delete st.paid[key]
          doc.settlements = { ...(doc.settlements ?? {}), [mk]: st }
        }
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'closeSettlement': {
        // Close the month: any unpaid transfer is carried into next month with
        // a reference back to where it came from, so the outstanding is proven.
        const bt = body as unknown as { monthKey?: string }
        const mk = bt.monthKey
        if (!mk) return NextResponse.json({ error: 'Missing month' }, { status: 400 })
        const view = computeSettlement(doc, mk)
        const [y, mo] = mk.split('-').map(Number)
        const nextMk = monthKey(new Date(y, mo, 1))
        // Only what is STILL owed moves forward — a part payment stays paid.
        const carry = view.transfers.filter(tr => tr.due > 0.5).map(tr => ({
          id: uid('carry'), from: tr.from, to: tr.to, amount: tr.due,
          fromMonth: tr.kind === 'carry' && tr.fromMonth ? tr.fromMonth : mk,
          viaMonth: mk,
          note: tr.note || `Unpaid from ${mk}`,
        }))
        const st = doc.settlements?.[mk] ?? {}
        st.closed = true; st.closedAt = new Date().toISOString(); st.closedBy = actorName
        doc.settlements = { ...(doc.settlements ?? {}), [mk]: st }
        // Closing is idempotent: drop anything a previous close of THIS month
        // already pushed forward, so a reopen-and-close never stacks the same
        // debt into next month twice.
        const nx = doc.settlements[nextMk] ?? {}
        const kept = (nx.carry ?? []).filter(c => c.viaMonth !== mk)
        if (kept.length || carry.length) {
          nx.carry = [...kept, ...carry]
          doc.settlements[nextMk] = nx
        }
        audit('apply', `Closed settlement · ${mk}${carry.length ? ` · ${carry.length} carried forward` : ''}`, { monthKey: mk })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, carried: carry.length, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'saveReminder': {
        const bt = body as unknown as { reminder?: Partial<import('@/lib/finance-data').Reminder> }
        const r = bt.reminder
        if (!r || !r.label || !r.dayOfMonth) return NextResponse.json({ error: 'Missing reminder details' }, { status: 400 })
        const rec = {
          id: r.id || uid('rem'), label: String(r.label).slice(0, 120),
          scope: r.scope === 'common' ? 'common' as const : 'personal' as const,
          owner: r.scope === 'common' ? undefined : (r.owner || actor || undefined),
          amount: r.amount != null ? Math.max(0, Number(r.amount) || 0) : undefined,
          dayOfMonth: Math.max(1, Math.min(28, Number(r.dayOfMonth) || 1)),
          notify: Array.isArray(r.notify) ? r.notify.filter(Boolean) : [],
          active: r.active !== false,
          createdBy: actor ?? 'su',
          done: (r as { done?: Record<string, { proofKey?: string; at: string; by: string }> }).done ?? {},
          lastSent: (r as { lastSent?: Record<string, string> }).lastSent ?? {},
        }
        const list = doc.reminders ?? []
        const idx = list.findIndex(x => x.id === rec.id)
        doc.reminders = idx >= 0 ? list.map(x => (x.id === rec.id ? { ...x, ...rec } : x)) : [...list, rec]
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'removeReminder': {
        const id = (body as unknown as { id?: string }).id
        doc.reminders = (doc.reminders ?? []).filter(r => r.id !== id)
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'resolveReminder': {
        const bt = body as unknown as { id?: string; monthKey?: string; proofKey?: string }
        const mk = bt.monthKey || monthKey()
        doc.reminders = (doc.reminders ?? []).map(r => r.id === bt.id
          ? { ...r, done: { ...(r.done ?? {}), [mk]: { proofKey: bt.proofKey || '', at: new Date().toISOString(), by: actorName } } }
          : r)
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'unresolveReminder': {
        const bt = body as unknown as { id?: string; monthKey?: string }
        const mk = bt.monthKey || monthKey()
        doc.reminders = (doc.reminders ?? []).map(r => { if (r.id === bt.id && r.done) { const d = { ...r.done }; delete d[mk]; return { ...r, done: d } } return r })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      case 'reopenSettlement': {
        const bt = body as unknown as { monthKey?: string }
        const mk = bt.monthKey
        if (!mk) return NextResponse.json({ error: 'Missing month' }, { status: 400 })
        const st = doc.settlements?.[mk]
        if (st) { st.closed = false; st.closedAt = undefined; doc.settlements = { ...(doc.settlements ?? {}), [mk]: st } }
        // Take back whatever closing this month pushed into the next one —
        // otherwise the debt lives in both places at once.
        const [ry, rmo] = mk.split('-').map(Number)
        const reopenNext = monthKey(new Date(ry, rmo, 1))
        const nxt = doc.settlements?.[reopenNext]
        if (nxt?.carry?.length) {
          nxt.carry = nxt.carry.filter(c => c.viaMonth !== mk)
          doc.settlements = { ...(doc.settlements ?? {}), [reopenNext]: nxt }
        }
        audit('apply', `Reopened settlement · ${mk}`, { monthKey: mk })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
      }

      // ================= accounts & the rollover =================
      case 'saveAccount': {
        const bt = body as unknown as { account?: Partial<Account>; isNew?: boolean }
        const a = bt.account
        if (!a || !String(a.name ?? '').trim()) return NextResponse.json({ error: 'Give the account a name.' }, { status: 400 })
        const owner = isSuper ? 'common' : actor
        if (!owner) return NextResponse.json({ error: 'No profile' }, { status: 400 })
        const list = doc.accounts ?? []
        const prev = a.id ? list.find(x => x.id === a.id) : undefined
        if (prev && prev.owner !== owner) return NextResponse.json({ error: 'That account is not yours to change.' }, { status: 403 })
        const om = /^\d{4}-\d{2}$/.test(String(a.openingMonth ?? '')) ? String(a.openingMonth) : monthKey()
        const rec: Account = {
          id: prev?.id ?? uid('acc'), owner,
          name: String(a.name).trim().slice(0, 60),
          type: (['bank', 'cash', 'wallet', 'card'] as const).includes(a.type as Account['type']) ? a.type as Account['type'] : 'bank',
          opening: Number(a.opening) || 0, openingMonth: om,
          primary: !!a.primary, archived: prev?.archived, checkpoints: prev?.checkpoints ?? {},
        }
        doc.accounts = [...list.filter(x => x.id !== rec.id).map(x => (rec.primary && x.owner === owner ? { ...x, primary: false } : x)), rec]
        audit('apply', `${prev ? 'Account updated' : 'Account added'} · ${rec.name}`, { personal: !isSuper, parties: !isSuper && actor ? [actor] : undefined })
        await writeDoc(doc)
        return respond({ id: rec.id })
      }

      case 'removeAccount': {
        const id = (body as unknown as { id?: string }).id
        const acc = (doc.accounts ?? []).find(x => x.id === id)
        if (!acc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        if (acc.owner !== (isSuper ? 'common' : actor)) return NextResponse.json({ error: 'That account is not yours.' }, { status: 403 })
        const used = (doc.transfers ?? []).some(t => t.from === id || t.to === id)
          || Object.values(doc.months).some(m => m.items.some(i => i.account === id) || m.income.some(i => i.account === id))
        // History that points at an account keeps it: it is archived, not erased.
        doc.accounts = used ? (doc.accounts ?? []).map(x => (x.id === id ? { ...x, archived: true, primary: false } : x)) : (doc.accounts ?? []).filter(x => x.id !== id)
        audit('apply', `${used ? 'Account archived' : 'Account removed'} · ${acc.name}`, { personal: !isSuper, parties: !isSuper && actor ? [actor] : undefined })
        await writeDoc(doc)
        return respond()
      }

      case 'setCheckpoint': {
        const bt = body as unknown as { id?: string; month?: string; balance?: number | null }
        const acc = (doc.accounts ?? []).find(x => x.id === bt.id)
        if (!acc || acc.owner !== (isSuper ? 'common' : actor)) return NextResponse.json({ error: 'That account is not yours.' }, { status: 403 })
        const mk = /^\d{4}-\d{2}$/.test(String(bt.month ?? '')) ? String(bt.month) : monthKey()
        const cps = { ...(acc.checkpoints ?? {}) }
        if (bt.balance == null || Number.isNaN(Number(bt.balance))) delete cps[mk]
        else cps[mk] = Number(bt.balance)
        acc.checkpoints = cps
        audit('apply', bt.balance == null ? `Balance check cleared · ${acc.name} · ${mk}` : `Balance checked · ${acc.name} · ${INR(Number(bt.balance))}`, { monthKey: mk, personal: !isSuper, parties: !isSuper && actor ? [actor] : undefined })
        await writeDoc(doc)
        return respond()
      }

      case 'addTransfer': {
        const bt = body as unknown as { transfer?: Partial<Transfer> }
        const t = bt.transfer
        const accs = doc.accounts ?? []
        const from = accs.find(a => a.id === t?.from), to = accs.find(a => a.id === t?.to)
        const amount = Number(t?.amount)
        if (!t || !from || !to || from.id === to.id || !(amount > 0)) return NextResponse.json({ error: 'Pick two different accounts and an amount.' }, { status: 400 })
        const mine = (a: Account) => a.owner === (isSuper ? 'common' : actor)
        const reach = (a: Account) => mine(a) || a.owner === 'common'
        if (!(mine(from) || mine(to)) || !reach(from) || !reach(to)) return NextResponse.json({ error: 'You can only move money between your own accounts and the common account.' }, { status: 403 })
        const mk = /^\d{4}-\d{2}$/.test(String(t.month ?? '')) ? String(t.month) : (t.date ? String(t.date).slice(0, 7) : monthKey())
        const rec: Transfer = { id: uid('trf'), month: mk, date: t.date || null, from: from.id, to: to.id, amount, note: String(t.note ?? '').slice(0, 120) || undefined, by: actorName }
        doc.transfers = [...(doc.transfers ?? []), rec]
        audit('apply', `Transfer · ${from.name} → ${to.name} · ${INR(amount)}`, { monthKey: mk, personal: !isSuper && from.owner !== 'common' && to.owner !== 'common', parties: !isSuper && actor ? [actor] : undefined })
        await writeDoc(doc)
        return respond()
      }

      case 'removeTransfer': {
        const id = (body as unknown as { id?: string }).id
        const t = (doc.transfers ?? []).find(x => x.id === id)
        if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        const own = isSuper ? 'common' : actor
        const touches = (doc.accounts ?? []).some(a => a.owner === own && (a.id === t.from || a.id === t.to))
        if (!touches) return NextResponse.json({ error: 'That transfer is not yours.' }, { status: 403 })
        doc.transfers = (doc.transfers ?? []).filter(x => x.id !== id)
        audit('apply', `Transfer removed · ${INR(t.amount)}`, { monthKey: t.month, personal: !isSuper, parties: !isSuper && actor ? [actor] : undefined })
        await writeDoc(doc)
        return respond()
      }

      // ================= goals & surplus =================
      case 'saveGoal': {
        const bt = body as unknown as { goal?: Partial<Goal> }
        const g = bt.goal
        if (!g || !String(g.name ?? '').trim() || !(Number(g.target) > 0)) return NextResponse.json({ error: 'A goal needs a name and a target.' }, { status: 400 })
        const list = doc.goals ?? []
        const prev = g.id ? list.find(x => x.id === g.id) : undefined
        // Your own goal, or a household one. A delegate only touches the owner's own.
        const owner = isSuper ? 'household' : (g.owner === 'household' && !grant ? 'household' : actor)
        if (!owner) return NextResponse.json({ error: 'No profile' }, { status: 400 })
        if (prev && prev.owner !== owner && !(prev.owner === 'household' && !grant)) return NextResponse.json({ error: 'That goal is not yours.' }, { status: 403 })
        const kinds = ['emergency', 'travel', 'vehicle', 'education', 'gadget', 'home', 'other'] as const
        const rec: Goal = {
          id: prev?.id ?? uid('goal'), owner: prev?.owner ?? owner,
          name: String(g.name).trim().slice(0, 60), target: Math.max(1, Number(g.target) || 0),
          saved: prev ? prev.saved : Math.max(0, Number(g.saved) || 0),
          targetDate: /^\d{4}-\d{2}/.test(String(g.targetDate ?? '')) ? String(g.targetDate).slice(0, 7) : null,
          monthly: Math.max(0, Number(g.monthly) || 0),
          kind: kinds.includes(g.kind as typeof kinds[number]) ? g.kind : 'other',
          color: typeof g.color === 'string' ? g.color.slice(0, 9) : prev?.color,
          createdBy: prev?.createdBy ?? actorName, contributions: prev?.contributions ?? [],
        }
        doc.goals = [...list.filter(x => x.id !== rec.id), rec]
        audit('apply', `${prev ? 'Goal updated' : 'Goal added'} · ${rec.name} · ${INR(rec.target)}`, { personal: rec.owner !== 'household', parties: !isSuper && actor ? [actor] : undefined })
        await writeDoc(doc)
        return respond({ id: rec.id })
      }

      case 'removeGoal': {
        const id = (body as unknown as { id?: string }).id
        const g = (doc.goals ?? []).find(x => x.id === id)
        if (!g) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        const ok = isSuper ? g.owner === 'household' : g.owner === actor || (g.owner === 'household' && !grant)
        if (!ok) return NextResponse.json({ error: 'That goal is not yours.' }, { status: 403 })
        doc.goals = (doc.goals ?? []).map(x => (x.id === id ? { ...x, archived: true } : x))
        audit('apply', `Goal closed · ${g.name}`, { personal: g.owner !== 'household', parties: !isSuper && actor ? [actor] : undefined })
        await writeDoc(doc)
        return respond()
      }

      case 'contributeGoal': {
        const bt = body as unknown as { id?: string; amount?: number; note?: string; month?: string }
        const g = (doc.goals ?? []).find(x => x.id === bt.id)
        const amount = Number(bt.amount)
        if (!g || !amount) return NextResponse.json({ error: 'Pick a goal and an amount.' }, { status: 400 })
        const ok = isSuper ? g.owner === 'household' : g.owner === actor || (g.owner === 'household' && !grant)
        if (!ok) return NextResponse.json({ error: 'That goal is not yours.' }, { status: 403 })
        const mk = /^\d{4}-\d{2}$/.test(String(bt.month ?? '')) ? String(bt.month) : monthKey()
        g.saved = Math.max(0, (g.saved || 0) + amount)
        g.contributions = [...(g.contributions ?? []), { id: uid('gc'), amount, at: new Date().toISOString(), by: actorName, month: mk, note: String(bt.note ?? '').slice(0, 120) || undefined }].slice(-200)
        audit('apply', `${amount > 0 ? 'Added to' : 'Took from'} goal · ${g.name} · ${INR(Math.abs(amount))}`, { monthKey: mk, personal: g.owner !== 'household', parties: !isSuper && actor ? [actor] : undefined })
        await writeDoc(doc)
        return respond()
      }

      case 'setAllocRules': {
        if (isSuper || !actor) return NextResponse.json({ error: 'Surplus rules are per person.' }, { status: 403 })
        const rules = ((body as unknown as { rules?: AllocRule[] }).rules ?? [])
          .filter(r => r && (r.target === 'carry' || r.target === 'invest' || (doc.goals ?? []).some(g => g.id === r.target && g.owner === actor)))
          .map(r => ({ target: r.target, pct: Math.max(0, Math.min(100, Number(r.pct) || 0)) }))
          .filter(r => r.pct > 0)
        doc.allocRules = { ...(doc.allocRules ?? {}), [actor]: rules }
        audit('apply', 'Surplus split updated', { personal: true, parties: [actor] })
        await writeDoc(doc)
        return respond()
      }

      case 'applyAllocation': {
        if (isSuper || !actor) return NextResponse.json({ error: 'Surplus allocation is per person.' }, { status: 403 })
        const bt = body as unknown as { month?: string; lines?: { target: string; amount: number }[] }
        const mk = /^\d{4}-\d{2}$/.test(String(bt.month ?? '')) ? String(bt.month) : monthKey()
        if ((doc.allocations ?? []).some(a => a.owner === actor && a.month === mk && !a.undone)) return NextResponse.json({ error: 'That month’s surplus has already been allocated. Undo it first to change it.' }, { status: 409 })
        const surplus = Math.floor(monthSurplus(doc, actor, mk))
        if (surplus <= 0) return NextResponse.json({ error: 'There is no surplus to allocate for that month.' }, { status: 400 })
        const valid = (t: string) => t === 'carry' || t === 'invest' || (doc.goals ?? []).some(g => g.id === t && g.owner === actor && !g.archived)
        const lines = (bt.lines?.length ? bt.lines : proposeAllocation(doc, actor, surplus))
          .filter(l => valid(l.target) && Number(l.amount) > 0)
          .map(l => ({ target: l.target, amount: Math.floor(Number(l.amount)), label: l.target === 'carry' ? 'Carry forward' : l.target === 'invest' ? 'Investments' : (doc.goals ?? []).find(g => g.id === l.target)!.name }))
        const total = lines.reduce((a, l) => a + l.amount, 0)
        if (total > surplus + 1) return NextResponse.json({ error: `That allocates ${INR(total)} but the surplus is ${INR(surplus)}.` }, { status: 400 })
        const alloc = { id: uid('alloc'), owner: actor, month: mk, surplus, lines, at: new Date().toISOString(), by: actorName }
        for (const l of lines) {
          if (l.target === 'invest') {
            const pot = doc.savings.find(x => x.entity === actor && x.label === 'Investments (from surplus)')
            if (pot) pot.balance = (pot.balance || 0) + l.amount
            else doc.savings = [...doc.savings, { id: uid('sav'), label: 'Investments (from surplus)', entity: actor, balance: l.amount, kind: 'MF', liquid: false }]
          } else if (l.target !== 'carry') {
            const g = (doc.goals ?? []).find(x => x.id === l.target)!
            g.saved = (g.saved || 0) + l.amount
            g.contributions = [...(g.contributions ?? []), { id: uid('gc'), amount: l.amount, at: alloc.at, by: actorName, month: mk, note: 'Month-end surplus', allocationId: alloc.id }]
          }
        }
        doc.allocations = [...(doc.allocations ?? []), alloc]
        audit('apply', `Surplus allocated · ${mk} · ${INR(total)}`, { monthKey: mk, personal: true, parties: [actor] })
        await writeDoc(doc)
        return respond()
      }

      case 'undoAllocation': {
        const id = (body as unknown as { id?: string }).id
        const al = (doc.allocations ?? []).find(a => a.id === id)
        if (!al || al.undone) return NextResponse.json({ error: 'Nothing to undo.' }, { status: 404 })
        if (isSuper || al.owner !== actor) return NextResponse.json({ error: 'Not yours.' }, { status: 403 })
        for (const l of al.lines) {
          if (l.target === 'invest') {
            const pot = doc.savings.find(x => x.entity === actor && x.label === 'Investments (from surplus)')
            if (pot) pot.balance = Math.max(0, (pot.balance || 0) - l.amount)
          } else if (l.target !== 'carry') {
            const g = (doc.goals ?? []).find(x => x.id === l.target)
            if (g) { g.saved = Math.max(0, (g.saved || 0) - l.amount); g.contributions = (g.contributions ?? []).filter(c => c.allocationId !== al.id) }
          }
        }
        al.undone = true
        audit('apply', `Surplus allocation undone · ${al.month}`, { monthKey: al.month, personal: true, parties: [al.owner] })
        await writeDoc(doc)
        return respond()
      }

      // ================= allowances =================
      case 'saveAllowance': {
        const a = (body as unknown as { allowance?: Partial<Allowance> }).allowance
        const dep = a && doc.entities.find(e => e.id === a.entity && e.kind === 'person')
        if (!a || !dep || !(Number(a.monthly) > 0)) return NextResponse.json({ error: 'Pick who it is for and a monthly amount.' }, { status: 400 })
        const approvers = (a.approvers ?? []).filter(x => x !== dep.id && doc.entities.some(e => e.id === x && e.kind === 'person'))
        if (!approvers.length) return NextResponse.json({ error: 'Choose at least one parent to approve larger expenses.' }, { status: 400 })
        const prev = a.id ? (doc.allowances ?? []).find(x => x.id === a.id) : undefined
        // Set by the family admin, or by a parent who will be approving it.
        const allowed = isSuper || (realActor && approvers.includes(realActor) && (!prev || prev.approvers.includes(realActor)))
        if (!allowed) return NextResponse.json({ error: 'Only a parent approving this allowance (or the family admin) can set it.' }, { status: 403 })
        const limits: Record<string, number> = {}
        for (const [c, v] of Object.entries(a.categoryLimits ?? {})) if (Number(v) > 0) limits[c] = Number(v)
        const rec: Allowance = {
          id: prev?.id ?? uid('alw'), entity: dep.id, monthly: Number(a.monthly), threshold: Math.max(0, Number(a.threshold) || 0),
          approvers, categoryLimits: limits, active: a.active !== false,
          startMonth: /^\d{4}-\d{2}$/.test(String(a.startMonth ?? '')) ? String(a.startMonth) : prev?.startMonth ?? monthKey(),
          note: String(a.note ?? '').slice(0, 120) || undefined,
        }
        doc.allowances = [...(doc.allowances ?? []).filter(x => x.id !== rec.id), rec]
        audit('apply', `${prev ? 'Allowance updated' : 'Allowance set'} · ${dep.name} · ${INR(rec.monthly)}/month`, { parties: [dep.id, ...approvers] })
        await writeDoc(doc)
        return respond()
      }

      case 'removeAllowance': {
        const id = (body as unknown as { id?: string }).id
        const a = (doc.allowances ?? []).find(x => x.id === id)
        if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        if (!isSuper && !(realActor && a.approvers.includes(realActor))) return NextResponse.json({ error: 'Only a parent on this allowance can remove it.' }, { status: 403 })
        doc.allowances = (doc.allowances ?? []).filter(x => x.id !== id)
        audit('apply', `Allowance removed · ${entName(doc, a.entity)}`, { parties: [a.entity, ...a.approvers] })
        await writeDoc(doc)
        return respond()
      }

      // ================= delegated access =================
      case 'requestAccess': {
        if (isSuper || !realActor) return NextResponse.json({ error: 'Only a family member can ask to manage someone’s finances.' }, { status: 403 })
        const bt = body as unknown as { owner?: string; perms?: AccessPerms; message?: string; expiresOn?: string }
        const owner = doc.entities.find(e => e.id === bt.owner && e.kind === 'person')
        if (!owner || owner.id === realActor) return NextResponse.json({ error: 'Pick someone else in the family.' }, { status: 400 })
        const perms = cleanPerms(bt.perms)
        if (!Object.keys(perms).length) return NextResponse.json({ error: 'Ask for at least one permission.' }, { status: 400 })
        const open = (doc.delegations ?? []).find(d => d.grantee === realActor && d.owner === owner.id && (d.status === 'pending' || d.status === 'active'))
        if (open) return NextResponse.json({ error: open.status === 'active' ? `You already manage ${owner.name}’s finances. Ask them to change the permissions instead.` : 'A request is already waiting for them.' }, { status: 409 })
        const d: Delegation = {
          id: uid('dlg'), grantee: realActor, owner: owner.id, perms, requested: perms, status: 'pending',
          message: String(bt.message ?? '').slice(0, 280) || undefined, requestedAt: new Date().toISOString(),
          expiresOn: /^\d{4}-\d{2}-\d{2}$/.test(String(bt.expiresOn ?? '')) ? String(bt.expiresOn) : null,
        }
        doc.delegations = [...(doc.delegations ?? []), d]
        audit('propose', `Access requested · ${actorName} → ${owner.name}’s finances`, { parties: [realActor, owner.id] })
        await writeDoc(doc)
        await emailEntity(owner.id, `${actorName} is asking to manage your finances`,
          `${actorName} has asked for permission to manage your finances in the family vault.\n\nAccess requested:\n${describePerms(perms)}${d.message ? `\n\nTheir note: “${d.message}”` : ''}\n\nOpen the vault → Access to approve or decline. Nothing is shared until you approve, and you can revoke it at any time.`)
        return respond()
      }

      case 'decideAccess': {
        const bt = body as unknown as { id?: string; approve?: boolean; perms?: AccessPerms; expiresOn?: string | null }
        const d = (doc.delegations ?? []).find(x => x.id === bt.id)
        if (!d || d.status !== 'pending') return NextResponse.json({ error: 'That request is no longer waiting.' }, { status: 404 })
        if (grant || realActor !== d.owner) return NextResponse.json({ error: 'Only the person whose finances these are can decide.' }, { status: 403 })
        const ownerName = entName(doc, d.owner), granteeName = entName(doc, d.grantee)
        if (bt.approve) {
          const perms = cleanPerms(bt.perms ?? d.requested)
          if (!Object.keys(perms).length) return NextResponse.json({ error: 'Tick at least one permission, or decline.' }, { status: 400 })
          d.perms = perms; d.status = 'active'
          if (bt.expiresOn !== undefined) d.expiresOn = bt.expiresOn && /^\d{4}-\d{2}-\d{2}$/.test(bt.expiresOn) ? bt.expiresOn : null
        } else d.status = 'declined'
        d.decidedAt = new Date().toISOString()
        audit(bt.approve ? 'accept' : 'decline', `Access ${bt.approve ? 'granted' : 'declined'} · ${granteeName} → ${ownerName}’s finances`, { parties: [d.owner, d.grantee] })
        await writeDoc(doc)
        await emailEntity(d.grantee, bt.approve ? `${ownerName} approved your access` : `${ownerName} declined your access request`,
          bt.approve ? `You can now manage ${ownerName}’s finances in the family vault.\n\nGranted:\n${describePerms(d.perms)}\n\nSwitch profiles from the top of the finance page. Everything you do is logged as done on ${ownerName}’s behalf.` : `${ownerName} declined your request to manage their finances.`)
        return respond()
      }

      case 'updateAccess': {
        const bt = body as unknown as { id?: string; perms?: AccessPerms; expiresOn?: string | null }
        const d = (doc.delegations ?? []).find(x => x.id === bt.id)
        if (!d || d.status !== 'active') return NextResponse.json({ error: 'That access is not active.' }, { status: 404 })
        if (grant || realActor !== d.owner) return NextResponse.json({ error: 'Only the owner can change what is shared.' }, { status: 403 })
        const perms = cleanPerms(bt.perms)
        if (!Object.keys(perms).length) return NextResponse.json({ error: 'To remove every permission, revoke the access instead.' }, { status: 400 })
        d.perms = perms
        if (bt.expiresOn !== undefined) d.expiresOn = bt.expiresOn && /^\d{4}-\d{2}-\d{2}$/.test(bt.expiresOn) ? bt.expiresOn : null
        audit('apply', `Access changed · ${entName(doc, d.grantee)} → ${entName(doc, d.owner)}’s finances`, { parties: [d.owner, d.grantee] })
        await writeDoc(doc)
        return respond()
      }

      case 'revokeAccess': {
        // The owner revokes, the delegate steps away, or the admin pulls it.
        const id = (body as unknown as { id?: string }).id
        const d = (doc.delegations ?? []).find(x => x.id === id)
        if (!d || (d.status !== 'active' && d.status !== 'pending')) return NextResponse.json({ error: 'Nothing to revoke.' }, { status: 404 })
        if (grant) return NextResponse.json({ error: 'Switch back to your own profile first.' }, { status: 403 })
        const who = isSuper ? 'super' : realActor
        if (!(isSuper || who === d.owner || who === d.grantee)) return NextResponse.json({ error: 'Not yours to revoke.' }, { status: 403 })
        d.status = who === d.grantee && d.status === 'pending' ? 'cancelled' : 'revoked'
        d.endedAt = new Date().toISOString(); d.endedBy = actorName
        audit('revoke', `Access ${d.status} · ${entName(doc, d.grantee)} → ${entName(doc, d.owner)}’s finances`, { parties: [d.owner, d.grantee] })
        await writeDoc(doc)
        if (who !== d.grantee) await emailEntity(d.grantee, `Access to ${entName(doc, d.owner)}’s finances has ended`, `${actorName} revoked your access to ${entName(doc, d.owner)}’s finances. It stopped working immediately.`)
        return respond()
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Action failed' }, { status: 500 })
  }
}
