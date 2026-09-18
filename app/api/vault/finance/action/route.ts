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
//
// Every action is authorised against the caller's identity.
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSession, VAULT_COOKIE } from '@/lib/vault-auth'
import { migrate, approversFor, isPersonalTo, commitProposalItem, applyTemplateOp, materialise, monthKey, uid, paymentsFor, isUpiId,
         setCommonIncome, computeSettlement, putMonthOverride, deleteMonthTemplate, monthView,
         type FinanceDoc, type Item, type IncomeItem, type Proposal, type SavingItem, type EntityBudget } from '@/lib/finance-data'
import { readRaw, writeDoc, viewFor } from '../route'

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

export async function POST(request: Request) {
  const jar = await cookies()
  const session = await getSession(jar.get(VAULT_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await request.json().catch(() => null) as
    | { action: string; item?: Item; monthKey?: string; id?: string; savings?: SavingItem[]; budget?: EntityBudget } | null
  if (!body?.action) return NextResponse.json({ error: 'No action' }, { status: 400 })

  const raw = await readRaw()
  const doc: FinanceDoc = migrate(raw ?? {})
  const isSuper = session.r === 'super'
  const actor = session.e   // entity id for members; null for super
  const actorName = isSuper ? 'Super admin' : entName(doc, actor)
  const audit = (event: 'propose' | 'accept' | 'decline' | 'revoke' | 'apply', what: string, extra: { reason?: string; monthKey?: string; proposalId?: string; parties?: string[]; personal?: boolean } = {}) => {
    doc.auditLog = [...(doc.auditLog ?? []), { id: uid('log'), ts: new Date().toISOString(), actor: actor ?? 'super', actorName, event, what, ...extra }].slice(-800)
  }
  const partiesOf = (pr: Proposal) => [pr.proposedBy, ...pr.approvers].filter(x => x && x !== 'super')
  // An existing pending proposal that TARGETS a specific item (an edit or a
  // template change/removal) — used to block a second, overlapping edit.
  const pendingEditFor = (id: string) => (doc.proposals ?? []).find(p => p.item?.id === id && (p.monthEdit || (p.template && p.template.op !== 'add')))
  const shortName = (it?: Item) => (it?.name || 'expense')

  try {
    switch (body.action) {
      case 'propose': {
        const item = body.item, monthKey = body.monthKey
        if (!item || !monthKey) return NextResponse.json({ error: 'Missing item' }, { status: 400 })
        item.id = item.id || uid('one')
        const addLabel = `Add · ${shortName(item)}`
        // Super, or an expense that is purely the caller's own, is added straight away.
        if (isSuper || (actor && isPersonalTo(item, actor, doc.entities))) {
          addToMonth(doc, monthKey, item)
          audit('apply', addLabel, { monthKey, personal: !isSuper, parties: !isSuper && actor ? [actor] : undefined })
          await writeDoc(doc)
          return NextResponse.json({ ok: true, added: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
        }
        if (!actor) return NextResponse.json({ error: 'No entity' }, { status: 400 })
        const { approvers, mode } = approversFor(item, actor, doc.entities)
        if (approvers.length === 0) {
          addToMonth(doc, monthKey, item)
          audit('apply', addLabel, { monthKey, personal: true, parties: actor ? [actor] : undefined })
          await writeDoc(doc)
          return NextResponse.json({ ok: true, added: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
        }
        const pr: Proposal = {
          id: uid('prop'), item, monthKey, proposedBy: actor, proposedByName: entName(doc, actor),
          approvers, approved: [], mode, status: 'pending', createdAt: new Date().toISOString(),
        }
        doc.proposals = [...(doc.proposals ?? []), pr]
        audit('propose', addLabel, { monthKey, proposalId: pr.id, parties: [actor, ...approvers] })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, proposed: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
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
          if (done) {
            commitProposalItem(doc, pr)
            doc.proposals = doc.proposals.filter(p => p.id !== pr.id)
          }
          audit('accept', prLabel, { monthKey: pr.monthKey, proposalId: pr.id, reason: pr.reason, parties: partiesOf(pr) })
        }
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
      }

      case 'setSavings': {
        // Savings are private to each profile — not even super sees them, so
        // super has nothing to save here. The old super branch replaced the
        // whole savings list, which would have wiped every member's pots.
        if (isSuper || !actor) return NextResponse.json({ error: 'Savings are private to each profile' }, { status: 403 })
        const rows = (body.savings ?? [])
        const who = actor
        const mine = rows.map(r => ({ ...r, entity: who }))
        doc.savings = [...doc.savings.filter(s => s.entity !== who), ...mine]
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
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
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
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
        return NextResponse.json({ ok: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
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
        return NextResponse.json({ ok: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
      }

      case 'setBudget': {
        if (!body.budget) return NextResponse.json({ error: 'No budget' }, { status: 400 })
        const who = actor ?? 'su'
        doc.budgets.byEntity[who] = body.budget
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
      }

      case 'setFamilyBudget': {
        if (!isSuper) return NextResponse.json({ error: 'Super only' }, { status: 403 })
        if (!body.budget) return NextResponse.json({ error: 'No budget' }, { status: 400 })
        doc.budgets.family = body.budget
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
      }

      case 'importRows': {
        interface Row { date: string; name: string; amount: number; type: 'debit' | 'credit'; category?: string; note?: string; ref?: string; shareWith?: string; sharePct?: number; tags?: string[]; envelope?: string }
        const rows = (body as unknown as { rows?: Row[] }).rows ?? []
        const wantOwner = (body as unknown as { owner?: string }).owner
        // "Paid from" = the logged-in profile (or, for super, the chosen person).
        const owner = isSuper ? (wantOwner || 'bhawneet') : (actor ?? '')
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
        return NextResponse.json({ ok: true, added, proposed, skipped, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
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
          applyMonthEdit(doc, monthKey2, item, op)
          audit('apply', label, { monthKey: monthKey2, reason: reason || undefined, personal: !isSuper, parties: !isSuper && actor ? [actor] : undefined })
          await writeDoc(doc)
          return NextResponse.json({ ok: true, applied: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
        }
        if (!actor) return NextResponse.json({ error: 'No entity' }, { status: 400 })
        const ap = approversFor(item, actor, doc.entities)
        if (ap.approvers.length === 0) {
          applyMonthEdit(doc, monthKey2, item, op)
          audit('apply', label, { monthKey: monthKey2, reason: reason || undefined, personal: !isSuper, parties: !isSuper && actor ? [actor] : undefined })
          await writeDoc(doc)
          return NextResponse.json({ ok: true, applied: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
        }
        // Shared edit → needs approval. Require a reason and block a second,
        // overlapping edit on the same expense.
        if (!reason) return NextResponse.json({ error: 'Please give a reason for this change so the other person can review it.' }, { status: 400 })
        if (pendingEditFor(item.id)) return NextResponse.json({ error: 'This expense already has an edit waiting for approval. Revoke that one first, or wait for it to be decided.' }, { status: 409 })
        const pr2: Proposal = {
          id: uid('prop'), item, monthKey: monthKey2, proposedBy: actor, proposedByName: entName(doc, actor),
          approvers: ap.approvers, approved: [], mode: ap.mode, status: 'pending', createdAt: new Date().toISOString(), monthEdit: { op }, reason,
        }
        doc.proposals = [...(doc.proposals ?? []), pr2]
        audit('propose', label, { monthKey: monthKey2, reason, proposalId: pr2.id, parties: [actor, ...ap.approvers] })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, proposed: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
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
        return NextResponse.json({ ok: true, revoked: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
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
          applyTemplateOp(doc, section, op, item)
          audit('apply', label, { reason: reason || undefined, personal: !isSuper, parties: !isSuper && actor ? [actor] : undefined })
          await writeDoc(doc)
          return NextResponse.json({ ok: true, applied: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
        }
        if (!actor) return NextResponse.json({ error: 'No entity' }, { status: 400 })
        const { approvers, mode } = approversFor(item, actor, doc.entities)
        if (approvers.length === 0) {
          applyTemplateOp(doc, section, op, item)
          audit('apply', label, { reason: reason || undefined, personal: !isSuper, parties: !isSuper && actor ? [actor] : undefined })
          await writeDoc(doc)
          return NextResponse.json({ ok: true, applied: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
        }
        if (op !== 'add' && !reason) return NextResponse.json({ error: 'Please give a reason for this change so the other person can review it.' }, { status: 400 })
        if (op !== 'add' && pendingEditFor(item.id)) return NextResponse.json({ error: 'This item already has a change waiting for approval. Revoke that one first.' }, { status: 409 })
        const pr: Proposal = {
          id: uid('prop'), item, monthKey: monthKey(), proposedBy: actor, proposedByName: entName(doc, actor),
          approvers, approved: [], mode, status: 'pending', createdAt: new Date().toISOString(), template: { section, op }, reason: reason || undefined,
        }
        doc.proposals = [...(doc.proposals ?? []), pr]
        audit('propose', label, { reason: reason || undefined, proposalId: pr.id, parties: [actor, ...approvers] })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, proposed: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
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
          return NextResponse.json({ ok: true, applied: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
        }
        if (!actor) return NextResponse.json({ error: 'No entity' }, { status: 400 })
        const approver = bt.approver
        if (!approver || approver === actor) return NextResponse.json({ error: 'Choose someone else to approve this change.' }, { status: 400 })
        const reason = (bt.reason || '').trim()
        if (!reason) return NextResponse.json({ error: 'Please give a reason for changing the common income.' }, { status: 400 })
        const item: Item = { id: uid('cinc'), name: 'Common account income', amount, kind: 'oneoff', paidBy: 'common', alloc: { mode: 'single', who: 'common' } }
        const pr: Proposal = {
          id: uid('prop'), item, monthKey: mk, proposedBy: actor, proposedByName: entName(doc, actor),
          approvers: [approver], approved: [], mode: 'any', status: 'pending', createdAt: new Date().toISOString(),
          incomeEdit: { monthKey: mk, amount }, reason,
        }
        doc.proposals = [...(doc.proposals ?? []), pr]
        audit('propose', `Common income → ${amount}`, { monthKey: mk, reason, proposalId: pr.id, parties: [actor, approver] })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, proposed: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
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
        return NextResponse.json({ ok: true, applied: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
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
        return NextResponse.json({ ok: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
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
        return NextResponse.json({ ok: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
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
        return NextResponse.json({ ok: true, carried: carry.length, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
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
        return NextResponse.json({ ok: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
      }

      case 'removeReminder': {
        const id = (body as unknown as { id?: string }).id
        doc.reminders = (doc.reminders ?? []).filter(r => r.id !== id)
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
      }

      case 'resolveReminder': {
        const bt = body as unknown as { id?: string; monthKey?: string; proofKey?: string }
        const mk = bt.monthKey || monthKey()
        doc.reminders = (doc.reminders ?? []).map(r => r.id === bt.id
          ? { ...r, done: { ...(r.done ?? {}), [mk]: { proofKey: bt.proofKey || '', at: new Date().toISOString(), by: actorName } } }
          : r)
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
      }

      case 'unresolveReminder': {
        const bt = body as unknown as { id?: string; monthKey?: string }
        const mk = bt.monthKey || monthKey()
        doc.reminders = (doc.reminders ?? []).map(r => { if (r.id === bt.id && r.done) { const d = { ...r.done }; delete d[mk]; return { ...r, done: d } } return r })
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
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
        return NextResponse.json({ ok: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Action failed' }, { status: 500 })
  }
}
