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
import { migrate, approversFor, isPersonalTo, commitProposalItem, materialise, uid,
         type FinanceDoc, type Item, type Proposal, type SavingItem, type EntityBudget } from '@/lib/finance-data'
import { readRaw, writeDoc, viewFor } from '../route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const entName = (doc: FinanceDoc, id: string | null) => (id ? doc.entities.find(e => e.id === id)?.name : null) ?? 'Super'
const addToMonth = (doc: FinanceDoc, monthKey: string, it: Item) => {
  const m = doc.months[monthKey] ?? materialise(doc.template, monthKey)
  m.items = [...m.items, { ...it, src: 'manual' as const }]
  doc.months[monthKey] = m
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

  try {
    switch (body.action) {
      case 'propose': {
        const item = body.item, monthKey = body.monthKey
        if (!item || !monthKey) return NextResponse.json({ error: 'Missing item' }, { status: 400 })
        item.id = item.id || uid('one')
        // Super, or an expense that is purely the caller's own, is added straight away.
        if (isSuper || (actor && isPersonalTo(item, actor, doc.entities))) {
          addToMonth(doc, monthKey, item)
          await writeDoc(doc)
          return NextResponse.json({ ok: true, added: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
        }
        if (!actor) return NextResponse.json({ error: 'No entity' }, { status: 400 })
        const { approvers, mode } = approversFor(item, actor, doc.entities)
        if (approvers.length === 0) {
          addToMonth(doc, monthKey, item)
          await writeDoc(doc)
          return NextResponse.json({ ok: true, added: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
        }
        const pr: Proposal = {
          id: uid('prop'), item, monthKey, proposedBy: actor, proposedByName: entName(doc, actor),
          approvers, approved: [], mode, status: 'pending', createdAt: new Date().toISOString(),
        }
        doc.proposals = [...(doc.proposals ?? []), pr]
        await writeDoc(doc)
        return NextResponse.json({ ok: true, proposed: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
      }

      case 'accept':
      case 'decline': {
        const pr = (doc.proposals ?? []).find(p => p.id === body.id)
        if (!pr) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        const canAct = isSuper || (actor && pr.approvers.includes(actor))
        if (!canAct) return NextResponse.json({ error: 'Not yours to decide' }, { status: 403 })
        if (body.action === 'decline') {
          pr.status = 'declined'
          doc.proposals = doc.proposals.filter(p => p.id !== pr.id)
        } else {
          if (actor && !pr.approved.includes(actor)) pr.approved.push(actor)
          const done = isSuper || pr.mode === 'any' || pr.approvers.every(a => pr.approved.includes(a))
          if (done) {
            commitProposalItem(doc, pr)
            doc.proposals = doc.proposals.filter(p => p.id !== pr.id)
          }
        }
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
      }

      case 'setSavings': {
        const rows = (body.savings ?? [])
        const who = actor ?? 'blamba'
        const mine = rows.map(r => ({ ...r, entity: isSuper ? r.entity : who }))
        doc.savings = isSuper ? mine : [...doc.savings.filter(s => s.entity !== who), ...mine]
        await writeDoc(doc)
        return NextResponse.json({ ok: true, doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
      }

      case 'setBudget': {
        if (!body.budget) return NextResponse.json({ error: 'No budget' }, { status: 400 })
        const who = actor ?? 'blamba'
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

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Action failed' }, { status: 500 })
  }
}
