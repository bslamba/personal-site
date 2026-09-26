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
//   requestAccess / decideAccess / updateAccess / revokeAccess
//                  delegated access between members
//
// Every action is authorised against the caller's identity. A member who
// has been granted access to someone else's finances sends `actingAs`: the
// action then runs exactly as the owner would run it, provided the grant
// covers it, and is logged as "X did this on behalf of Y".
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSession, VAULT_COOKIE } from '@/lib/vault-auth'
import { migrate, approversFor, isPersonalTo, commitProposalItem, materialise, monthKey, uid, paymentsFor, isUpiId,
         currentOf, revertIsSafe, applyRevert, type AuditChange,
         setCommonIncome, computeSettlement, putMonthOverride, deleteMonthTemplate, monthView,
         type FinanceDoc, type Item, type IncomeItem, type Proposal, type SavingItem, type EntityBudget } from '@/lib/finance-data'
import { readRaw, writeDoc as saveDoc, viewFor, viewForGrant } from '../route'
import { keepFinalSheets } from '../sheets'
import { activeDelegation, can, isLiquid, ACCESS_AREAS, ACCESS_OPS, ACCESS_LABEL,
         applyTemplateOpRanged, describeRange, validRange, pushBudget, resetMonthFromBudget, type IncomeOp, type ResetScope,
         type Delegation, type AccessArea, type AccessOp, type AccessPerms, INR, monthLabel } from '@/lib/finance-data'
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
 * With full access that is everything the owner can do. The one exception
 * (returns null) is access itself: acting as someone never lets you hand
 * their finances to anyone else, or change who else can see them.
 */
function permFor(body: Record<string, unknown>, doc: FinanceDoc): { area: AccessArea; op: AccessOp } | null {
  const item = body.item as Item | undefined
  // Judge by what is actually stored, never by labels the browser sends: an
  // item that IS a loan is a loan whatever `kind` says, and an id that
  // already exists is an edit whatever `isNew` says.
  const stored = item ? existingItem(doc, body.monthKey as string | undefined, item) : undefined
  const isLoan = item?.kind === 'emi' || stored?.kind === 'emi' || body.section === 'emis'
  const loanOr = (a: AccessArea) => (isLoan ? 'loans' : a)
  switch (body.action) {
    case 'propose': return { area: loanOr('expenses'), op: 'add' }
    case 'proposeMonthEdit': return { area: loanOr('expenses'), op: body.op === 'delete' ? 'delete' : 'edit' }
    case 'proposeTemplate': return { area: loanOr('expenses'), op: body.op === 'delete' ? 'delete' : body.op === 'add' && !stored ? 'add' : 'edit' }
    case 'importRows': return { area: 'expenses', op: 'add' }
    case 'setMonthIncome': case 'setTemplateIncome': return { area: 'income', op: 'edit' }
    case 'resetMonth': return body.scope === 'income' ? { area: 'income', op: 'edit' } : { area: 'expenses', op: 'edit' }
    case 'setSavings': return { area: 'savings', op: 'edit' }          // refined below for investments
    case 'setBudget': return { area: 'budgets', op: 'edit' }
    case 'setUpi': return { area: 'accounts', op: 'edit' }
    case 'setCommonIncome': return { area: 'income', op: 'edit' }
    case 'revertChange': return { area: 'expenses', op: 'edit' }
    case 'saveReminder': case 'resolveReminder': case 'unresolveReminder': return { area: 'expenses', op: 'edit' }
    case 'removeReminder': return { area: 'expenses', op: 'delete' }
    // Their say on shared changes, and money between people.
    case 'accept': case 'decline': case 'revoke': return { area: 'approvals', op: 'edit' }
    case 'settlePay': case 'settleUnpay': case 'closeSettlement': case 'reopenSettlement': return { area: 'approvals', op: 'edit' }
    default: return null
  }
}

/** The stored version of an item a request refers to, wherever it lives. */
function existingItem(doc: FinanceDoc, mk: string | undefined, it: Item): Item | undefined {
  const t = doc.template
  const inTemplate = [...t.monthly, ...t.emis, ...t.annual]
  // This month's own copy of a recurring item (it may carry the receipt).
  const override = it.tmplId && mk ? doc.months[mk]?.items.find(x => x.src === 'template' && x.tmplId === it.tmplId) : undefined
  if (override) return override
  const byTmpl = it.tmplId ? inTemplate.find(x => x.id === it.tmplId) : undefined
  if (byTmpl) return byTmpl
  const direct = inTemplate.find(x => x.id === it.id)
  if (direct) return direct
  const months = mk && doc.months[mk] ? [doc.months[mk]] : Object.values(doc.months)
  for (const m of months) { const x = m.items.find(y => y.id === it.id); if (x) return x }
  return undefined
}

/** History wording for actions that do not write their own entry. */
const ACTION_LABEL: Record<string, string> = {
  importRows: 'Imported statement rows', saveReminder: 'Reminder saved', removeReminder: 'Reminder removed',
  resolveReminder: 'Reminder marked done', unresolveReminder: 'Reminder reopened', settleUnpay: 'Settlement payment removed',
  setSavings: 'Savings updated', setBudget: 'Budget updated', setMonthIncome: 'Income updated',
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

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
async function emailEntity(entityId: string, title: string, body: string) {
  try {
    const users = await getUsers()
    const u = users.find(x => x.entityId === entityId && x.email)
    // The note in a request is typed by another member — it goes into an HTML
    // email, so it is escaped, and its line breaks kept.
    if (u?.email) await sendReminderEmail([u.email], { title: esc(title), body: esc(body).replace(/\n/g, '<br>'), name: esc(u.firstName || u.name) })
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
    const need = permFor(body as unknown as Record<string, unknown>, doc)
    if (!need) return NextResponse.json({ error: 'That can only be done by the owner themselves.' }, { status: 403 })
    // Savings pots are split by kind: either grant lets you save the list, and
    // the rows you may not touch are carried over untouched below.
    const savingsOk = body.action === 'setSavings' && (can(grant.perms, 'savings', 'edit') || can(grant.perms, 'investments', 'edit'))
    if (!savingsOk && !can(grant.perms, need.area, need.op)) {
      return NextResponse.json({ error: `${entName(doc, grant.owner)} has not given you permission to ${need.op} ${ACCESS_LABEL[need.area].toLowerCase()}.` }, { status: 403 })
    }
    // Receipts ride along on expenses. Without document access a delegate can
    // neither attach one nor — since they never saw it — remove one: whatever
    // is stored stays.
    if (body.item && !can(grant.perms, 'documents', 'add')) {
      const was = existingItem(doc, body.monthKey, body.item)
      body.item.receiptKey = was?.receiptKey ?? null
    }
  }
  const actor = grant ? grant.owner : session.e   // whose data this acts on; null for super
  const realActor = session.e                      // who is actually at the keyboard
  const actorName = isSuper ? 'Super admin' : entName(doc, realActor)
  const audit = (event: 'propose' | 'accept' | 'decline' | 'revoke' | 'apply', what: string, extra: { reason?: string; monthKey?: string; proposalId?: string; parties?: string[]; personal?: boolean; change?: AuditChange; revertOf?: string } = {}) => {
    const behalf = grant ? { onBehalfOf: grant.owner, onBehalfName: entName(doc, grant.owner), parties: [...new Set([...(extra.parties ?? []), grant.owner, grant.grantee])] } : {}
    doc.auditLog = [...(doc.auditLog ?? []), { id: uid('log'), ts: new Date().toISOString(), actor: realActor ?? 'super', actorName, event, what, ...extra, ...behalf }].slice(-800)
  }
  // While acting for someone, EVERY change is recorded as made by the person
  // at the keyboard on the owner's behalf — even the kinds of change that
  // would otherwise leave no history entry.
  const lastLogId = (doc.auditLog ?? []).at(-1)?.id
  const writeDoc = async (d: FinanceDoc) => {
    if (grant && (d.auditLog ?? []).at(-1)?.id === lastLogId) audit('apply', ACTION_LABEL[body.action] ?? body.action, { personal: true })
    await saveDoc(d)
  }
  const respond = (extra: Record<string, unknown> = {}) => NextResponse.json({
    ok: true, ...extra, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor },
  })
  // A closed month is final: nothing in it changes until it is reopened.
  const isClosed = (mk?: string | null) => !!(mk && doc.settlements?.[mk]?.closed)
  const closedErr = (mk: string) => NextResponse.json({ error: `${monthLabel(mk)} is closed, so it can no longer be changed. Reopen it on the Settlement tab first.` }, { status: 409 })
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
        if (isClosed(monthKey)) return closedErr(monthKey)
        item.id = item.id || uid('one')
        const addLabel = `Add · ${shortName(item)} · ${INR(item.amount || 0)}`
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
          const target = pr.incomeEdit?.monthKey ?? (pr.template ? null : pr.monthKey)
          if (done && isClosed(target)) return closedErr(target!)
          let ch: AuditChange | undefined
          if (done) {
            // Capture what accepting is about to do, so it can be undone too.
            if (pr.template && (!pr.range || pr.range.to === null)) ch = templateChange(pr.template.section, pr.item, pr.template.op === 'delete' ? null : pr.item)
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
        if (isClosed(mk)) return closedErr(mk)
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
        const rawRange = (body as unknown as { range?: unknown }).range
        const range = rawRange == null ? null : validRange(rawRange)
        if (rawRange != null && !range) return NextResponse.json({ error: 'Pick a valid range of months.' }, { status: 400 })
        if (!range) {
          doc.template.income = [...doc.template.income.filter(i => i.entity !== actor), ...incoming]
        } else {
          // Only this person's rows, compared as they were and as they are now.
          const was = doc.template.income.filter(i => i.entity === actor)
          const ops: IncomeOp[] = []
          for (const r of incoming) { const old = was.find(w => w.id === r.id); if (!old) ops.push({ op: 'add', item: r }); else if (old.source !== r.source || old.amount !== r.amount) ops.push({ op: 'update', item: r, before: old }) }
          for (const old of was) if (!incoming.some(r => r.id === old.id)) ops.push({ op: 'delete', item: old, before: old })
          pushBudget(doc, [], ops, range)
        }
        audit('apply', `Recurring income updated${range ? ` · ${describeRange(range)}` : ''}`, { personal: true, parties: [actor] })
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
        if (c.scope === 'month' && isClosed(c.monthKey)) return closedErr(c.monthKey!)
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
          if (isClosed(mk)) { skipped++; continue }       // closed months take no new rows
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
        if (isClosed(monthKey2)) return closedErr(monthKey2)
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
        const bt = body as unknown as { item?: Item; section?: 'monthly' | 'emis' | 'annual'; op?: 'add' | 'update' | 'delete'; reason?: string; range?: unknown }
        const item = bt.item, section = bt.section, op = bt.op
        const reason = (bt.reason || '').trim()
        if (!item || !section || !op) return NextResponse.json({ error: 'Missing item' }, { status: 400 })
        // Which months the change is for. None means the Budget itself, as before.
        const range = bt.range == null ? null : validRange(bt.range)
        if (bt.range != null && !range) return NextResponse.json({ error: 'Pick a valid range of months — the end cannot come before the start.' }, { status: 400 })
        if (op === 'add') item.id = item.id || uid(section)
        const personal = actor ? isPersonalTo(item, actor, doc.entities) : false
        const label = `${op === 'delete' ? 'Remove' : op === 'add' ? 'Add' : 'Change'} recurring · ${shortName(item)}${range ? ` · ${describeRange(range)}` : ''}`
        // Only a whole-Budget change can be undone from the history on its own.
        const undoable = !range || range.to === null
        if (isSuper || personal) {
          const ch = undoable ? templateChange(section, item, op === 'delete' ? null : item) : undefined
          applyTemplateOpRanged(doc, section, op, item, range)
          audit('apply', label, { reason: reason || undefined, personal: !isSuper, parties: !isSuper && actor ? [actor] : undefined, change: ch })
          await writeDoc(doc)
          return NextResponse.json({ ok: true, applied: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
        }
        if (!actor) return NextResponse.json({ error: 'No entity' }, { status: 400 })
        const { approvers, mode } = approversFor(item, actor, doc.entities)
        if (approvers.length === 0) {
          const ch = undoable ? templateChange(section, item, op === 'delete' ? null : item) : undefined
          applyTemplateOpRanged(doc, section, op, item, range)
          audit('apply', label, { reason: reason || undefined, personal: !isSuper, parties: !isSuper && actor ? [actor] : undefined, change: ch })
          await writeDoc(doc)
          return NextResponse.json({ ok: true, applied: true, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
        }
        if (op !== 'add' && !reason) return NextResponse.json({ error: 'Please give a reason for this change so the other person can review it.' }, { status: 400 })
        if (op !== 'add' && pendingEditFor(item.id)) return NextResponse.json({ error: 'This item already has a change waiting for approval. Revoke that one first.' }, { status: 409 })
        const pr: Proposal = {
          id: uid('prop'), item, monthKey: monthKey(), proposedBy: actor, proposedByName: byName,
          approvers, approved: [], mode, status: 'pending', createdAt: new Date().toISOString(), template: { section, op }, reason: reason || undefined,
          range: range ?? undefined,
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
        if (isClosed(mk)) return closedErr(mk)
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
        if (isClosed(mk)) return closedErr(mk)
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
        // Freeze exactly what the month holds now; from here it is read-only.
        const snap = monthView(doc, mk)
        doc.months[mk] = { ...(doc.months[mk] ?? { items: [], income: [] }), frozen: { items: snap.items, income: snap.income, at: st.closedAt, by: actorName } }
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
        // The closing copy of the month's sheet, kept for every profile. The
        // month is already closed and saved; a storage hiccup here must not
        // undo that, so it is reported rather than thrown.
        let sheets = 0, sheetError: string | undefined
        try { sheets = await keepFinalSheets(doc, mk, actorName) } catch (e) { sheetError = e instanceof Error ? e.message : 'Could not keep the final sheets' }
        return NextResponse.json({ ok: true, carried: carry.length, sheets, sheetError, doc: grant ? viewForGrant(doc, grant) : viewFor(session, doc), me: { role: session.r, entityId: actor } })
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
        // Editable again, starting from exactly what it held when closed — so
        // a recurring bill changed in the meantime does not quietly alter it.
        // Its final sheet stays kept; closing again keeps a new one.
        const fz = doc.months[mk]?.frozen
        if (fz) {
          const live = new Set([...doc.template.monthly, ...doc.template.emis, ...doc.template.annual].map(t => t.id))
          const items = fz.items.map(it => (it.src === 'template' && it.tmplId && live.has(it.tmplId)
            ? { ...it, override: true }
            : { ...it, src: 'manual' as const, tmplId: undefined, override: undefined }))
          const kept = new Set(fz.items.map(i => i.tmplId).filter(Boolean))
          const dropped = materialise(doc.template, mk).items.map(i => i.tmplId!).filter(id => id && !kept.has(id))
          const m = { ...doc.months[mk], items, deletedTemplate: [...new Set([...(doc.months[mk].deletedTemplate ?? []), ...dropped])] }
          delete m.frozen
          doc.months[mk] = m
        }
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

      // ================= fetch a month back from the Budget =================
      case 'resetMonth': {
        const bt = body as unknown as { monthKey?: string; scope?: ResetScope; includeOneOffs?: boolean }
        const mk = bt.monthKey ?? ''
        const scope = bt.scope
        if (!/^\d{4}-\d{2}$/.test(mk) || !scope || !['all', 'household', 'personal', 'income'].includes(scope)) return NextResponse.json({ error: 'Pick a month and what to fetch.' }, { status: 400 })
        if (isClosed(mk)) return closedErr(mk)
        // Shared figures are everybody's: a member refreshes their own part —
        // their personal expenses and their income. The household is reset by
        // the family admin.
        if (!isSuper && (scope === 'all' || scope === 'household')) return NextResponse.json({ error: 'Only the family admin can fetch the whole household back from the Budget. You can fetch your own expenses and income.' }, { status: 403 })
        if (isSuper && scope === 'personal') return NextResponse.json({ error: 'Personal figures belong to each person.' }, { status: 400 })
        const r = resetMonthFromBudget(doc, mk, scope, isSuper ? null : actor, !!bt.includeOneOffs)
        const what = { all: 'everything', household: 'Lamba Household', personal: 'personal expenses', income: 'income' }[scope]
        audit('apply', `Fetched ${what} from the Budget · ${monthLabel(mk)}${bt.includeOneOffs ? ' · one-offs cleared' : ''}`, { monthKey: mk, personal: scope === 'personal' || (scope === 'income' && !isSuper), parties: !isSuper && actor ? [actor] : undefined })
        await writeDoc(doc)
        return respond({ reset: r })
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
