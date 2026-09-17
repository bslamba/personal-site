'use client'

// ============================================================
// components/vault/finance-dashboard.tsx  (v2)
//
// Finance dashboard: entities, flexible splits, month sub-tabs
// (Common / EMI / Personal), a who-owes-whom settlement, savings,
// an entities manager, and receipt capture. Loads/saves one JSON
// doc via /api/vault/finance (debounced autosave). Charts are
// hand-drawn SVG — no chart dependency.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2, Loader2, Check,
  CalendarDays, Pencil, X, Camera, Users, PiggyBank, Wallet, SlidersHorizontal,
  Equal, Target, BellRing, ShieldCheck, Upload, FileSpreadsheet, KeyRound, Tag as TagIcon, Scale, WalletCards,
} from 'lucide-react'
import {
  type FinanceDoc, type MonthData, type Item, type IncomeItem, type Entity,
  type SavingItem, type Alloc, type Bucket, type Template, type Category,
  type EntityBudget, type PlannedItem, type Proposal,
  seedDoc, uid, monthKey, materialise, monthView, totals, byCategory, shares, applyTemplateToMonth,
  putMonthOverride, deleteMonthTemplate, setMonthPaid,
  classify, INR, monthLabel, entName, entColor, ENTITY_COLORS,
  emptyBudget, categoryOf, detectCategory, isPersonalTo,
  computeSettlement, type SettleTransfer,
  type Envelope, envelopeShares, HOUSEHOLD, itemInEnvelope, visibleEnvelopes, bearerShares,
} from '@/lib/finance-data'
import { parseStatement, type StatementRow } from '@/lib/statement'
import VaultLogout from '@/components/vault/logout-button'
import IdleLogout from '@/components/vault/idle-logout'

const CAT_COLORS: Record<string, string> = {
  'Loans & EMIs': '#6d4bd8', 'Home & Utilities': '#4b7bec', 'Food & Groceries': '#1f9d6b',
  'Vehicles & Travel': '#e8963a', 'Insurance & Taxes': '#b0479a', 'Subscriptions': '#5bc0d0', 'Other': '#9b93b8',
}
const PALETTE = ['#6d4bd8', '#4b7bec', '#1f9d6b', '#e8963a', '#b0479a', '#5bc0d0', '#9b93b8', '#e2445c']
const num = (v: string) => { const n = parseFloat(v.replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0 }

// ---------- charts ----------------------------------------------
function Donut({ data, size = 168 }: { data: { name: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = size / 2, cx = r, cy = r, stroke = size * 0.16, rad = r - stroke / 2
  let a = -Math.PI / 2
  const arcs = data.map(d => {
    const frac = total > 0 ? d.value / total : 0
    const a2 = a + frac * Math.PI * 2, large = frac > 0.5 ? 1 : 0
    const x1 = cx + rad * Math.cos(a), y1 = cy + rad * Math.sin(a)
    const x2 = cx + rad * Math.cos(a2), y2 = cy + rad * Math.sin(a2)
    a = a2
    return { d: `M ${x1} ${y1} A ${rad} ${rad} 0 ${large} 1 ${x2} ${y2}`, color: d.color, frac }
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
      <circle cx={cx} cy={cy} r={rad} fill="none" stroke="rgba(120,99,190,0.12)" strokeWidth={stroke} />
      {arcs.map((arc, i) => arc.frac > 0 ? <path key={i} d={arc.d} fill="none" stroke={arc.color} strokeWidth={stroke} strokeLinecap="round" /> : null)}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={size * 0.1} fontWeight={800} fill="#241b40">{INR(total)}</text>
      <text x={cx} y={cy + size * 0.11} textAnchor="middle" fontSize={size * 0.07} fill="#8b81ad">total</text>
    </svg>
  )
}
function Legend({ items }: { items: { name: string; color: string; value: number }[] }) {
  return (
    <div className="vg-legend" style={{ flexDirection: 'column', gap: '0.4rem' }}>
      {items.map(it => (
        <span key={it.name} style={{ justifyContent: 'space-between', width: '100%' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><i className="vg-dot" style={{ background: it.color }} /> {it.name}</span>
          <b style={{ fontVariantNumeric: 'tabular-nums', color: '#241b40' }}>{INR(it.value)}</b>
        </span>
      ))}
    </div>
  )
}
function StackBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const t = parts.reduce((s, p) => s + p.value, 0) || 1
  return (
    <div>
      <div style={{ display: 'flex', height: 26, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.6)' }}>
        {parts.map((p, i) => <div key={i} style={{ width: `${(p.value / t) * 100}%`, background: p.color }} />)}
      </div>
      <div className="vg-legend">
        {parts.map((p, i) => <span key={i}><i className="vg-dot" style={{ background: p.color }} /> {p.label} {INR(p.value)}</span>)}
      </div>
    </div>
  )
}

// ---------- expense editor modal --------------------------------
function shareSummary(it: Item, entities: Entity[]): string {
  if (it.alloc.mode === 'single') return `100% ${entName(entities, it.alloc.who)}`
  const parts = Object.entries(shares(it)).filter(([, f]) => f > 0.001).map(([id, f]) => `${entName(entities, id)} ${Math.round(f * 100)}%`)
  return parts.join(' · ') || '—'
}

// Each entity's share of an item, as an amount (used in the expense table's
// "Shared" column and to build the per-entity totals footer).
function shareBreakdown(it: Item, entities: Entity[]): { id: string; name: string; color: string; pct: number; amount: number }[] {
  const sh = shares(it)
  return Object.entries(sh).filter(([, f]) => f > 0.001)
    .map(([id, f]) => ({ id, name: entName(entities, id), color: entColor(entities, id), pct: Math.round(f * 100), amount: (it.amount || 0) * f }))
}

// Renders one item's per-entity split with the amount each entity bears.
function ShareCell({ it, entities }: { it: Item; entities: Entity[] }) {
  const parts = shareBreakdown(it, entities)
  if (parts.length === 0) return <span className="vg-muted">—</span>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
      {parts.map(p => (
        <span key={p.id} className="vg-chip" style={{ background: p.color + '1c', color: p.color, fontSize: '0.72rem', fontWeight: 600 }}>
          {p.name} {INR(p.amount)}{parts.length > 1 ? <span style={{ opacity: 0.7, fontWeight: 500 }}> · {p.pct}%</span> : null}
        </span>
      ))}
    </div>
  )
}


// The entities that bear a share across a set of rows, in entity order. A
// common-paid expense is borne by the common pool (Lamba Household), so it adds
// the 'common' column rather than splitting onto individuals.
function shareColumns(rows: Item[], entities: Entity[]): string[] {
  const seen = new Set<string>()
  for (const it of rows) { const bs = bearerShares(it); for (const id of Object.keys(bs)) if ((bs[id] ?? 0) > 0.001) seen.add(id) }
  return entities.filter(e => seen.has(e.id)).map(e => e.id)
}
// Column label: the common pool shows as "Lamba Household".
const colLabel = (entities: Entity[], id: string) => (id === 'common' ? 'Lamba Household' : entName(entities, id))

// One expense table with a per-person sub-column under a "Shared" group header
// (aligned straight, each person's amount in its own column) and a totals row
// that puts each person's combined share directly beneath their column.
// Works for the super view and, when `member` is set, the member view (own
// items get a paid toggle and edit/remove; shared items are proposed).
function ExpenseTable({ rows, entities, shareCols, onEdit, onDelete, onTogglePaid, member, emptyLabel }: {
  rows: Item[]; entities: Entity[]; shareCols: string[]
  onEdit: (it: Item) => void; onDelete: (it: Item) => void; onTogglePaid: (it: Item, v: boolean) => void
  member?: { entityId: string; lockedIds: Set<string | undefined> }
  emptyLabel: string
}) {
  const cols = shareCols.length ? shareCols : []
  const amtFor = (it: Item, id: string) => (bearerShares(it)[id] ?? 0) * (it.amount || 0)
  const colTotal = (id: string) => rows.reduce((s, it) => s + amtFor(it, id), 0)
  const grand = rows.reduce((s, it) => s + (it.amount || 0), 0)
  const nCols = 3 + cols.length + 2
  const minW = 420 + cols.length * 90
  return (
    <div className="vg-tablewrap">
      <table className="vg-table" style={{ minWidth: minW }}>
        <thead>
          <tr>
            <th rowSpan={2}>Item</th>
            <th rowSpan={2}>Paid by</th>
            {cols.length > 0 && <th colSpan={cols.length} style={{ textAlign: 'center', borderBottom: '1px solid rgba(109,75,216,0.15)' }}>Borne by — each share&rsquo;s amount</th>}
            <th rowSpan={2} className="num">Amount</th>
            <th rowSpan={2} style={{ width: 42 }}>Paid</th>
            <th rowSpan={2} style={{ width: 76 }}></th>
          </tr>
          <tr>{cols.map(id => <th key={id} className="num" style={{ color: entColor(entities, id), fontSize: '0.76rem' }}>{colLabel(entities, id)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(it => {
            const mine = member ? isPersonalTo(it, member.entityId, entities) : true
            const locked = member ? member.lockedIds.has(it.id) : false
            return (
              <tr key={it.id} className={it.paid ? 'vg-row-paid' : ''}>
                <td><span className="vg-nm" style={{ fontWeight: 600 }}>{it.name || <span className="vg-muted">Untitled</span>}</span>
                  {it.receiptKey && <span className="vg-chip" style={{ marginLeft: 6 }}>receipt</span>}
                  {member && !mine && <span className="vg-chip" style={{ marginLeft: 6 }}>shared</span>}
                  {locked && <span className="vg-chip" style={{ marginLeft: 6, background: 'rgba(224,112,60,0.14)', color: '#c0398b' }}>under review</span>}
                </td>
                <td><span className="vg-chip" style={{ background: entColor(entities, it.paidBy) + '22', color: entColor(entities, it.paidBy) }}>{entName(entities, it.paidBy)}</span></td>
                {cols.map(id => { const a = amtFor(it, id); return <td key={id} className="num" style={{ color: a > 0.5 ? entColor(entities, id) : 'var(--vg-muted)', fontVariantNumeric: 'tabular-nums' }}>{a > 0.5 ? INR(a) : '—'}</td> })}
                <td className="num" style={{ fontWeight: 600 }}>{INR(it.amount)}</td>
                <td style={{ textAlign: 'center' }}>{(!member || mine) ? <input type="checkbox" checked={!!it.paid} onChange={e => onTogglePaid(it, e.target.checked)} /> : <span className="vg-muted">—</span>}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="vg-icobtn" disabled={locked} title={member ? (locked ? 'An edit is already waiting for approval' : mine ? 'Edit' : 'Propose a change (needs approval)') : 'Edit'} onClick={() => onEdit(it)}><Pencil className="h-4 w-4" /></button>
                    <button className="vg-icobtn" disabled={locked} title={member ? (locked ? 'An edit is already waiting for approval' : mine ? 'Remove' : 'Propose removal (needs approval)') : 'Delete'} onClick={() => onDelete(it)}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            )
          })}
          {rows.length === 0 && <tr><td colSpan={nCols} className="vg-muted" style={{ textAlign: 'center', padding: '1.2rem' }}>{emptyLabel}</td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ borderTop: '2px solid rgba(109,75,216,0.25)' }}>
              <td colSpan={2} style={{ fontWeight: 700, paddingTop: '0.6rem' }}>Total</td>
              {cols.map(id => <td key={id} className="num" style={{ fontWeight: 700, color: entColor(entities, id), paddingTop: '0.6rem' }}>{INR(colTotal(id))}</td>)}
              <td className="num" style={{ fontWeight: 800, paddingTop: '0.6rem' }}>{INR(grand)}</td>
              <td colSpan={2} style={{ paddingTop: '0.6rem' }}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function ExpenseEditor({ item, entities, categories, onAddCategory, onSave, onClose, onDelete, allowNewCategory = true, envelopes = [] }: {
  item: Item; entities: Entity[]; categories: Category[]; onAddCategory: (name: string, color: string) => void
  onSave: (it: Item) => void; onClose: () => void; onDelete?: () => void; allowNewCategory?: boolean
  envelopes?: Envelope[]
}) {
  const [d, setD] = useState<Item>(() => structuredClone(item))
  const pickEnvelope = (envId: string) => {
    const env = envelopes.find(e => e.id === envId)
    const sh = envelopeShares(env)
    setD(x => ({ ...x, envelope: envId, alloc: Object.keys(sh).length ? { mode: 'split', shares: sh } : x.alloc }))
  }
  const [custom, setCustom] = useState(false)
  const [custName, setCustName] = useState('')
  const [custColor, setCustColor] = useState('#6d4bd8')
  const isEmi = d.kind === 'emi'
  const isAnnual = d.kind === 'annual'
  const payers = entities.filter(e => e.canPay)
  const persons = entities.filter(e => e.kind === 'person')

  const set = (patch: Partial<Item>) => setD(x => ({ ...x, ...patch }))
  const splitShares: Record<string, number> = d.alloc.mode === 'split' ? d.alloc.shares : {}
  const setMode = (mode: 'split' | 'single') => {
    if (mode === 'single') set({ alloc: { mode: 'single', who: d.paidBy } })
    else set({ alloc: { mode: 'split', shares: Object.fromEntries(persons.map(p => [p.id, 1 / persons.length])) } })
  }
  const setShare = (id: string, pct: number) => {
    const shares2 = { ...splitShares, [id]: pct / 100 }
    set({ alloc: { mode: 'split', shares: shares2 } })
  }
  const equalPersons = () => set({ alloc: { mode: 'split', shares: Object.fromEntries(persons.map(p => [p.id, 1 / persons.length])) } })

  return (
    <div className="vg-lb" onClick={onClose}>
      <div className="vg-card vg-pad" style={{ width: 'min(460px, 96vw)', maxHeight: '92vh', overflowY: 'auto', background: 'var(--vg-glass-2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <p className="vg-sec" style={{ margin: 0 }}>{isEmi ? 'EMI / Loan' : isAnnual ? 'Yearly item' : 'Expense'}</p>
          <button className="vg-icobtn" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <label className="vg-lbl">What is it</label>
        <input className="vg-input" value={d.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Zomato dinner" />

        <div style={{ marginTop: '0.6rem' }}>
          <label className="vg-lbl">Category</label>
          {!custom ? (
            <select className="vg-select" value={d.category ?? ''} onChange={e => { if (e.target.value === '__new') setCustom(true); else set({ category: e.target.value || undefined }) }}>
              <option value="">Auto (by name)</option>
              {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              {allowNewCategory && <option value="__new">＋ New category…</option>}
            </select>
          ) : (
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input type="color" value={custColor} onChange={e => setCustColor(e.target.value)} style={{ width: 34, height: 34, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} />
              <input className="vg-input" placeholder="New category name" value={custName} onChange={e => setCustName(e.target.value)} />
              <button className="vg-btn vg-btn-primary" onClick={() => { const n = custName.trim(); if (n) { onAddCategory(n, custColor); set({ category: n }) } setCustom(false); setCustName('') }}>Add</button>
              <button className="vg-btn" onClick={() => setCustom(false)}>×</button>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.6rem' }}>
          <div>
            <label className="vg-lbl">{isAnnual ? 'Amount / year' : isEmi ? 'Monthly EMI' : 'Amount'}</label>
            <input className="vg-input vg-num" inputMode="numeric" value={String(d.amount)} onChange={e => set({ amount: num(e.target.value) })} />
          </div>
          <div>
            <label className="vg-lbl">Who paid</label>
            <select className="vg-select" value={d.paidBy} onChange={e => set({ paidBy: e.target.value })}>
              {payers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {isEmi && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.6rem' }}>
            <div><label className="vg-lbl">Start</label><input type="date" className="vg-input" value={d.startDate ?? ''} onChange={e => set({ startDate: e.target.value || null })} /></div>
            <div><label className="vg-lbl">End</label><input type="date" className="vg-input" value={d.endDate ?? ''} onChange={e => set({ endDate: e.target.value || null })} /></div>
          </div>
        )}
        {isAnnual && (
          <div style={{ marginTop: '0.6rem' }}>
            <label className="vg-lbl">Appears in month</label>
            <input type="month" className="vg-input" value={d.dueDate ? d.dueDate.slice(0, 7) : ''} onChange={e => set({ dueDate: e.target.value ? e.target.value + '-15' : null })} />
            <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.3rem' }}>This yearly charge shows up automatically in that month&rsquo;s expenses (each year). Change the month to move it.</p>
          </div>
        )}
        {!isEmi && !isAnnual && (
          <div style={{ marginTop: '0.6rem' }}>
            <label className="vg-lbl">Date <span className="vg-muted" style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
            <input type="date" className="vg-input" value={d.date ?? ''} onChange={e => set({ date: e.target.value || null })} />
          </div>
        )}

        {envelopes.length > 0 && (
          <div style={{ marginTop: '0.9rem' }}>
            <label className="vg-lbl">Envelope</label>
            <select className="vg-select" value={d.envelope ?? HOUSEHOLD} onChange={e => pickEnvelope(e.target.value)}>
              {envelopes.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}
            </select>
            <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.3rem' }}>Picking an envelope splits it equally among its members — you can still adjust the % below.</p>
          </div>
        )}

        <div style={{ marginTop: '0.9rem' }}>
          <label className="vg-lbl">How is it shared?</label>
          <div className="vg-tabs" style={{ marginTop: '0.3rem' }}>
            <button className="vg-tab" data-on={d.alloc.mode === 'split'} onClick={() => setMode('split')}>Split</button>
            <button className="vg-tab" data-on={d.alloc.mode === 'single'} onClick={() => setMode('single')}>One person pays 100%</button>
          </div>
        </div>

        {d.alloc.mode === 'single' ? (
          <div style={{ marginTop: '0.6rem' }}>
            <label className="vg-lbl">Borne fully by</label>
            <select className="vg-select" value={d.alloc.who} onChange={e => set({ alloc: { mode: 'single', who: e.target.value } })}>
              {entities.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}
            </select>
            <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.3rem' }}>Not split with anyone — sits under Personal.</p>
          </div>
        ) : (
          <div style={{ marginTop: '0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="vg-lbl">Share (%)</label>
              <button className="vg-btn" onClick={equalPersons}><Equal className="h-3.5 w-3.5" /> Equal</button>
            </div>
            {entities.map(en => (
              <div key={en.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
                <span className="vg-dot" style={{ background: en.color }} />
                <span style={{ flex: 1, fontSize: '0.9rem' }}>{en.name}</span>
                <input className="vg-input vg-num" style={{ width: 76 }} inputMode="numeric"
                  value={Math.round((splitShares[en.id] ?? 0) * 100)} onChange={e => setShare(en.id, num(e.target.value))} />
              </div>
            ))}
            <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.35rem' }}>Percentages are normalised, so they need not add to exactly 100.</p>
          </div>
        )}

        <div style={{ marginTop: '0.9rem' }}>
          <label className="vg-lbl">Tag / event <span className="vg-muted" style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
          <input className="vg-input" value={(d.tags ?? []).join(', ')} placeholder="e.g. Ooty 2026, Anniversary"
            onChange={e => set({ tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} />
          <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.3rem' }}>Groups this expense under an event on the Tags page — separate from its category. Comma-separate for more than one.</p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', gap: '0.5rem' }}>
          {onDelete ? <button className="vg-btn" style={{ color: 'var(--vg-neg)' }} onClick={onDelete}><Trash2 className="h-4 w-4" /> Delete</button> : <span />}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="vg-btn" onClick={onClose}>Cancel</button>
            <button className="vg-btn vg-btn-primary" onClick={() => onSave(d)}><Check className="h-4 w-4" /> Done</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- helpers for creating / reading ----------------------
function firstPerson(entities: Entity[]): string {
  return (entities.find(e => e.kind === 'person') ?? entities[0])?.id ?? 'bhawneet'
}
function newItem(bucket: Bucket, entities: Entity[]): Item {
  const persons = entities.filter(e => e.kind === 'person')
  const equal: Alloc = { mode: 'split', shares: Object.fromEntries(persons.map(p => [p.id, 1 / (persons.length || 1)])) }
  if (bucket === 'emi') return { id: uid('emi'), name: '', amount: 0, kind: 'emi', paidBy: firstPerson(entities), alloc: equal, startDate: monthKey() + '-01', endDate: null, src: 'manual', envelope: HOUSEHOLD }
  if (bucket === 'personal') { const p = firstPerson(entities); return { id: uid('one'), name: '', amount: 0, kind: 'oneoff', paidBy: p, alloc: { mode: 'single', who: p }, src: 'manual', envelope: HOUSEHOLD } }
  return { id: uid('one'), name: '', amount: 0, kind: 'oneoff', paidBy: entities.find(e => e.kind === 'common')?.id ?? 'common', alloc: equal, src: 'manual', envelope: HOUSEHOLD }
}
function fileToB64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result).split(',')[1] ?? '')
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

// ---------- main ------------------------------------------------
type Tab = 'month' | 'settle' | 'year' | 'savings' | 'budget' | 'approvals' | 'import' | 'entities' | 'setup' | 'profile' | 'tags'
interface Editing { item: Item; commit: (it: Item) => void; remove?: () => void }

export default function FinanceDashboard() {
  const [doc, setDoc] = useState<FinanceDoc | null>(null)
  const [tab, setTab] = useState<Tab>('month')
  const [key, setKey] = useState<string>(monthKey())
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [setupDraft, setSetupDraft] = useState<Template | null>(null)
  const [me, setMe] = useState<{ role: 'super' | 'member'; entityId: string | null; username?: string; name?: string; firstName?: string; lastName?: string; email?: string; avatar?: string } | null>(null)
  const firstLoad = useRef(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/vault/finance')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then(d => { if (live) { setDoc(d.doc as FinanceDoc); setMe(d.me ?? { role: 'super', entityId: null }) } })
      .catch(() => { if (live) { setDoc(seedDoc()); setMe({ role: 'super', entityId: null }) } })
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (!doc) return
    if (firstLoad.current) { firstLoad.current = false; return }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch('/api/vault/finance', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc }) })
        setSaveState('saved'); setTimeout(() => setSaveState('idle'), 1400)
      } catch { setSaveState('idle') }
    }, 700)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [doc])

  const patchDoc = useCallback((fn: (d: FinanceDoc) => FinanceDoc) => setDoc(d => (d ? fn(structuredClone(d) as FinanceDoc) : d)), [])
  const patchMonth = useCallback((k: string, fn: (m: MonthData) => MonthData) => {
    // A stored month holds only this month's OVERRIDES, manual items, income,
    // deletions and note — never a full snapshot — so Budget changes keep
    // flowing through monthView for anything not deliberately edited here.
    setDoc(d => { if (!d) return d; const nd = structuredClone(d) as FinanceDoc; nd.months[k] = fn(nd.months[k] ?? { items: [], income: [], note: '' }); return nd })
  }, [])

  const addCategory = useCallback((name: string, color: string) => patchDoc(d => { if (!d.categories.find(c => c.name === name)) d.categories = [...d.categories, { name, color }]; return d }), [patchDoc])
  const runAction = useCallback(async (payload: Record<string, unknown>) => {
    try { const r = await fetch('/api/vault/finance/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const d = await r.json().catch(() => ({})); if (d.doc) setDoc(d.doc as FinanceDoc); return d } catch { return null }
  }, [])

  if (!doc || !me) return <Shell><p className="vg-empty"><Loader2 className="h-5 w-5 vg-spin" style={{ display: 'inline' }} /> Loading…</p></Shell>

  if (me.role === 'member') return <MemberDashboard initialDoc={doc} entityId={me.entityId ?? ''} profile={me} />

  const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
    { id: 'month', label: 'This month', icon: CalendarDays },
    { id: 'settle', label: 'Settlement', icon: Scale },
    { id: 'year', label: 'Year', icon: Wallet },
    { id: 'tags', label: 'Tags', icon: TagIcon },
    { id: 'import', label: 'Import', icon: FileSpreadsheet },
    { id: 'approvals', label: `Approvals${(doc.proposals?.length ? ' (' + doc.proposals.length + ')' : '')}`, icon: BellRing },
    { id: 'entities', label: 'Entities', icon: Users },
    { id: 'setup', label: 'Budget', icon: Target },
  ]

  const setupTemplate = setupDraft ?? doc.template
  const setupDirty = setupDraft !== null && JSON.stringify(setupDraft) !== JSON.stringify(doc.template)
  const setSetupTemplate = (fn: (t: Template) => Template) => setSetupDraft(prev => fn(structuredClone(prev ?? doc.template) as Template))
  const saveSetup = (scope: ApplyScope) => {
    const draft = structuredClone(setupDraft ?? doc.template) as Template
    patchDoc(d => { d.template = draft; applyScopeToDoc(d, scope); return d })
    setSetupDraft(null)
  }

  return (
    <Shell saveState={saveState} me={me} tabs={TABS} activeTab={tab} onTab={id => setTab(id as Tab)}>
      {tab === 'month' && <MonthTab doc={doc} k={key} setKey={setKey} patchMonth={patchMonth} openEditor={setEditing} action={runAction} />}
      {tab === 'settle' && <SettlementTab doc={doc} me={me} k={key} setKey={setKey} action={runAction} />}
      {tab === 'year' && <YearTab doc={doc} year={year} setYear={setYear} openMonth={k => { setKey(k); setTab('month') }} />}
      {tab === 'tags' && <TagsTab doc={doc} />}
      {tab === 'savings' && <SavingsTab doc={doc} patchDoc={patchDoc} />}
      {tab === 'budget' && <BudgetTab doc={doc} me={{ role: 'super', entityId: null }} onSaveBudget={(who, b) => patchDoc(d => { if (who === 'family') d.budgets.family = b; else d.budgets.byEntity[who] = b; return d })} />}
      {tab === 'approvals' && <ApprovalsTab doc={doc} me={me} onDecide={(id, kind) => runAction({ action: kind, id })} onRevoke={id => runAction({ action: 'revoke', id })} />}
      {tab === 'import' && <ImportTab doc={doc} me={{ role: 'super', entityId: null }} onImport={(rows, owner) => runAction({ action: 'importRows', rows, owner })} />}
      {tab === 'entities' && <EntitiesTab doc={doc} patchDoc={patchDoc} />}
      {tab === 'setup' && <SetupTab entities={doc.entities} draft={setupTemplate} setDraft={setSetupTemplate} dirty={setupDirty} onSave={saveSetup} onDiscard={() => setSetupDraft(null)} currentMonth={monthKey()} openEditor={setEditing} envelopes={doc.envelopes ?? []} />}
      {tab === 'profile' && <ProfileTab me={me} onSaved={p => setMe(m => (m ? { ...m, ...p } : m))} />}

      {editing && (
        <ExpenseEditor
          item={editing.item} entities={doc.entities} envelopes={doc.envelopes ?? []}
          categories={doc.categories} onAddCategory={addCategory}
          onSave={it => { editing.commit(it); setEditing(null) }}
          onClose={() => setEditing(null)}
          onDelete={editing.remove ? () => { editing.remove!(); setEditing(null) } : undefined}
        />
      )}
    </Shell>
  )
}

type MeLite = { role: 'super' | 'member'; username?: string; firstName?: string; lastName?: string; name?: string; avatar?: string }

function Avatar({ me, size = 30 }: { me?: MeLite; size?: number }) {
  const initial = (me?.firstName || me?.name || me?.username || '?').trim().charAt(0).toUpperCase()
  if (me?.avatar) return <img src={me.avatar} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: 'var(--vg-accent)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.42, fontWeight: 700 }}>{initial}</span>
  )
}

interface ShellTab { id: string; label: string; icon: typeof Wallet }
function Shell({ children, saveState, me, tabs, activeTab, onTab }: {
  children: React.ReactNode
  saveState?: 'idle' | 'saving' | 'saved'
  me?: MeLite
  tabs?: ShellTab[]
  activeTab?: string
  onTab?: (id: string) => void
}) {
  const firstName = (me?.firstName || me?.name || me?.username || '').split(' ')[0]
  return (
    <div className="vg">
      <IdleLogout />
      <div className="vg-wrap">
        <div className="vg-appbar">
          <div className="vg-appbar-left">
            {me?.role === 'super' && <Link href="/vault" className="vg-back"><ArrowLeft className="h-4 w-4" /> Vault</Link>}
          </div>

          {tabs && tabs.length > 0 && (
            <nav className="vg-navtabs" aria-label="Sections">
              {tabs.map(t => { const I = t.icon; return (
                <button key={t.id} className="vg-navtab" data-on={activeTab === t.id} onClick={() => onTab?.(t.id)}>
                  <I className="h-3.5 w-3.5" style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />{t.label}
                </button>) })}
            </nav>
          )}

          <div className="vg-appbar-right">
            <span style={{ minWidth: 20, textAlign: 'right' }}>
              {saveState === 'saving' && <Loader2 className="h-3.5 w-3.5 vg-spin" style={{ display: 'inline', color: 'var(--vg-muted)' }} />}
              {saveState === 'saved' && <Check className="h-3.5 w-3.5" style={{ display: 'inline', color: 'var(--vg-pos, #16a34a)' }} />}
            </span>
            {me && (
              <button className="vg-me" onClick={() => onTab?.('profile')} title={firstName ? `${firstName} — your profile` : 'Your profile'} data-on={activeTab === 'profile'}>
                <Avatar me={me} />
              </button>
            )}
            <VaultLogout />
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---------- Change password (email OTP) -------------------------
function ChangePasswordModal({ username, onClose }: { username: string; onClose: () => void }) {
  const [step, setStep] = useState<'request' | 'verify'>('request')
  const [otp, setOtp] = useState('')
  const [newPass, setNewPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function sendCode() {
    setBusy(true); setErr(null); setNotice(null)
    try {
      const r = await fetch('/api/vault/otp/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error ?? 'Could not send a code') } else { setNotice(`Code sent to ${d.emailHint ?? 'your email'}. It expires in 10 minutes.`); setStep('verify') }
    } catch { setErr('Could not send a code') }
    setBusy(false)
  }

  async function save() {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/vault/password/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, otp, newPassword: newPass }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error ?? 'Reset failed') } else { setDone(true) }
    } catch { setErr('Reset failed') }
    setBusy(false)
  }

  return (
    <div className="vg-lb" onClick={onClose}>
      <div className="vg-card vg-pad" onClick={e => e.stopPropagation()} style={{ width: 'min(420px, 96vw)', background: 'var(--vg-glass-2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <p className="vg-sec" style={{ margin: 0 }}><KeyRound className="h-4 w-4" style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} /> Change password</p>
          <button className="vg-icobtn" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {done ? (
          <>
            <p className="vg-pos" style={{ fontSize: '0.9rem' }}><Check className="h-4 w-4" style={{ display: 'inline', verticalAlign: '-2px' }} /> Password changed.</p>
            <div style={{ marginTop: '1rem', textAlign: 'right' }}><button className="vg-btn" onClick={onClose}>Done</button></div>
          </>
        ) : (
          <>
            <p className="vg-muted" style={{ fontSize: '0.85rem', marginBottom: '0.8rem' }}>
              We verify by emailing a one-time code to <strong>{username}</strong>&rsquo;s address, then you set a new password.
            </p>
            {notice && <p className="vg-pos" style={{ fontSize: '0.82rem', marginBottom: '0.7rem' }}>{notice}</p>}
            {step === 'request' ? (
              <button className="vg-btn-primary" onClick={sendCode} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 vg-spin" style={{ display: 'inline' }} /> : null} Email me a code
              </button>
            ) : (
              <div style={{ display: 'grid', gap: '0.7rem' }}>
                <div>
                  <label className="vg-lbl">6-digit code</label>
                  <input className="vg-input" inputMode="numeric" maxLength={6} value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="000000" style={{ letterSpacing: '0.3em' }} />
                </div>
                <div>
                  <label className="vg-lbl">New password</label>
                  <input className="vg-input" type="password" minLength={6} value={newPass}
                    onChange={e => setNewPass(e.target.value)} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button className="vg-btn-ghost" onClick={sendCode} disabled={busy}>Resend code</button>
                  <button className="vg-btn-primary" onClick={save} disabled={busy || otp.length < 6 || newPass.length < 6}>
                    {busy ? <Loader2 className="h-4 w-4 vg-spin" style={{ display: 'inline' }} /> : null} Set new password
                  </button>
                </div>
              </div>
            )}
            {err && <p className="vg-neg" style={{ fontSize: '0.82rem', marginTop: '0.7rem' }}>{err}</p>}
          </>
        )}
      </div>
    </div>
  )
}

// ---------- Reason prompt (for shared edits) --------------------
function ReasonModal({ title, hint, onConfirm, onClose }: { title: string; hint?: string; onConfirm: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('')
  return (
    <div className="vg-lb" onClick={onClose}>
      <div className="vg-card vg-pad" onClick={e => e.stopPropagation()} style={{ width: 'min(440px, 96vw)', background: 'var(--vg-glass-2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
          <p className="vg-sec" style={{ margin: 0 }}>{title}</p>
          <button className="vg-icobtn" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <p className="vg-muted" style={{ fontSize: '0.83rem', marginTop: 0 }}>{hint ?? 'The other person sees this reason when they review your request. It’s logged with a timestamp.'}</p>
        <textarea className="vg-input" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Amount was wrong — actual bill is ₹4,871" style={{ resize: 'vertical' }} autoFocus />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '0.8rem' }}>
          <button className="vg-btn" onClick={onClose}>Cancel</button>
          <button className="vg-btn vg-btn-primary" disabled={reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}><Check className="h-4 w-4" /> Send for approval</button>
        </div>
      </div>
    </div>
  )
}

// ---------- Profile tab -----------------------------------------
async function fileToAvatar(file: File): Promise<string> {
  const dataUrl: string = await new Promise((res, rej) => {
    const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(file)
  })
  const img = document.createElement('img')
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl })
  const size = 256
  const c = document.createElement('canvas'); c.width = size; c.height = size
  const ctx = c.getContext('2d')!
  const scale = Math.max(size / img.width, size / img.height)
  const w = img.width * scale, h = img.height * scale
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
  return c.toDataURL('image/jpeg', 0.82)
}

function ProfileTab({ me, onSaved }: { me?: MeLite & { email?: string }; onSaved: (patch: Partial<MeLite & { email?: string }>) => void }) {
  const [firstName, setFirstName] = useState(me?.firstName ?? '')
  const [lastName, setLastName] = useState(me?.lastName ?? '')
  const [email, setEmail] = useState(me?.email ?? '')
  const [avatar, setAvatar] = useState<string | undefined>(me?.avatar)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showPw, setShowPw] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function pickImage(f?: File) {
    if (!f) return
    setErr(null)
    try {
      const a = await fileToAvatar(f)
      if (a.length > 300_000) { setErr('That image is too detailed — try a smaller one.'); return }
      setAvatar(a)
    } catch { setErr('Could not read that image.') }
  }

  async function save() {
    setErr(null); setMsg(null)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Enter a valid email address.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/vault/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName, lastName, email, avatar: avatar ?? '' }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error ?? 'Could not save') }
      else {
        setMsg('Profile saved.')
        const name = [firstName, lastName].filter(Boolean).join(' ')
        onSaved({ firstName, lastName, email, avatar, name })
      }
    } catch { setErr('Could not save') }
    setBusy(false)
  }

  return (
    <div className="vg-card vg-pad" style={{ maxWidth: 560 }}>
      <p className="vg-sec"><Users className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} /> Your profile</p>
      <p className="vg-muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>Your name and picture show in the top bar. Your email is where password-reset codes are sent.</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1rem 0' }}>
        <Avatar me={{ role: 'member', firstName, name: firstName, avatar }} size={64} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => pickImage(e.target.files?.[0])} />
          <button className="vg-btn" onClick={() => fileRef.current?.click()}><Camera className="h-4 w-4" /> {avatar ? 'Change photo' : 'Add photo'}</button>
          {avatar && <button className="vg-btn-ghost" onClick={() => setAvatar(undefined)}>Remove</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gap: '0.7rem', gridTemplateColumns: '1fr 1fr' }}>
        <div><label className="vg-lbl">First name</label><input className="vg-input" value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
        <div><label className="vg-lbl">Last name</label><input className="vg-input" value={lastName} onChange={e => setLastName(e.target.value)} /></div>
      </div>
      <div style={{ marginTop: '0.7rem' }}>
        <label className="vg-lbl">Email</label>
        <input className="vg-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@email.com" />
      </div>

      {err && <p className="vg-neg" style={{ fontSize: '0.85rem', marginTop: '0.7rem' }}>{err}</p>}
      {msg && <p className="vg-pos" style={{ fontSize: '0.85rem', marginTop: '0.7rem' }}><Check className="h-4 w-4" style={{ display: 'inline', verticalAlign: '-2px' }} /> {msg}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.1rem', flexWrap: 'wrap', gap: 8 }}>
        <button className="vg-btn-ghost" onClick={() => setShowPw(true)}><KeyRound className="h-4 w-4" /> Change password</button>
        <button className="vg-btn-primary" onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 vg-spin" style={{ display: 'inline' }} /> : null} Save profile</button>
      </div>

      {showPw && me?.username && <ChangePasswordModal username={me.username} onClose={() => setShowPw(false)} />}
    </div>
  )
}

// ---------- Envelope pieces -------------------------------------
// The default dashboard option in the envelope dropdown.
const DASH = 'dashboard'

// A dropdown of the envelopes this viewer belongs to, with "My Dashboard"
// first. Sits to the right of the month navigation.
function EnvelopeSelect({ envelopes, value, onChange }: {
  envelopes: Envelope[]; value: string; onChange: (id: string) => void
}) {
  const ordered = [...envelopes].sort((a, b) => (a.system ? 0 : 1) - (b.system ? 0 : 1))
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <WalletCards className="h-4 w-4" style={{ color: 'var(--vg-accent)' }} />
      <select className="vg-select" value={value} onChange={e => onChange(e.target.value)} style={{ maxWidth: 240, fontWeight: 600 }} aria-label="View">
        <option value={DASH}>My Dashboard</option>
        {ordered.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}
      </select>
    </div>
  )
}

// A stack of per-envelope impact strips — used on "My Dashboard" so the viewer
// sees how each shared envelope affects them this month.
function EnvelopeImpactList({ envelopes, items, entities, viewer }: {
  envelopes: Envelope[]; items: Item[]; entities: Entity[]; viewer?: string | null
}) {
  const nonSys = envelopes.filter(e => !e.system && e.members.length >= 2)
  return <>{nonSys.map(env => {
    const its = items.filter(it => itemInEnvelope(it, env))
    if (its.length === 0) return null
    return <EnvelopeImpact key={env.id} items={its} entities={entities} env={env} viewer={viewer} />
  })}</>
}

// Per-envelope impact strip: what this envelope costs, each member's share,
// and who should pay whom to settle it. Shown inside This-month for the
// non-household (pair / group) envelopes.
function EnvelopeImpact({ items, entities, env, viewer }: {
  items: Item[]; entities: Entity[]; env: Envelope; viewer?: string | null
}) {
  const t = totals({ items, income: [], note: '' } as MonthData, entities)
  const total = items.reduce((s, it) => s + (it.amount || 0), 0)
  const members = env.members.map(id => ({ id, name: entName(entities, id), color: entColor(entities, id), value: t.byEntity[id] ?? 0 }))
  return (
    <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
      <p className="vg-sec" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 6 }}><Scale className="h-4 w-4" /> How “{env.name}” affects each of you</p>
      <div className="vg-kpis" style={{ marginBottom: '0.9rem' }}>
        <Kpi label="Envelope total" value={INR(total)} info="Everything assigned to this envelope this month, added up." />
        {members.map(m => (
          <Kpi key={m.id} label={`${m.name}'s share`} small value={INR(m.value)} info="This person's equal share of the envelope's costs." />
        ))}
      </div>
      {t.transfers.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {t.transfers.map((tr, i) => {
            const mine = viewer && (tr.from === viewer || tr.to === viewer)
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: 12, background: mine ? 'rgba(109,75,216,0.10)' : 'rgba(255,255,255,0.55)' }}>
                <span><b style={{ color: entColor(entities, tr.from) }}>{entName(entities, tr.from)}</b> <span className="vg-muted">pays</span> <b style={{ color: entColor(entities, tr.to) }}>{entName(entities, tr.to)}</b></span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{INR(tr.amount)}</b>
              </div>
            )
          })}
        </div>
      ) : <p className="vg-muted" style={{ margin: 0 }}>All square — nobody owes anyone in this envelope.</p>}
      <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.6rem' }}>Only money one person paid from their own account creates a debt here; anything paid from Common is already shared.</p>
    </div>
  )
}

// The Lamba Household common-account reconciliation, shown at the bottom of the
// Household expense table. Common income vs. common spending: a shortfall is
// split equally among the earners as an amount each owes into the common
// account; a surplus is split equally as an amount each may take out (or carry
// forward). (The transfer / carry-forward actions land in the next update.)
function CommonReconcile({ doc, k, entities, me, action }: {
  doc: FinanceDoc; k: string; entities: Entity[]
  me: { role: 'super' | 'member'; entityId: string | null }
  action: (payload: Record<string, unknown>) => Promise<{ doc?: FinanceDoc } | null | void> | void
}) {
  const m = monthView(doc, k)
  const income = m.income.filter(i => i.entity === 'common').reduce((s, i) => s + (i.amount || 0), 0)
  const carryIn = doc.months[k]?.commonCarryIn ?? 0
  const expenses = m.items.filter(it => it.paidBy === 'common').reduce((s, it) => s + (it.amount || 0), 0)
  const diff = income - expenses          // income already includes carried-forward via monthView income? no — add carryIn:
  const net = income + carryIn - expenses
  const earners = entities.filter(e => e.kind === 'person' && e.earning)
  const per = earners.length ? Math.abs(net) / earners.length : 0
  const disp = doc.months[k]?.commonDisposition
  const nextLabel = (() => { const [y, mo] = k.split('-').map(Number); return monthLabel(monthKey(new Date(y, mo, 1))) })()
  void diff
  return (
    <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
      <p className="vg-sec" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 6 }}><Scale className="h-4 w-4" /> Common account — where it nets out</p>
      <div className="vg-tablewrap">
        <table className="vg-table" style={{ minWidth: 360 }}>
          <tbody>
            {carryIn > 0.5 && <tr><td>Carried forward from last month</td><td className="num vg-pos">{INR(carryIn)}</td></tr>}
            <tr><td>Common income</td><td className="num vg-pos">{INR(income)}</td></tr>
            <tr><td>Common spending</td><td className="num">− {INR(expenses)}</td></tr>
            <tr style={{ borderTop: '2px solid rgba(109,75,216,0.25)' }}>
              <td style={{ fontWeight: 700 }}>{net >= 0 ? 'Surplus in the common account' : 'Shortfall to top up'}</td>
              <td className="num" style={{ fontWeight: 800 }}><b className={net >= 0 ? 'vg-pos' : 'vg-neg'}>{INR(Math.abs(net))}</b></td>
            </tr>
          </tbody>
        </table>
      </div>
      {Math.abs(net) > 0.5 && earners.length > 0 && (
        <div style={{ marginTop: '0.9rem' }}>
          <p className="vg-muted" style={{ fontSize: '0.82rem', margin: '0 0 0.5rem' }}>
            {net < 0
              ? <>Spending is more than what came in — each earner tops up an equal share into the common account (settle it in the <b>Settlement</b> tab):</>
              : <>More came in than went out — each earner can take an equal share out, or carry the whole surplus to next month:</>}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {earners.map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0.5rem 0.8rem', borderRadius: 12, background: 'rgba(255,255,255,0.6)', minWidth: 190 }}>
                <span><b style={{ color: e.color }}>{e.name}</b> <span className="vg-muted">{net < 0 ? 'owes common' : 'can take out'}</span></span>
                <b style={{ fontVariantNumeric: 'tabular-nums', color: net < 0 ? 'var(--vg-neg)' : 'var(--vg-pos)' }}>{INR(per)}</b>
              </div>
            ))}
          </div>
          {net > 0.5 && me.role === 'super' && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.8rem', alignItems: 'center' }}>
              <button className="vg-btn vg-btn-primary" data-on={disp === 'transfer'} onClick={() => action({ action: 'setCommonDisposition', monthKey: k, mode: disp === 'transfer' ? 'none' : 'transfer' })}>
                <Check className="h-4 w-4" /> {disp === 'transfer' ? 'Taken out (undo)' : 'Transfer out to earners'}
              </button>
              <button className="vg-btn" data-on={disp === 'carry'} onClick={() => action({ action: 'setCommonDisposition', monthKey: k, mode: disp === 'carry' ? 'none' : 'carry' })}>
                <ChevronRight className="h-4 w-4" /> {disp === 'carry' ? `Carrying to ${nextLabel} (undo)` : `Carry forward to ${nextLabel}`}
              </button>
            </div>
          )}
          {disp === 'transfer' && <p className="vg-pos" style={{ fontSize: '0.78rem', marginTop: '0.6rem' }}><Check className="h-4 w-4" style={{ display: 'inline', verticalAlign: '-3px' }} /> Paid out — added as income on each earner’s My Dashboard.</p>}
          {disp === 'carry' && <p className="vg-muted" style={{ fontSize: '0.78rem', marginTop: '0.6rem' }}>Carried forward — added to {nextLabel}’s common income.</p>}
          {net < 0 && <p className="vg-muted" style={{ fontSize: '0.72rem', marginTop: '0.6rem' }}>Shown as an outstanding amount owed to the Lamba Household account.</p>}
        </div>
      )}
    </div>
  )
}

// Editable common (Lamba Household) income for a month. Super edits directly;
// a member proposes the change to a chosen approver. Shown on the Lamba
// Household view, in place of a personal income tile.
function CommonIncomeCard({ doc, k, entities, me, action }: {
  doc: FinanceDoc; k: string; entities: Entity[]
  me: { role: 'super' | 'member'; entityId: string | null }
  action: (payload: Record<string, unknown>) => Promise<{ doc?: FinanceDoc } | null | void> | void
}) {
  const m = monthView(doc, k)
  const rows = m.income.filter(i => i.entity === 'common')
  const current = rows.reduce((s, i) => s + (i.amount || 0), 0)
  const persons = entities.filter(e => e.kind === 'person')
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(current))
  const [approver, setApprover] = useState(persons.find(p => p.id !== me.entityId)?.id ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    if (me.role === 'super') await action({ action: 'setCommonIncome', monthKey: k, amount: Number(amount) || 0 })
    else await action({ action: 'setCommonIncome', monthKey: k, amount: Number(amount) || 0, approver, reason: reason.trim() })
    setBusy(false); setEditing(false); setReason('')
  }
  return (
    <div className="vg-card vg-pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: 8, flexWrap: 'wrap' }}>
        <p className="vg-sec" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><WalletCards className="h-4 w-4" style={{ color: 'var(--vg-accent)' }} /> Common income · {INR(current)}</p>
        {!editing && <button className="vg-btn" onClick={() => { setAmount(String(current)); setEditing(true) }}><Pencil className="h-4 w-4" /> Edit</button>}
      </div>
      {!editing ? (
        <p className="vg-muted" style={{ fontSize: '0.8rem', margin: 0 }}>What the Lamba Household account earns this month (e.g. rent). Visible to everyone in the household; {me.role === 'super' ? 'you can edit it directly.' : 'changes go to someone you pick to approve.'}</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.6rem', maxWidth: 460 }}>
          <div><label className="vg-lbl">Common account income</label><input className="vg-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          {me.role !== 'super' && <>
            <div><label className="vg-lbl">Who approves this change</label>
              <select className="vg-select" value={approver} onChange={e => setApprover(e.target.value)}>
                {persons.filter(p => p.id !== me.entityId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
            <div><label className="vg-lbl">Reason</label><input className="vg-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Rent revised to 50,000" /></div>
          </>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="vg-btn" onClick={() => setEditing(false)}>Cancel</button>
            <button className="vg-btn vg-btn-primary" disabled={busy || (me.role !== 'super' && (!approver || reason.trim().length < 3))} onClick={save}>{busy ? <Loader2 className="h-4 w-4 vg-spin" /> : <Check className="h-4 w-4" />} {me.role === 'super' ? 'Save' : 'Send for approval'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Month tab -------------------------------------------
function MonthTab({ doc, k, setKey, patchMonth, openEditor, action }: {
  doc: FinanceDoc; k: string; setKey: (k: string) => void
  patchMonth: (k: string, fn: (m: MonthData) => MonthData) => void
  openEditor: (e: Editing) => void
  action: (payload: Record<string, unknown>) => Promise<{ doc?: FinanceDoc } | null | void> | void
}) {
  const [bucket, setBucket] = useState<'common' | 'emi'>('common')
  const [pbucket, setPbucket] = useState<'regular' | 'emi'>('regular')
  const [env, setEnv] = useState<string>(DASH)
  const [reading, setReading] = useState(false)
  const [receiptWarn, setReceiptWarn] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const entities = doc.entities
  const envs = visibleEnvelopes(doc, null)                 // super sees every envelope
  const isDash = env === DASH
  const curEnv = isDash ? undefined : (envs.find(e => e.id === env) ?? envs[0])
  const isHousehold = !isDash && (!curEnv || curEnv.system)

  useEffect(() => { if (!doc.months[k]) patchMonth(k, m => m) /* eslint-disable-next-line */ }, [k])

  const m = monthView(doc, k)
  const t = totals(m, entities)
  const step = (delta: number) => { const [y, mo] = k.split('-').map(Number); setKey(monthKey(new Date(y, mo - 1 + delta, 1))) }

  const addToMonth = (it: Item) => patchMonth(k, mm => ({ ...mm, items: [...mm.items, { ...it, src: 'manual' as const }] }))
  // A recurring (template) item edited here overrides just this month; a manual
  // one-off is edited in place.
  const updItem = (it: Item) => patchMonth(k, mm => it.src === 'template' ? putMonthOverride(mm, it) : ({ ...mm, items: mm.items.map(x => x.id === it.id ? it : x) }))
  const delItem = (it: Item) => patchMonth(k, mm => it.src === 'template' ? deleteMonthTemplate(mm, it) : ({ ...mm, items: mm.items.filter(x => x.id !== it.id) }))
  const togglePaid = (it: Item, v: boolean) => patchMonth(k, mm => it.src === 'template' ? setMonthPaid(mm, it, v) : ({ ...mm, items: mm.items.map(x => x.id === it.id ? { ...x, paid: v } : x) }))

  const openNew = (b: Bucket) => {
    const it = newItem(b, entities)
    if (curEnv && !curEnv.system) { it.envelope = curEnv.id; it.alloc = { mode: 'split', shares: envelopeShares(curEnv) } }
    openEditor({ item: it, commit: addToMonth })
  }
  const openEdit = (it: Item) => openEditor({ item: it, commit: updItem, remove: () => delItem(it) })

  async function onReceipt(files: FileList | null) {
    if (!files || !files[0]) return
    const file = files[0]
    setReading(true)
    const it = newItem('common', entities)
    try {
      const b64 = await fileToB64(file)
      const res = await fetch('/api/vault/receipt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: b64, mediaType: file.type, categories: doc.categories.map(c => c.name) }) })
      const info = await res.json().catch(() => ({}))
      if (info.configured === false) setReceiptWarn('Receipt reading isn’t set up yet — add ANTHROPIC_API_KEY in Vercel to auto-read receipts. Fill it in manually for now.')
      if (info.amount) it.amount = Number(info.amount) || 0
      if (info.merchant) it.name = String(info.merchant)
      if (info.note && !it.name) it.name = String(info.note)
      if (info.date) it.date = String(info.date)
      const known = doc.categories.map(c => c.name)
      it.category = (info.category && known.includes(String(info.category))) ? String(info.category) : detectCategory(String(info.merchant || it.name || ''))
      // keep a copy of the receipt image (best-effort)
      try {
        const safe = file.name.replace(/[^\w.\-]+/g, '_'); const rkey = `receipts/${Date.now()}-${safe}`
        const u = await fetch('/api/vault/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: rkey, contentType: file.type }) })
        const { url } = await u.json()
        if (url) { await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file }); it.receiptKey = rkey }
      } catch { /* ignore */ }
    } catch { /* ignore — open blank */ }
    setReading(false)
    openEditor({ item: it, commit: addToMonth })
  }

  // Lamba Household (system) envelope — common income + household-tagged expenses,
  // shown as Common + EMI only (personal now lives on My Dashboard).
  const household = envs.find(e => e.system)
  const hhItems = m.items.filter(it => itemInEnvelope(it, household ?? ({ id: HOUSEHOLD, name: 'Lamba Household', members: [], system: true } as Envelope)))
  const hhRows = hhItems.filter(it => classify(it, entities) === bucket)
  // A specific pair/group envelope: one flat list.
  const envItems = curEnv ? m.items.filter(it => itemInEnvelope(it, curEnv)) : m.items
  // Personal items (100% borne by one person) — the My Dashboard personal panel.
  const personalItems = m.items.filter(it => classify(it, entities) === 'personal')
  const pRows = personalItems.filter(it => (pbucket === 'emi' ? it.kind === 'emi' : it.kind !== 'emi'))
  const rows = isDash ? pRows : isHousehold ? hhRows : envItems
  const counts = { common: 0, emi: 0 }
  hhItems.forEach(it => { const c = classify(it, entities); if (c === 'common') counts.common++; else if (c === 'emi') counts.emi++ })
  const pCounts = { regular: personalItems.filter(it => it.kind !== 'emi').length, emi: personalItems.filter(it => it.kind === 'emi').length }
  const commonIncome = m.income.filter(i => i.entity === 'common').reduce((s, i) => s + (i.amount || 0), 0)
  const commonExpenses = m.items.filter(it => it.paidBy === 'common').reduce((s, it) => s + (it.amount || 0), 0)

  const setInc = (id: string, patch: Partial<IncomeItem>) => patchMonth(k, mm => ({ ...mm, income: mm.income.map(i => i.id === id ? { ...i, ...patch } : i) }))
  const delInc = (id: string) => patchMonth(k, mm => ({ ...mm, income: mm.income.filter(i => i.id !== id) }))
  const addInc = () => patchMonth(k, mm => ({ ...mm, income: [...mm.income, { id: uid('inc'), source: 'Income', entity: firstPerson(entities), amount: 0, src: 'manual' as const }] }))

  const cats = byCategory(m).map((c, i) => ({ ...c, color: catColor(c.name, doc.categories, i) }))
  const bears = entities.map(e => ({ label: e.name, value: t.byEntity[e.id] ?? 0, color: e.color })).filter(p => p.value > 0)
  const settleTxt = t.transfers.length === 0 ? 'All settled — nobody owes anyone.' : ''

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="vg-nav">
            <button className="vg-icobtn" onClick={() => step(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
            <span className="lbl">{monthLabel(k)}</span>
            <button className="vg-icobtn" onClick={() => step(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <EnvelopeSelect envelopes={envs} value={env} onChange={setEnv} />
        </div>
        <button className="vg-btn" onClick={() => setKey(monthKey())}><CalendarDays className="h-4 w-4" /> This month</button>
      </div>

      <div className="vg-kpis" style={{ marginBottom: '1.1rem' }}>
        {isHousehold ? <>
          <Kpi label="Common income" value={INR(commonIncome)} cls="vg-pos" info="Money paid into the shared Lamba Household account this month." />
          <Kpi label="Common expenditure" value={INR(commonExpenses)} info="Spending from the shared Lamba Household account this month." />
          <Kpi label={commonIncome - commonExpenses >= 0 ? 'Surplus in common' : 'Shortfall in common'} value={INR(Math.abs(commonIncome - commonExpenses))} cls={commonIncome - commonExpenses >= 0 ? 'vg-pos' : 'vg-neg'} info="Common income minus common spending — the surplus to share out, or the shortfall to top up." />
          <Kpi label="Household items" small value={String(hhItems.length)} info="Expenses tagged to the Lamba Household envelope this month." />
        </> : <>
          <Kpi label="Income" value={INR(t.income)} cls="vg-pos" info="All the money that came in this month." />
          <Kpi label="Expenses" value={INR(t.expense)} info="Everything spent this month across all envelopes." />
          <Kpi label="Common income" value={INR(commonIncome)} cls="vg-pos" info="Money paid into the shared Lamba Household account this month." />
          <Kpi label="Common expenditure" value={INR(commonExpenses)} info="Spending from the shared Lamba Household account this month." />
        </>}
      </div>

      {!isDash && !isHousehold && curEnv && <EnvelopeImpact items={envItems} entities={entities} env={curEnv} />}

      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
          {isDash ? (
            <div className="vg-subtabs">
              <button className="vg-subtab" data-on={pbucket === 'regular'} onClick={() => setPbucket('regular')}>Regular expense<span className="vg-count">{pCounts.regular}</span></button>
              <button className="vg-subtab" data-on={pbucket === 'emi'} onClick={() => setPbucket('emi')}>EMIs<span className="vg-count">{pCounts.emi}</span></button>
            </div>
          ) : isHousehold ? (
            <div className="vg-subtabs">
              <button className="vg-subtab" data-on={bucket === 'common'} onClick={() => setBucket('common')}>Common<span className="vg-count">{counts.common}</span></button>
              <button className="vg-subtab" data-on={bucket === 'emi'} onClick={() => setBucket('emi')}>EMIs<span className="vg-count">{counts.emi}</span></button>
            </div>
          ) : (
            <p className="vg-sec" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><TagIcon className="h-4 w-4" /> {curEnv?.name} · {envItems.length} item{envItems.length === 1 ? '' : 's'}</p>
          )}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button className="vg-btn" onClick={() => fileRef.current?.click()} disabled={reading}>{reading ? <Loader2 className="h-4 w-4 vg-spin" /> : <Camera className="h-4 w-4" />} Receipt</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onReceipt(e.target.files)} />
            <button className="vg-btn vg-btn-primary" onClick={() => openNew(isDash ? (pbucket === 'emi' ? 'emi' : 'personal') : isHousehold ? bucket : 'common')}><Plus className="h-4 w-4" /> Add</button>
          </div>
        </div>
        {isDash && <p className="vg-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.7rem' }}>Your personal expenses — money borne entirely by one person. Common and shared items live under the <b>Lamba Household</b> and the other envelopes.</p>}
        {receiptWarn && <p className="vg-neg" style={{ fontSize: '0.8rem', margin: '0 0 0.7rem', display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{receiptWarn}</span><button className="vg-icobtn" onClick={() => setReceiptWarn(null)}><X className="h-4 w-4" /></button></p>}
        <ExpenseTable rows={rows} entities={entities} shareCols={shareColumns(rows, entities)}
          onEdit={openEdit} onDelete={delItem} onTogglePaid={togglePaid}
          emptyLabel={`Nothing in ${isDash ? (pbucket === 'emi' ? 'personal EMIs' : 'personal expenses') : isHousehold ? bucket : (curEnv?.name ?? 'this envelope')}. Use Add or snap a Receipt.`} />
      </div>

      {isHousehold && <CommonReconcile doc={doc} k={k} entities={entities} me={{ role: 'super', entityId: null }} action={action} />}

      <div className="vg-grid2">
        {isHousehold && <CommonIncomeCard doc={doc} k={k} entities={entities} me={{ role: 'super', entityId: null }} action={action} />}
        {isDash && (
        <div className="vg-card vg-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <p className="vg-sec" style={{ margin: 0 }}>Income · all sources</p>
            <button className="vg-btn vg-btn-primary" onClick={addInc}><Plus className="h-4 w-4" /> Add</button>
          </div>
          <div className="vg-tablewrap">
            <table className="vg-table" style={{ minWidth: 360 }}>
              <thead><tr><th>Source</th><th>Who</th><th className="num">Amount</th><th style={{ width: 40 }}></th></tr></thead>
              <tbody>
                {m.income.map(i => (
                  <tr key={i.id}>
                    <td><input className="vg-input" value={i.source} onChange={e => setInc(i.id, { source: e.target.value })} /></td>
                    <td><select className="vg-select" value={i.entity} onChange={e => setInc(i.id, { entity: e.target.value })}>{entities.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}</select></td>
                    <td className="num"><input className="vg-input vg-num" inputMode="numeric" value={String(i.amount)} onChange={e => setInc(i.id, { amount: num(e.target.value) })} /></td>
                    <td><button className="vg-icobtn" onClick={() => delInc(i.id)}><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
                {m.income.length === 0 && <tr><td colSpan={4} className="vg-muted" style={{ textAlign: 'center', padding: '1rem' }}>No income yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        )}

        <div className="vg-card vg-pad">
          <p className="vg-sec">Where it goes</p>
          {cats.length ? <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}><Donut data={cats} /><div style={{ flex: 1, minWidth: 160 }}><Legend items={cats} /></div></div> : <p className="vg-muted">Add expenses to see the breakdown.</p>}
        </div>

        <div className="vg-card vg-pad">
          <p className="vg-sec">Who bears what</p>
          {bears.length ? <StackBar parts={bears} /> : <p className="vg-muted">No shares yet.</p>}
        </div>

        <div className="vg-card vg-pad">
          <p className="vg-sec">Settle up</p>
          {t.transfers.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {t.transfers.map((tr, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: 12, background: 'rgba(255,255,255,0.55)' }}>
                  <span><b style={{ color: entColor(entities, tr.from) }}>{entName(entities, tr.from)}</b> <span className="vg-muted">pays</span> <b style={{ color: entColor(entities, tr.to) }}>{entName(entities, tr.to)}</b></span>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{INR(tr.amount)}</b>
                </div>
              ))}
            </div>
          ) : <p className="vg-muted">{settleTxt}</p>}
          <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.6rem' }}>Only money a person paid from their own account creates a debt; anything paid from Common is already shared.</p>
        </div>

        <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
          <p className="vg-sec">Note</p>
          <textarea className="vg-input" rows={2} placeholder="Anything to remember about this month…" value={m.note ?? ''} onChange={e => patchMonth(k, mm => ({ ...mm, note: e.target.value }))} />
        </div>
      </div>

      {/* On My Dashboard, the per-envelope impact strips sit at the very bottom. */}
      {isDash && <div style={{ marginTop: '1.1rem' }}><EnvelopeImpactList envelopes={envs} items={m.items} entities={entities} /></div>}
    </>
  )
}

// ---------- Year tab --------------------------------------------
function YearTab({ doc, year, setYear, openMonth }: {
  doc: FinanceDoc; year: number; setYear: (y: number) => void; openMonth: (k: string) => void
}) {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const per = months.map(k => ({ k, t: totals(monthView(doc, k), doc.entities) }))
  const totInc = per.reduce((s, p) => s + p.t.income, 0)
  const totExp = per.reduce((s, p) => s + p.t.expense, 0)
  const active = per.filter(p => p.t.expense > 0).length || 1
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const catMap = new Map<string, number>()
  months.forEach(k => byCategory(monthView(doc, k)).forEach(c => catMap.set(c.name, (catMap.get(c.name) ?? 0) + c.value)))
  const cats = [...catMap.entries()].map(([name, value], i) => ({ name, value, color: catColor(name, doc.categories, i) })).sort((a, b) => b.value - a.value)

  const now = monthKey()
  const emiRows = doc.template.emis.filter(e => !e.endDate || e.endDate >= `${now}-01`).map(e => ({ ...emiProgress(e), name: e.name, monthly: e.amount, end: e.endDate }))

  const perEntYear = doc.entities.map((e, i) => ({ label: e.name, value: per.reduce((s, p) => s + (p.t.byEntity[e.id] ?? 0), 0), color: e.color || catColor(e.name, doc.categories, i) })).filter(p => p.value > 0).sort((a, b) => b.value - a.value)

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.1rem' }}>
        <div className="vg-nav">
          <button className="vg-icobtn" onClick={() => setYear(year - 1)}><ChevronLeft className="h-4 w-4" /></button>
          <span className="lbl">{year}</span>
          <button className="vg-icobtn" onClick={() => setYear(year + 1)}><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="vg-kpis" style={{ marginBottom: '1.1rem' }}>
        <Kpi label="Income (year)" value={INR(totInc)} cls="vg-pos" info="Total income across all 12 months of this year." />
        <Kpi label="Expenses (year)" value={INR(totExp)} info="Total spent across the whole year." />
        <Kpi label={totInc - totExp >= 0 ? 'Saved' : 'Overspent'} value={INR(Math.abs(totInc - totExp))} cls={totInc - totExp >= 0 ? 'vg-pos' : 'vg-neg'} info="Year income minus year expenses." />
        <Kpi label="Avg / active month" value={INR(totExp / active)} info="Average monthly spend, counting only the months that actually had expenses." />
      </div>

      <div className="vg-grid2">
        <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
          <p className="vg-sec">Expenses by month — tap a bar to open it</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 190, paddingTop: 8 }}>
            {per.map((p, i) => {
              const max = Math.max(1, ...per.map(x => x.t.expense))
              return (
                <button key={p.k} onClick={() => openMonth(p.k)} title={`${MON[i]} · ${INR(p.t.expense)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: 0, background: 'transparent', cursor: 'pointer', minWidth: 0 }}>
                  <span style={{ fontSize: 9, color: '#5b5080', fontVariantNumeric: 'tabular-nums' }}>{p.t.expense ? Math.round(p.t.expense / 1000) + 'k' : ''}</span>
                  <span style={{ width: '100%', display: 'flex', alignItems: 'flex-end', height: 130 }}>
                    <span style={{ width: '100%', height: `${(p.t.expense / max) * 100}%`, minHeight: p.t.expense ? 3 : 0, background: p.k === now ? 'linear-gradient(180deg,#e0708f,#b0479a)' : 'linear-gradient(180deg,#a06be0,#6d4bd8)', borderRadius: '6px 6px 3px 3px' }} />
                  </span>
                  <span style={{ fontSize: 10, color: '#8b81ad' }}>{MON[i]}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="vg-card vg-pad">
          <p className="vg-sec">Year by category</p>
          {cats.length ? <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}><Donut data={cats} /><div style={{ flex: 1, minWidth: 160 }}><Legend items={cats} /></div></div> : <p className="vg-muted">No expenses recorded this year yet.</p>}
        </div>

        <div className="vg-card vg-pad">
          <p className="vg-sec">Who bore the year</p>
          {perEntYear.length ? (
            <>
              <StackBar parts={perEntYear} />
              <div style={{ marginTop: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {perEntYear.map(p => (
                  <div key={p.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                    <span><span className="vg-dot" style={{ background: p.color, marginRight: 6 }} />{p.label}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}><b>{INR(p.value)}</b> <span className="vg-muted">· {Math.round((p.value / (totExp || 1)) * 100)}%</span></span>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="vg-muted">No expenses to attribute yet.</p>}
        </div>

        <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
          <p className="vg-sec">Loan & EMI outlook</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
            {emiRows.map(r => (
              <div key={r.name} className="vg-emi">
                <div className="vg-emi-top">
                  <span className="vg-emi-name">{r.name}</span>
                  <span className="vg-emi-amt">{INR(r.monthly)}<small>/mo</small></span>
                </div>
                <div className="vg-emi-bar"><i style={{ width: `${r.pct}%` }} /></div>
                <div className="vg-emi-meta">
                  <span>{r.total != null ? `${r.paid} / ${r.total} months` : 'open-ended'}</span>
                  <span>{r.outstanding != null ? `${INR(r.outstanding)} left` : '—'}{r.end ? ` · ends ${fmtMon(r.end)}` : ''}</span>
                </div>
              </div>
            ))}
            {emiRows.length === 0 && <p className="vg-muted" style={{ textAlign: 'center', padding: '1rem' }}>No active EMIs.</p>}
          </div>
          <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.7rem' }}>The bar is months paid so far; “left” is the EMI × months remaining — a runway, not an amortised balance.</p>
        </div>
      </div>
    </>
  )
}

// ---------- Tags / events ---------------------------------------
function bearShare(it: Item, entityId: string): number {
  if (it.alloc.mode === 'single') return it.alloc.who === entityId ? it.amount : 0
  return it.amount * (it.alloc.shares[entityId] ?? 0)
}

function TagsTab({ doc }: { doc: FinanceDoc }) {
  const entities = doc.entities
  // Collect every tagged item across all months, remembering its month.
  const tagged: { it: Item; mk: string }[] = []
  for (const [mk, m] of Object.entries(doc.months)) for (const it of m.items) if (it.tags && it.tags.length) tagged.push({ it, mk })
  const tagMap = new Map<string, { it: Item; mk: string }[]>()
  tagged.forEach(({ it, mk }) => it.tags!.forEach(t => { const a = tagMap.get(t) ?? []; a.push({ it, mk }); tagMap.set(t, a) }))
  const tags = [...tagMap.entries()].map(([name, rows]) => ({ name, rows, total: rows.reduce((s, r) => s + r.it.amount, 0) })).sort((a, b) => b.total - a.total)

  const [sel, setSel] = useState<string | null>(null)
  const active = sel && tagMap.has(sel) ? sel : (tags[0]?.name ?? null)
  const rows = active ? (tagMap.get(active) ?? []) : []
  const total = rows.reduce((s, r) => s + r.it.amount, 0)
  const perEnt = entities.map(e => ({ label: e.name, value: rows.reduce((s, r) => s + bearShare(r.it, e.id), 0), color: e.color })).filter(p => p.value > 0).sort((a, b) => b.value - a.value)
  const cats = (() => {
    const c = new Map<string, number>()
    rows.forEach(r => c.set(r.it.category || 'Other', (c.get(r.it.category || 'Other') ?? 0) + r.it.amount))
    return [...c.entries()].map(([name, value], i) => ({ name, value, color: catColor(name, doc.categories, i) })).sort((a, b) => b.value - a.value)
  })()

  return (
    <>
      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        <p style={{ margin: 0, color: '#241b40' }}><TagIcon className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} /> Group spending by <b>event or tag</b> — a trip, a function, a project — no matter what category each expense sits in. Tag an expense from its edit form (or while importing), then pick the tag here to see the total and who bore what.</p>
      </div>

      {tags.length === 0 ? (
        <div className="vg-card vg-pad"><p className="vg-muted" style={{ textAlign: 'center', padding: '1.2rem' }}>No tags yet. Open any expense, add a tag like <b>Ooty 2026</b>, and it will show up here.</p></div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.1rem' }}>
            {tags.map(t => (
              <button key={t.name} className="vg-subtab" data-on={active === t.name} onClick={() => setSel(t.name)}>{t.name}<span className="vg-count">{INR(t.total)}</span></button>
            ))}
          </div>

          <div className="vg-kpis" style={{ marginBottom: '1.1rem' }}>
            <Kpi label="Tag total" value={INR(total)} info="Everything tagged to this event, across all months." />
            <Kpi label="Entries" value={String(rows.length)} info="Number of expenses tagged to this event." />
            <Kpi label="People sharing" value={String(perEnt.length)} info="How many people bear part of this event." />
            <Kpi label="Top category" small value={cats[0]?.name ?? '—'} info="The biggest category within this event." />
          </div>

          <div className="vg-grid2">
            <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
              <p className="vg-sec">Expenses tagged “{active}”</p>
              <div className="vg-tablewrap">
                <table className="vg-table" style={{ minWidth: 560 }}>
                  <thead><tr><th>Item</th><th>Month</th><th>Category</th><th>Paid by</th><th>Shared</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {rows.slice().sort((a, b) => (a.mk < b.mk ? 1 : -1)).map(({ it, mk }) => (
                      <tr key={it.id}>
                        <td className="vg-nm" style={{ fontWeight: 600 }}>{it.name || 'Untitled'}</td>
                        <td className="vg-muted" style={{ fontSize: '0.8rem' }}>{fmtMon(mk)}</td>
                        <td className="vg-muted" style={{ fontSize: '0.8rem' }}>{it.category || '—'}</td>
                        <td><span className="vg-chip" style={{ background: entColor(entities, it.paidBy) + '22', color: entColor(entities, it.paidBy) }}>{entName(entities, it.paidBy)}</span></td>
                        <td><ShareCell it={it} entities={entities} /></td>
                        <td className="num">{INR(it.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr style={{ borderTop: '2px solid rgba(109,75,216,0.25)' }}><td colSpan={5} style={{ fontWeight: 700 }}>Total</td><td className="num" style={{ fontWeight: 800, color: 'var(--vg-accent)' }}>{INR(total)}</td></tr></tfoot>
                </table>
              </div>
            </div>

            <div className="vg-card vg-pad">
              <p className="vg-sec">Who bore “{active}”</p>
              {perEnt.length ? (
                <>
                  <StackBar parts={perEnt} />
                  <div style={{ marginTop: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {perEnt.map(p => (
                      <div key={p.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span><span className="vg-dot" style={{ background: p.color, marginRight: 6 }} />{p.label}</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}><b>{INR(p.value)}</b> <span className="vg-muted">· {Math.round((p.value / (total || 1)) * 100)}%</span></span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <p className="vg-muted">No shares to attribute.</p>}
            </div>

            <div className="vg-card vg-pad">
              <p className="vg-sec">By category</p>
              {cats.length ? <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}><Donut data={cats} /><div style={{ flex: 1, minWidth: 140 }}><Legend items={cats} /></div></div> : <p className="vg-muted">—</p>}
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ---------- Savings tab -----------------------------------------
function SavingsTab({ doc, patchDoc }: { doc: FinanceDoc; patchDoc: (fn: (d: FinanceDoc) => FinanceDoc) => void }) {
  const entities = doc.entities
  const savings = doc.savings
  const total = savings.reduce((s, x) => s + (x.balance || 0), 0)
  const byEnt = entities.map(e => ({ label: e.name, value: savings.filter(s => s.entity === e.id).reduce((a, b) => a + (b.balance || 0), 0), color: e.color })).filter(p => p.value > 0)

  const upd = (id: string, patch: Partial<SavingItem>) => patchDoc(d => ({ ...d, savings: d.savings.map(s => s.id === id ? { ...s, ...patch } : s) }))
  const del = (id: string) => patchDoc(d => ({ ...d, savings: d.savings.filter(s => s.id !== id) }))
  const add = () => patchDoc(d => ({ ...d, savings: [...d.savings, { id: uid('sav'), label: 'New savings', entity: firstPerson(entities), balance: 0, kind: 'FD' }] }))

  return (
    <>
      <div className="vg-kpis" style={{ marginBottom: '1.1rem' }}>
        <div className="vg-kpi"><div className="k">Total savings</div><div className="v vg-pos">{INR(total)}</div></div>
        <div className="vg-kpi"><div className="k">Pots</div><div className="v">{savings.length}</div></div>
      </div>

      {byEnt.length > 0 && <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}><p className="vg-sec">By person</p><StackBar parts={byEnt} /></div>}

      <div className="vg-card vg-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
          <p className="vg-sec" style={{ margin: 0 }}>Savings & investments</p>
          <button className="vg-btn vg-btn-primary" onClick={add}><Plus className="h-4 w-4" /> Add</button>
        </div>
        <div className="vg-tablewrap">
          <table className="vg-table" style={{ minWidth: 620 }}>
            <thead><tr><th>Name</th><th style={{ width: 110 }}>Type</th><th>Whose</th><th className="num">Balance</th><th>Note</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {savings.map(s => (
                <tr key={s.id}>
                  <td><input className="vg-input" value={s.label} onChange={e => upd(s.id, { label: e.target.value })} /></td>
                  <td><input className="vg-input" value={s.kind ?? ''} placeholder="FD / MF / RD…" onChange={e => upd(s.id, { kind: e.target.value })} /></td>
                  <td><select className="vg-select" value={s.entity} onChange={e => upd(s.id, { entity: e.target.value })}>{entities.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}</select></td>
                  <td className="num"><input className="vg-input vg-num" inputMode="numeric" value={String(s.balance)} onChange={e => upd(s.id, { balance: num(e.target.value) })} /></td>
                  <td><input className="vg-input" value={s.note ?? ''} onChange={e => upd(s.id, { note: e.target.value })} /></td>
                  <td><button className="vg-icobtn" onClick={() => del(s.id)}><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
              {savings.length === 0 && <tr><td colSpan={6} className="vg-muted" style={{ textAlign: 'center', padding: '1.2rem' }}>No savings yet. Add an FD, mutual fund, RD, gold, cash…</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ---------- Entities tab ----------------------------------------
interface PUser { username: string; name: string; role: 'super' | 'member'; entityId: string | null; email?: string }

function EntitiesTab({ doc, patchDoc }: { doc: FinanceDoc; patchDoc: (fn: (d: FinanceDoc) => FinanceDoc) => void }) {
  const upd = (id: string, patch: Partial<Entity>) => patchDoc(d => ({ ...d, entities: d.entities.map(e => e.id === id ? { ...e, ...patch } : e) }))
  const del = (id: string) => patchDoc(d => ({ ...d, entities: d.entities.filter(e => e.id !== id) }))
  const add = () => patchDoc(d => ({ ...d, entities: [...d.entities, { id: uid('ent'), name: 'New member', kind: 'person', canPay: false, earning: false, isLiability: true, color: ENTITY_COLORS[d.entities.length % ENTITY_COLORS.length] }] }))

  const [users, setUsers] = useState<PUser[]>([])
  const [flash, setFlash] = useState<{ username: string; password: string } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [emailDraft, setEmailDraft] = useState<Record<string, string>>({})
  const loadUsers = () => fetch('/api/vault/users').then(r => (r.ok ? r.json() : { users: [] })).then(d => {
    const us: PUser[] = d.users ?? []
    setUsers(us)
    setEmailDraft(prev => { const next = { ...prev }; us.forEach(u => { if (u.entityId && next[u.entityId] === undefined) next[u.entityId] = u.email ?? '' }); return next })
  }).catch(() => {})
  useEffect(() => { loadUsers() }, [])
  const loginFor = (eid: string) => users.find(u => u.entityId === eid)
  const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'user'
  const validEmail = (e?: string) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

  async function createLogin(e: Entity) {
    setErr(null); setMsg(null)
    const email = (emailDraft[e.id] ?? '').trim()
    if (!validEmail(email)) { setErr(`Add a valid email for ${e.name} first — it’s required for password reset.`); return }
    setBusy(true)
    const username = slug(e.name)
    try {
      const r = await fetch('/api/vault/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'create', username, name: e.name, role: 'member', entityId: e.id, email }) })
      const d = await r.json().catch(() => ({}))
      if (d.ok) { setFlash({ username, password: d.password }); await loadUsers() }
      else setErr(d.error ?? 'Could not create login')
    } catch { setErr('Could not create login') }
    setBusy(false)
  }
  async function resetLogin(username: string) {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const r = await fetch('/api/vault/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'reset', username }) })
      const d = await r.json().catch(() => ({}))
      if (d.ok) setFlash({ username, password: d.password })
    } catch { /* ignore */ }
    setBusy(false)
  }
  async function saveEmail(username: string, email: string) {
    setErr(null); setMsg(null)
    if (!validEmail(email)) { setErr('Enter a valid email address.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/vault/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'setEmail', username, email: email.trim() }) })
      const d = await r.json().catch(() => ({}))
      if (d.ok) { setMsg(`Email updated for ${username}.`); await loadUsers() }
      else setErr(d.error ?? 'Could not update email')
    } catch { setErr('Could not update email') }
    setBusy(false)
  }

  const persons = doc.entities.filter(e => e.kind === 'person')

  return (
    <>
      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        <p style={{ margin: 0, color: '#241b40' }}><Users className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} /> These are the people (and the shared <b>Common</b> pool) you split and tag money against. Onboard a family member here — mark whether they <b>earn</b>, are a <b>dependant</b>, and whether they can <b>pay</b> (have an account money comes from). Then give them a login below.</p>
      </div>

      <div className="vg-card vg-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
          <p className="vg-sec" style={{ margin: 0 }}>Entities</p>
          <button className="vg-btn vg-btn-primary" onClick={add}><Plus className="h-4 w-4" /> Add member</button>
        </div>
        <div className="vg-tablewrap">
          <table className="vg-table" style={{ minWidth: 720 }}>
            <thead><tr><th style={{ width: 34 }}></th><th>Name</th><th style={{ width: 150 }}>Role in family</th><th style={{ width: 110 }}>Type</th><th style={{ width: 70 }}>Can pay</th><th style={{ width: 70 }}>Earns</th><th style={{ width: 90 }}>Dependant</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {doc.entities.map(e => (
                <tr key={e.id}>
                  <td><input type="color" value={e.color} onChange={ev => upd(e.id, { color: ev.target.value })} style={{ width: 26, height: 26, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} /></td>
                  <td><input className="vg-input" value={e.name} onChange={ev => upd(e.id, { name: ev.target.value })} /></td>
                  <td>{e.kind === 'person'
                    ? <input className="vg-input" list="vg-roles" placeholder="e.g. Father" value={e.role ?? ''} onChange={ev => upd(e.id, { role: ev.target.value })} />
                    : <span className="vg-muted" style={{ fontSize: '0.8rem' }}>Shared pool</span>}</td>
                  <td><select className="vg-select" value={e.kind} onChange={ev => upd(e.id, { kind: ev.target.value as EntityKind })}><option value="person">Person</option><option value="common">Common pool</option></select></td>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" checked={e.canPay} onChange={ev => upd(e.id, { canPay: ev.target.checked })} /></td>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" checked={e.earning} onChange={ev => upd(e.id, { earning: ev.target.checked })} /></td>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" checked={e.isLiability} onChange={ev => upd(e.id, { isLiability: ev.target.checked })} /></td>
                  <td>{doc.entities.length > 1 && <button className="vg-icobtn" onClick={() => del(e.id)} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <datalist id="vg-roles">
          <option value="Father" /><option value="Mother" /><option value="Son" /><option value="Daughter" />
          <option value="Wife" /><option value="Husband" /><option value="Daughter-in-law" /><option value="Son-in-law" />
          <option value="Brother" /><option value="Sister" /><option value="Brother-in-law" /><option value="Sister-in-law" />
        </datalist>
        <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.6rem' }}>The <b>role in family</b> is how everyone relates — e.g. Surinder Pal Singh is <b>Father</b>, Gurneet &amp; Bhawneet are his <b>Sons</b> (so, brothers), Harsimran Kaur is his <b>Wife</b> and the sons&rsquo; mother, and Mehak is Gurneet&rsquo;s wife (<b>Daughter-in-law</b>). Removing a member leaves any past expense tagged to them intact. &ldquo;Common&rdquo; is the shared pool — money paid from it is never counted as a debt between people.</p>
      </div>

      <div className="vg-card vg-pad" style={{ marginTop: '1.1rem' }}>
        <p className="vg-sec"><ShieldCheck className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} /> Profiles &amp; logins</p>
        {flash && (
          <p className="vg-pos" style={{ marginTop: 0 }}>
            <Check className="h-4 w-4" style={{ display: 'inline' }} /> Login <b>{flash.username}</b> · password <b>{flash.password}</b> — share it with them; they can change it after signing in.
          </p>
        )}
        {msg && <p className="vg-pos" style={{ marginTop: 0 }}><Check className="h-4 w-4" style={{ display: 'inline' }} /> {msg}</p>}
        {err && <p className="vg-neg" style={{ marginTop: 0 }}>{err}</p>}
        <div className="vg-tablewrap">
          <table className="vg-table" style={{ minWidth: 620 }}>
            <thead><tr><th>Member</th><th>Username</th><th>Email (for reset)</th><th style={{ width: 210 }}></th></tr></thead>
            <tbody>
              {persons.map(e => {
                const lg = loginFor(e.id)
                const draft = emailDraft[e.id] ?? ''
                const changed = lg && draft.trim() !== (lg.email ?? '')
                return (
                  <tr key={e.id}>
                    <td><span className="vg-dot" style={{ background: e.color, marginRight: 6 }} />{e.name}{e.role && <span className="vg-chip" style={{ marginLeft: 6, fontSize: '0.7rem' }}>{e.role}</span>}</td>
                    <td>{lg ? <b>{lg.username}</b> : <span className="vg-muted">no login yet</span>}</td>
                    <td>
                      <input className="vg-input" type="email" placeholder="name@email.com" value={draft}
                        onChange={ev => setEmailDraft(m => ({ ...m, [e.id]: ev.target.value }))} style={{ minWidth: 180 }} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {lg ? (
                          <>
                            {changed && <button className="vg-btn vg-btn-primary" disabled={busy} onClick={() => saveEmail(lg.username, draft)}>Save email</button>}
                            <button className="vg-btn" disabled={busy} onClick={() => resetLogin(lg.username)}>Reset password</button>
                          </>
                        ) : (
                          <button className="vg-btn vg-btn-primary" disabled={busy} onClick={() => createLogin(e)}><Plus className="h-4 w-4" /> Create login</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {persons.length === 0 && <tr><td colSpan={4} className="vg-muted" style={{ textAlign: 'center', padding: '1rem' }}>Add a person above, then create their login here.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.6rem' }}>Every profile needs an email — it&rsquo;s where the one-time reset code is sent. New logins get the default password <b>Qwerty@123</b>. Only you (super) can create or reset logins.</p>
      </div>

      <EnvelopesCard doc={doc} patchDoc={patchDoc} />
    </>
  )
}

// ---------- Envelopes (super manages) ---------------------------
function EnvelopesCard({ doc, patchDoc }: { doc: FinanceDoc; patchDoc: (fn: (d: FinanceDoc) => FinanceDoc) => void }) {
  const persons = doc.entities.filter(e => e.kind === 'person')
  const envs = doc.envelopes ?? []
  const setName = (id: string, name: string) => patchDoc(d => ({ ...d, envelopes: (d.envelopes ?? []).map(e => e.id === id ? { ...e, name } : e) }))
  const toggleMember = (id: string, member: string) => patchDoc(d => ({ ...d, envelopes: (d.envelopes ?? []).map(e => e.id === id ? { ...e, members: e.members.includes(member) ? e.members.filter(m => m !== member) : [...e.members, member] } : e) }))
  const add = () => patchDoc(d => ({ ...d, envelopes: [...(d.envelopes ?? []), { id: uid('env'), name: 'New envelope', members: [] }] }))
  const del = (id: string) => patchDoc(d => ({ ...d, envelopes: (d.envelopes ?? []).filter(e => e.id !== id) }))

  return (
    <div className="vg-card vg-pad" style={{ marginTop: '1.1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: '0.6rem' }}>
        <p className="vg-sec" style={{ margin: 0 }}><WalletCards className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} /> Envelopes</p>
        <button className="vg-btn vg-btn-primary" onClick={add}><Plus className="h-4 w-4" /> New envelope</button>
      </div>
      <p className="vg-muted" style={{ fontSize: '0.82rem', marginTop: 0 }}>An envelope groups people who share a set of expenses (e.g. <b>Lamba Household</b>, <b>Brothers</b>, <b>Gurneet &amp; Mehak</b>). An expense assigned to an envelope splits equally among its members. Only members (and you) can see a private envelope&rsquo;s expenses.</p>
      <div style={{ display: 'grid', gap: '0.7rem' }}>
        {envs.map(env => (
          <div key={env.id} className="vg-card" style={{ padding: '0.8rem 0.9rem', boxShadow: 'none', border: '1px solid var(--vg-line)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input className="vg-input" value={env.name} onChange={e => setName(env.id, e.target.value)} style={{ maxWidth: 240, fontWeight: 600 }} />
              {env.system ? <span className="vg-chip">household</span> : <button className="vg-icobtn" title="Delete envelope" onClick={() => del(env.id)}><Trash2 className="h-4 w-4" /></button>}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: '0.5rem' }}>
              {persons.map(p => (
                <label key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={env.members.includes(p.id)} onChange={() => toggleMember(env.id, p.id)} />
                  <span className="vg-dot" style={{ background: p.color }} />{p.name}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// need EntityKind type at runtime-less usage
type EntityKind = Entity['kind']

// ---------- Setup tab (staged: edits are local until you Save) ---
type Sec = 'monthly' | 'emis' | 'annual'
type ApplyScope =
  | { mode: 'future' }
  | { mode: 'this' }
  | { mode: 'all' }
  | { mode: 'except-current' }
  | { mode: 'from'; month: string }

function applyScopeToDoc(d: FinanceDoc, scope: ApplyScope) {
  const cur = monthKey()
  const keys = Object.keys(d.months)
  let targets: string[] = []
  if (scope.mode === 'this') targets = [cur]
  else if (scope.mode === 'all') targets = Array.from(new Set([...keys, cur]))
  else if (scope.mode === 'except-current') targets = keys.filter(k => k !== cur)
  else if (scope.mode === 'from') targets = Array.from(new Set([...keys, cur])).filter(k => k >= scope.month)
  // 'future' → touch no existing month; new months pick up the template when opened
  for (const k of targets) d.months[k] = applyTemplateToMonth(d.template, k, d.months[k])
}

function SetupTab({ entities, draft, setDraft, dirty, onSave, onDiscard, currentMonth, openEditor, envelopes = [] }: {
  entities: Entity[]
  draft: Template
  setDraft: (fn: (t: Template) => Template) => void
  dirty: boolean
  onSave: (scope: ApplyScope) => void
  onDiscard: () => void
  currentMonth: string
  openEditor: (e: Editing) => void
  envelopes?: Envelope[]
}) {
  const envName = (id?: string) => envelopes.find(e => e.id === (id ?? HOUSEHOLD))?.name ?? 'Lamba Household'
  const [scopeOpen, setScopeOpen] = useState(false)

  const addT = (sec: Sec, it: Item) => setDraft(t => ({ ...t, [sec]: [...t[sec], it] }))
  const updT = (sec: Sec, it: Item) => setDraft(t => ({ ...t, [sec]: t[sec].map(x => x.id === it.id ? it : x) }))
  const delT = (sec: Sec, id: string) => setDraft(t => ({ ...t, [sec]: t[sec].filter(x => x.id !== id) }))

  const setInc = (id: string, patch: Partial<IncomeItem>) => setDraft(t => ({ ...t, income: t.income.map(i => i.id === id ? { ...i, ...patch } : i) }))
  const delInc = (id: string) => setDraft(t => ({ ...t, income: t.income.filter(i => i.id !== id) }))
  const addInc = () => setDraft(t => ({ ...t, income: [...t.income, { id: uid('inc'), source: 'Income', entity: firstPerson(entities), amount: 0 }] }))

  const templateNew = (sec: Sec): Item => {
    const persons = entities.filter(e => e.kind === 'person')
    const equal: Alloc = { mode: 'split', shares: Object.fromEntries(persons.map(p => [p.id, 1 / (persons.length || 1)])) }
    const common = entities.find(e => e.kind === 'common')?.id ?? 'common'
    if (sec === 'emis') return { id: uid('emi'), name: '', amount: 0, kind: 'emi', paidBy: firstPerson(entities), alloc: equal, startDate: monthKey() + '-01', endDate: null, envelope: HOUSEHOLD }
    if (sec === 'annual') return { id: uid('yr'), name: '', amount: 0, kind: 'annual', paidBy: common, alloc: equal, dueDate: monthKey() + '-01', envelope: HOUSEHOLD }
    return { id: uid('mon'), name: '', amount: 0, kind: 'monthly', paidBy: common, alloc: equal, envelope: HOUSEHOLD }
  }

  const Section = ({ title, sec }: { title: string; sec: Sec }) => (
    <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
        <p className="vg-sec" style={{ margin: 0 }}>{title}</p>
        <button className="vg-btn vg-btn-primary" onClick={() => openEditor({ item: templateNew(sec), commit: it => addT(sec, it) })}><Plus className="h-4 w-4" /> Add</button>
      </div>
      <div className="vg-tablewrap">
        <table className="vg-table" style={{ minWidth: 560 }}>
          <thead><tr>
            <th>Item</th><th>Envelope</th><th>Paid by</th><th>Shared</th>
            <th className="num">{sec === 'annual' ? 'Amount/yr' : 'Amount'}</th>
            {sec === 'emis' && <><th style={{ width: 100 }}>Starts</th><th style={{ width: 100 }}>Ends</th></>}
            {sec === 'annual' && <th style={{ width: 140 }}>Appears in month</th>}
            <th style={{ width: 76 }}></th>
          </tr></thead>
          <tbody>
            {draft[sec].map(it => (
              <tr key={it.id}>
                <td className="vg-nm" style={{ fontWeight: 600 }}>{it.name || <span className="vg-muted">Untitled</span>}</td>
                <td><span className="vg-chip" style={{ fontSize: '0.72rem' }}>{envName(it.envelope)}</span></td>
                <td><span className="vg-chip" style={{ background: entColor(entities, it.paidBy) + '22', color: entColor(entities, it.paidBy) }}>{entName(entities, it.paidBy)}</span></td>
                <td><ShareCell it={it} entities={entities} /></td>
                <td className="num">{INR(it.amount)}</td>
                {sec === 'emis' && <>
                  <td className="vg-muted" style={{ fontSize: '0.8rem' }}>{fmtMon(it.startDate)}</td>
                  <td className="vg-muted" style={{ fontSize: '0.8rem' }}>{it.endDate ? fmtMon(it.endDate) : 'Open'}</td>
                </>}
                {sec === 'annual' && <td className="vg-muted" style={{ fontSize: '0.8rem' }}>{fmtMon(it.dueDate)}</td>}
                <td><div style={{ display: 'flex', gap: 4 }}>
                  <button className="vg-icobtn" onClick={() => openEditor({ item: it, commit: x => updT(sec, x), remove: () => delT(sec, it.id) })}><Pencil className="h-4 w-4" /></button>
                  <button className="vg-icobtn" onClick={() => delT(sec, it.id)}><Trash2 className="h-4 w-4" /></button>
                </div></td>
              </tr>
            ))}
            {draft[sec].length === 0 && <tr><td colSpan={sec === 'emis' ? 8 : sec === 'annual' ? 7 : 6} className="vg-muted" style={{ textAlign: 'center', padding: '1rem' }}>Nothing yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <>
      {/* Save bar — Setup does NOT auto-save */}
      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', position: 'sticky', top: '0.5rem', zIndex: 5 }}>
        <p style={{ margin: 0, color: '#241b40' }}>
          <SlidersHorizontal className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} />{' '}
          {dirty ? <b>Unsaved changes</b> : 'Setup is saved manually'} — edits here don’t auto-save; choose which months to push them to when you Save.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {dirty && <button className="vg-btn" onClick={onDiscard}>Discard</button>}
          <button className="vg-btn vg-btn-primary" disabled={!dirty} onClick={() => setScopeOpen(true)}><Check className="h-4 w-4" /> Save…</button>
        </div>
      </div>

      <div className="vg-grid2">
        <Section title="Monthly recurring" sec="monthly" />
        <Section title="EMIs & loans" sec="emis" />
        <Section title="Yearly items" sec="annual" />
        <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <p className="vg-sec" style={{ margin: 0 }}>Recurring income</p>
            <button className="vg-btn vg-btn-primary" onClick={addInc}><Plus className="h-4 w-4" /> Add</button>
          </div>
          <div className="vg-tablewrap">
            <table className="vg-table" style={{ minWidth: 360 }}>
              <thead><tr><th>Source</th><th>Who</th><th className="num">Amount</th><th style={{ width: 40 }}></th></tr></thead>
              <tbody>
                {draft.income.map(i => (
                  <tr key={i.id}>
                    <td><input className="vg-input" value={i.source} onChange={e => setInc(i.id, { source: e.target.value })} /></td>
                    <td><select className="vg-select" value={i.entity} onChange={e => setInc(i.id, { entity: e.target.value })}>{entities.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}</select></td>
                    <td className="num"><input className="vg-input vg-num" inputMode="numeric" value={String(i.amount)} onChange={e => setInc(i.id, { amount: num(e.target.value) })} /></td>
                    <td><button className="vg-icobtn" onClick={() => delInc(i.id)}><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
                {draft.income.length === 0 && <tr><td colSpan={4} className="vg-muted" style={{ textAlign: 'center', padding: '1rem' }}>No recurring income.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {scopeOpen && <SaveScopeModal currentMonth={currentMonth} onClose={() => setScopeOpen(false)} onSave={sc => { onSave(sc); setScopeOpen(false) }} />}
    </>
  )
}

function SaveScopeModal({ currentMonth, onSave, onClose }: {
  currentMonth: string; onSave: (s: ApplyScope) => void; onClose: () => void
}) {
  const [mode, setMode] = useState<ApplyScope['mode']>('future')
  const [from, setFrom] = useState<string>(currentMonth)
  const opts: { id: ApplyScope['mode']; label: string; hint: string }[] = [
    { id: 'future', label: 'Future months only', hint: 'New months pick up the changes when opened. Existing months untouched.' },
    { id: 'this', label: `Also this month (${monthLabel(currentMonth)})`, hint: 'Apply to the current month as well.' },
    { id: 'all', label: 'All months', hint: 'Apply to every month you have opened, plus this one.' },
    { id: 'except-current', label: 'All except current month', hint: 'Apply to every opened month but leave the current one as it is.' },
    { id: 'from', label: 'From a chosen month onwards', hint: 'Apply to that month and every month after it.' },
  ]
  const commit = () => onSave(mode === 'from' ? { mode: 'from', month: from } : { mode } as ApplyScope)

  return (
    <div className="vg-lb" onClick={onClose}>
      <div className="vg-card vg-pad" style={{ width: 'min(440px, 96vw)', background: 'var(--vg-glass-2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <p className="vg-sec" style={{ margin: 0 }}>Save — apply to which months?</p>
          <button className="vg-icobtn" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {opts.map(o => (
            <label key={o.id} style={{ display: 'flex', gap: '0.6rem', padding: '0.6rem 0.7rem', borderRadius: 12, cursor: 'pointer', background: mode === o.id ? 'rgba(109,75,216,0.1)' : 'rgba(255,255,255,0.5)', border: `1px solid ${mode === o.id ? 'var(--vg-accent)' : 'var(--vg-line)'}` }}>
              <input type="radio" name="scope" checked={mode === o.id} onChange={() => setMode(o.id)} style={{ marginTop: 3 }} />
              <span>
                <b style={{ fontSize: '0.92rem' }}>{o.label}</b>
                <span className="vg-muted" style={{ display: 'block', fontSize: '0.78rem' }}>{o.hint}</span>
                {o.id === 'from' && mode === 'from' && (
                  <input type="month" className="vg-input" style={{ marginTop: '0.4rem', maxWidth: 180 }} value={from} onChange={e => setFrom(e.target.value)} onClick={e => e.stopPropagation()} />
                )}
              </span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="vg-btn" onClick={onClose}>Cancel</button>
          <button className="vg-btn vg-btn-primary" onClick={commit}><Check className="h-4 w-4" /> Save changes</button>
        </div>
      </div>
    </div>
  )
}

// ---------- small shared helpers --------------------------------
function Kpi({ label, value, cls, info, small }: {
  label: string; value: React.ReactNode; cls?: string; info?: string; small?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="vg-kpi" style={{ position: 'relative' }}>
      <div className="k">{label}{info && <button className="vg-info" onClick={() => setOpen(o => !o)} aria-label={`What is ${label}?`}>i</button>}</div>
      <div className={`v ${cls ?? ''}`} style={small ? { fontSize: '0.95rem', lineHeight: 1.3 } : undefined}>{value}</div>
      {open && info && <div className="vg-pop" role="tooltip" onClick={() => setOpen(false)}>{info}</div>}
    </div>
  )
}

function catColor(name: string, cats: Category[], i = 0): string {
  return cats.find(c => c.name === name)?.color ?? CAT_COLORS[name] ?? PALETTE[i % PALETTE.length]
}

function fmtMon(iso?: string | null): string {
  if (!iso) return '—'
  const [y, m] = iso.slice(0, 7).split('-').map(Number)
  if (!y || !m) return '—'
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

function emiProgress(e: Item) {
  const now = new Date()
  const s = e.startDate ? new Date(e.startDate) : null
  let total: number | null = e.tenure ?? null
  if (!total && e.startDate && e.endDate) {
    const a = new Date(e.startDate), b = new Date(e.endDate)
    total = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1
  }
  let paid = 0
  if (s) paid = Math.max(0, (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth()) + 1)
  if (total) paid = Math.min(paid, total)
  const remaining = total != null ? Math.max(0, total - paid) : null
  const outstanding = remaining != null ? e.amount * remaining : null
  const pct = total ? Math.round((paid / total) * 100) : 0
  return { total, paid, remaining, outstanding, pct }
}

// ============================================================
// v3 — Approvals, Budget, and the Member dashboard
// ============================================================

/** Apply an accept/decline to a proposal in place (super path mirrors the server). */
// ---------- Common-account bar (shown on the Common sub-tab) -----
// ---------- Payment reminders -----------------------------------
function RemindersCard({ doc, me, k, action }: {
  doc: FinanceDoc; me: { role: 'super' | 'member'; entityId: string | null }
  k: string
  action: (payload: Record<string, unknown>) => Promise<{ doc?: FinanceDoc } | null | void> | void
}) {
  const persons = doc.entities.filter(e => e.kind === 'person')
  const list = doc.reminders ?? []
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState('1')
  const [scope, setScope] = useState<'common' | 'personal'>('common')
  const [notify, setNotify] = useState<string[]>(persons.filter(p => p.earning).map(p => p.id))
  const [busyId, setBusyId] = useState<string | null>(null)
  const proofRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const toggleNotify = (id: string) => setNotify(n => n.includes(id) ? n.filter(x => x !== id) : [...n, id])

  async function add() {
    if (!label.trim()) return
    await action({ action: 'saveReminder', reminder: { label: label.trim(), amount: amount ? Number(amount) : undefined, dayOfMonth: Number(day) || 1, scope, owner: scope === 'personal' ? me.entityId ?? undefined : undefined, notify, active: true } })
    setLabel(''); setAmount(''); setDay('1'); setAdding(false)
  }

  async function resolve(id: string, file?: File) {
    setBusyId(id)
    let proofKey = ''
    if (file) {
      try {
        const safe = file.name.replace(/[^\w.\-]+/g, '_'); proofKey = `reminders/${k}-${id}-${Date.now()}-${safe}`
        const u = await fetch('/api/vault/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: proofKey, contentType: file.type }) })
        const { url } = await u.json(); if (url) await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      } catch { /* proof optional */ }
    }
    await action({ action: 'resolveReminder', id, monthKey: k, proofKey })
    setBusyId(null)
  }

  return (
    <div className="vg-card vg-pad" style={{ marginTop: '1.1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: '0.5rem' }}>
        <p className="vg-sec" style={{ margin: 0 }}><BellRing className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} /> Payment reminders</p>
        <button className="vg-btn vg-btn-primary" onClick={() => setAdding(a => !a)}><Plus className="h-4 w-4" /> Add reminder</button>
      </div>

      {adding && (
        <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', padding: '0.8rem', border: '1px solid var(--vg-line)', borderRadius: 10, marginBottom: '0.8rem' }}>
          <div style={{ gridColumn: '1 / -1' }}><label className="vg-lbl">What to pay</label><input className="vg-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Axis Home Loan EMI" /></div>
          <div><label className="vg-lbl">Amount (optional)</label><input className="vg-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><label className="vg-lbl">Remind from day</label><input className="vg-input" type="number" min={1} max={28} value={day} onChange={e => setDay(e.target.value)} /></div>
          <div><label className="vg-lbl">Kind</label><select className="vg-select" value={scope} onChange={e => setScope(e.target.value as 'common' | 'personal')}><option value="common">Common / family</option><option value="personal">Personal (mine)</option></select></div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="vg-lbl">Email these people</label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
              {persons.map(p => <label key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.85rem' }}><input type="checkbox" checked={notify.includes(p.id)} onChange={() => toggleNotify(p.id)} />{p.name}</label>)}
            </div>
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="vg-btn" onClick={() => setAdding(false)}>Cancel</button>
            <button className="vg-btn vg-btn-primary" disabled={!label.trim() || notify.length === 0} onClick={add}><Check className="h-4 w-4" /> Save reminder</button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <p className="vg-muted" style={{ fontSize: '0.85rem' }}>No reminders yet. Add one to get a no-reply email from the day it&rsquo;s due until it&rsquo;s marked paid with proof.</p>
      ) : (
        <div className="vg-tablewrap">
          <table className="vg-table" style={{ minWidth: 620 }}>
            <thead><tr><th>What</th><th>Kind</th><th style={{ width: 70 }}>Day</th><th>Notifies</th><th style={{ width: 210 }}>{monthLabel(k)}</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>
              {list.map(r => {
                const done = r.done?.[k]
                return (
                  <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
                    <td className="vg-nm" style={{ fontWeight: 600 }}>{r.label}{r.amount ? <span className="vg-muted" style={{ fontWeight: 400 }}> · {INR(r.amount)}</span> : null}</td>
                    <td><span className="vg-chip">{r.scope === 'common' ? 'Common' : 'Personal'}</span></td>
                    <td className="vg-muted">{r.dayOfMonth}</td>
                    <td className="vg-muted" style={{ fontSize: '0.8rem' }}>{(r.notify ?? []).map(n => entName(doc.entities, n)).join(', ') || '—'}</td>
                    <td>
                      {done ? (
                        <span className="vg-pos" style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Check className="h-4 w-4" /> Paid <span className="vg-muted">· {done.by}</span><button className="vg-icobtn" title="Undo" onClick={() => action({ action: 'unresolveReminder', id: r.id, monthKey: k })}><X className="h-4 w-4" /></button></span>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input ref={el => { proofRefs.current[r.id] = el }} type="file" accept="image/*" hidden onChange={e => resolve(r.id, e.target.files?.[0])} />
                          <button className="vg-btn" disabled={busyId === r.id} onClick={() => proofRefs.current[r.id]?.click()}>{busyId === r.id ? <Loader2 className="h-4 w-4 vg-spin" /> : <Camera className="h-4 w-4" />} Mark paid</button>
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="vg-icobtn" title={r.active ? 'Pause' : 'Resume'} onClick={() => action({ action: 'saveReminder', reminder: { ...r, active: !r.active } })}>{r.active ? '⏸' : '▶'}</button>
                        <button className="vg-icobtn" onClick={() => action({ action: 'removeReminder', id: r.id })}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="vg-muted" style={{ fontSize: '0.72rem', marginTop: '0.6rem' }}>Emails are sent once a day from the due day until you mark the payment paid (with a screenshot). Needs an email provider key set up in Vercel (RESEND_API_KEY).</p>
    </div>
  )
}

// ---------- Monthly settlement ----------------------------------
function SettlementTab({ doc, me, k, setKey, action }: {
  doc: FinanceDoc
  me: { role: 'super' | 'member'; entityId: string | null }
  k: string; setKey: (k: string) => void
  action: (payload: Record<string, unknown>) => Promise<{ doc?: FinanceDoc } | null | void> | void
}) {
  const entities = doc.entities
  const s = computeSettlement(doc, k)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const step = (d: number) => { const [y, mo] = k.split('-').map(Number); setKey(monthKey(new Date(y, mo - 1 + d, 1))) }
  const nm = (id: string) => (id === 'common' ? 'Common account' : entName(entities, id))

  async function uploadProof(tr: SettleTransfer, file?: File) {
    if (!file) return
    setBusyKey(tr.key)
    let proofKey = ''
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, '_'); proofKey = `settlements/${k}-${tr.key.replace(/[^\w]+/g, '_')}-${Date.now()}-${safe}`
      const u = await fetch('/api/vault/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: proofKey, contentType: file.type }) })
      const { url } = await u.json(); if (url) await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
    } catch { /* still record as paid, proof optional */ }
    await action({ action: 'settlePay', monthKey: k, transferKey: tr.key, proofKey })
    setBusyKey(null)
  }

  const kindChip = (kind: SettleTransfer['kind']) =>
    kind === 'common' ? <span className="vg-chip">common pot</span>
      : kind === 'carry' ? <span className="vg-chip" style={{ background: 'rgba(224,112,60,0.14)', color: '#c0398b' }}>carried forward</span>
        : <span className="vg-chip">peer</span>

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.1rem' }}>
        <div className="vg-nav">
          <button className="vg-icobtn" onClick={() => step(-1)}><ChevronLeft className="h-4 w-4" /></button>
          <span className="lbl">{monthLabel(k)}</span>
          <button className="vg-icobtn" onClick={() => step(1)}><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {s.closed ? <span className="vg-chip" style={{ background: 'rgba(31,157,107,0.14)', color: 'var(--vg-pos)' }}><Check className="h-3.5 w-3.5" /> Closed</span> : null}
          <button className="vg-btn" onClick={() => setKey(monthKey())}><CalendarDays className="h-4 w-4" /> This month</button>
        </div>
      </div>

      <div className="vg-kpis" style={{ marginBottom: '1.1rem' }}>
        <Kpi label="Common income" value={INR(s.commonIncome)} cls="vg-pos" info="What the common account earns this month (e.g. rent)." />
        <Kpi label="Paid from common" value={INR(s.commonExpenses)} info="Everything paid out of the common account this month." />
        <Kpi label="Common shortfall" value={INR(s.shortfall)} cls={s.shortfall > 0 ? 'vg-neg' : 'vg-pos'} info="How much the common account overspent beyond its income — funded by the earners." />
        <Kpi label="Still to settle" value={INR(s.outstanding)} cls={s.outstanding > 0 ? 'vg-neg' : 'vg-pos'} info="Total across all unpaid transfers this month." />
      </div>

      <div className="vg-card vg-pad">
        <p className="vg-sec">Who pays whom</p>
        {s.transfers.length === 0 ? (
          <p className="vg-empty"><ShieldCheck className="h-6 w-6" style={{ display: 'inline', color: 'var(--vg-pos)' }} /><br />Nothing to settle this month — everyone&rsquo;s square.</p>
        ) : (
          <div className="vg-tablewrap">
            <table className="vg-table" style={{ minWidth: 620 }}>
              <thead><tr><th>From</th><th>To</th><th></th><th className="num">Amount</th><th style={{ width: 220 }}>Status</th></tr></thead>
              <tbody>
                {s.transfers.map(tr => {
                  const proof = s.paid[tr.key]
                  return (
                    <tr key={tr.key}>
                      <td><span className="vg-chip" style={{ background: entColor(entities, tr.from) + '22', color: entColor(entities, tr.from) }}>{nm(tr.from)}</span></td>
                      <td><span className="vg-chip" style={{ background: (tr.to === 'common' ? '#6d4bd8' : entColor(entities, tr.to)) + '22', color: tr.to === 'common' ? '#6d4bd8' : entColor(entities, tr.to) }}>{nm(tr.to)}</span></td>
                      <td>{kindChip(tr.kind)}{tr.kind === 'carry' && tr.fromMonth && <span className="vg-muted" style={{ fontSize: '0.72rem', marginLeft: 4 }}>from {fmtMon(tr.fromMonth)}</span>}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{INR(tr.amount)}</td>
                      <td>
                        {proof ? (
                          <span className="vg-pos" style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Check className="h-4 w-4" /> Paid <span className="vg-muted">· {proof.by}</span>
                            {!s.closed && <button className="vg-icobtn" title="Undo" onClick={() => action({ action: 'settleUnpay', monthKey: k, transferKey: tr.key })}><X className="h-4 w-4" /></button>}
                          </span>
                        ) : s.closed ? <span className="vg-neg" style={{ fontSize: '0.82rem' }}>unpaid → carried</span> : (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input ref={el => { fileRefs.current[tr.key] = el }} type="file" accept="image/*" hidden onChange={e => uploadProof(tr, e.target.files?.[0])} />
                            <button className="vg-btn" disabled={busyKey === tr.key} onClick={() => fileRefs.current[tr.key]?.click()}>{busyKey === tr.key ? <Loader2 className="h-4 w-4 vg-spin" /> : <Camera className="h-4 w-4" />} Proof + mark paid</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {Object.keys(s.ledger).length > 0 && (
          <details style={{ marginTop: '0.9rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--vg-accent)', fontSize: '0.85rem' }}>Show the full calculation — why these amounts?</summary>
            <div style={{ marginTop: '0.7rem', display: 'grid', gap: '0.8rem', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
              {s.contributors.length > 0 && s.shortfall > 0 && (
                <div style={{ gridColumn: '1 / -1', fontSize: '0.82rem', padding: '0.5rem 0.7rem', background: 'rgba(109,75,216,0.06)', borderRadius: 8 }}>
                  <b>Common account:</b> earned {INR(s.commonIncome)} − spent {INR(s.commonExpenses)} = <b style={{ color: 'var(--vg-neg)' }}>−{INR(s.shortfall)}</b> shortfall, split into {INR(s.perContributor)} each.
                </div>
              )}
              {Object.entries(s.ledger).map(([eid, lines]) => {
                const netv = s.net[eid] ?? 0
                return (
                  <div key={eid} className="vg-card" style={{ padding: '0.7rem 0.85rem', boxShadow: 'none', border: '1px solid var(--vg-line)' }}>
                    <p style={{ margin: '0 0 0.4rem', fontWeight: 700 }}><span className="vg-dot" style={{ background: entColor(entities, eid), marginRight: 6 }} />{entName(entities, eid)}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {lines.map((ln, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.8rem' }}>
                          <span className="vg-muted" style={{ flex: 1 }}>{ln.label}</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums', color: ln.amount >= 0 ? 'var(--vg-pos)' : 'var(--vg-neg)', fontWeight: 600 }}>{ln.amount >= 0 ? '+' : '−'}{INR(Math.abs(ln.amount))}</span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.85rem', borderTop: '1px solid var(--vg-line)', paddingTop: '0.35rem', marginTop: '0.15rem' }}>
                        <b>Net</b>
                        <b style={{ fontVariantNumeric: 'tabular-nums', color: netv >= 0 ? 'var(--vg-pos)' : 'var(--vg-neg)' }}>{netv >= 0 ? 'owed ' : 'owes '}{INR(Math.abs(netv))}</b>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="vg-muted" style={{ fontSize: '0.72rem', marginTop: '0.6rem' }}>Each person&rsquo;s pluses (others&rsquo; shares of what they paid) and minuses (their share of what others paid, plus the common shortfall) net to the figure above — those nets are what the transfers settle.</p>
          </details>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.9rem', gap: 8, flexWrap: 'wrap' }}>
          <p className="vg-muted" style={{ fontSize: '0.75rem', margin: 0, maxWidth: 560 }}>Upload the payment screenshot as proof when someone pays. When you close the month, anything still unpaid is carried into next month with a reference back to here.</p>
          {s.closed
            ? (me.role === 'super' && <button className="vg-btn" onClick={() => action({ action: 'reopenSettlement', monthKey: k })}>Reopen</button>)
            : <button className="vg-btn vg-btn-primary" disabled={s.transfers.length === 0} onClick={() => action({ action: 'closeSettlement', monthKey: k })}><Check className="h-4 w-4" /> Close this month</button>}
        </div>
      </div>

      <RemindersCard doc={doc} me={me} k={k} action={action} />
    </>
  )
}

// ---------- Approvals -------------------------------------------
function editKind(p: Proposal): string {
  if (p.template) return `Recurring ${p.template.section === 'emis' ? 'EMI' : p.template.section} · ${p.template.op}`
  if (p.monthEdit) return p.monthEdit.op === 'delete' ? 'Remove' : 'Change'
  return 'New charge'
}

function ApprovalsTab({ doc, onDecide, onRevoke, me }: {
  doc: FinanceDoc
  onDecide: (id: string, kind: 'accept' | 'decline') => void
  onRevoke?: (id: string) => void
  me?: { role: 'super' | 'member'; entityId: string | null }
}) {
  const props = doc.proposals ?? []
  const ent = doc.entities
  const isSuper = me?.role === 'super'
  const meId = me?.entityId ?? null
  const isMine = (p: Proposal) => (isSuper && p.proposedBy === 'super') || (meId != null && p.proposedBy === meId)
  const canDecide = (p: Proposal) => isSuper || (meId != null && p.approvers.includes(meId) && !p.approved.includes(meId))
  const toReview = props.filter(p => canDecide(p) && !isMine(p))
  const mineOut = props.filter(isMine)
  const log = (doc.auditLog ?? []).slice().reverse()
  const when = (ts: string) => { try { return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return ts } }
  const evColor: Record<string, string> = { propose: 'var(--vg-accent)', accept: 'var(--vg-pos)', decline: 'var(--vg-neg)', revoke: '#c0398b', apply: '#8b81ad' }

  const Card = ({ p }: { p: Proposal }) => (
    <div className="vg-card" style={{ padding: '0.9rem 1rem', boxShadow: 'none', border: '1px solid var(--vg-line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <b style={{ fontSize: '1rem' }}>{p.item.name || 'Expense'}</b> <span className="vg-chip">{editKind(p)}</span> {!p.template && <span className="vg-chip">{monthLabel(p.monthKey)}</span>}
          <div className="vg-muted" style={{ fontSize: '0.82rem', marginTop: 2 }}>
            Proposed by <b>{p.proposedByName}</b> · paid by {entName(ent, p.item.paidBy)} · {shareSummary(p.item, ent)}
          </div>
          {p.reason && <div style={{ fontSize: '0.82rem', marginTop: 4, padding: '0.35rem 0.55rem', background: 'rgba(109,75,216,0.06)', borderLeft: '2px solid var(--vg-accent)', borderRadius: 4 }}><b>Reason:</b> {p.reason}</div>}
          <div className="vg-muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>
            Needs {p.mode === 'any' ? 'any one of' : 'all of'}: {p.approvers.map(a => entName(ent, a)).join(', ')}
            {p.approved.length > 0 && ` · approved by ${p.approved.map(a => entName(ent, a)).join(', ')}`}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="v" style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{INR(p.item.amount)}</div>
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', justifyContent: 'flex-end' }}>
            {isMine(p) && !isSuper ? (
              <>
                <span className="vg-chip" style={{ background: 'rgba(224,112,60,0.14)', color: '#c0398b' }}>waiting on {p.approvers.map(a => entName(ent, a)).join(', ')}</span>
                {onRevoke && <button className="vg-btn" onClick={() => onRevoke(p.id)}>Revoke</button>}
              </>
            ) : (
              <>
                {onRevoke && isMine(p) && <button className="vg-btn" onClick={() => onRevoke(p.id)}>Revoke</button>}
                <button className="vg-btn" style={{ color: 'var(--vg-neg)' }} onClick={() => onDecide(p.id, 'decline')}>Decline</button>
                <button className="vg-btn vg-btn-primary" onClick={() => onDecide(p.id, 'accept')}><Check className="h-4 w-4" /> Accept</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="vg-grid2">
      <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
        <p className="vg-sec"><BellRing className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} /> Charges waiting on a yes</p>
        {toReview.length === 0 ? (
          <p className="vg-empty"><ShieldCheck className="h-6 w-6" style={{ display: 'inline', color: 'var(--vg-pos)' }} /><br />Nothing waiting on you — you&rsquo;re all caught up.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>{toReview.map(p => <Card key={p.id} p={p} />)}</div>
        )}
        <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.7rem' }}>When you accept, the change is applied to that month&rsquo;s sheet and logged below. Anything that&rsquo;s only yours is applied without asking.</p>
      </div>

      {mineOut.length > 0 && (
        <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
          <p className="vg-sec">Your requests — waiting on others</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>{mineOut.map(p => <Card key={p.id} p={p} />)}</div>
          <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.7rem' }}>You can <b>Revoke</b> a request to pull it back and make more changes. Only one edit per expense can be open at a time.</p>
        </div>
      )}

      <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
        <p className="vg-sec">History</p>
        {log.length === 0 ? <p className="vg-muted">No activity yet.</p> : (
          <div className="vg-tablewrap">
            <table className="vg-table" style={{ minWidth: 560 }}>
              <thead><tr><th style={{ width: 130 }}>When</th><th style={{ width: 90 }}>Who</th><th style={{ width: 90 }}>Action</th><th>What</th><th>Reason</th></tr></thead>
              <tbody>
                {log.slice(0, 60).map(a => (
                  <tr key={a.id}>
                    <td className="vg-muted" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{when(a.ts)}</td>
                    <td style={{ fontSize: '0.82rem' }}>{a.actorName}</td>
                    <td><span className="vg-chip" style={{ background: (evColor[a.event] || '#8b81ad') + '22', color: evColor[a.event] || '#8b81ad', textTransform: 'capitalize' }}>{a.event}</span></td>
                    <td style={{ fontSize: '0.85rem' }}>{a.what}</td>
                    <td className="vg-muted" style={{ fontSize: '0.8rem' }}>{a.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.6rem' }}>Every edit request, approval, decline and revoke is logged here with who did it and when.</p>
      </div>
    </div>
  )
}

// ---------- Budget ----------------------------------------------
function BudgetTab({ doc, me, onSaveBudget }: {
  doc: FinanceDoc; me: { role: 'super' | 'member'; entityId: string | null }
  onSaveBudget: (who: string, b: EntityBudget) => void
}) {
  const persons = doc.entities.filter(e => e.kind === 'person')
  const whoOptions = me.role === 'super' ? ['family', ...persons.map(p => p.id)] : [me.entityId ?? persons[0]?.id ?? '']
  const [who, setWho] = useState(whoOptions[0])
  const stored = who === 'family' ? doc.budgets.family : (doc.budgets.byEntity[who] ?? emptyBudget())
  const [draft, setDraft] = useState<EntityBudget>(() => structuredClone(stored))
  useEffect(() => {
    setDraft(structuredClone(who === 'family' ? doc.budgets.family : (doc.budgets.byEntity[who] ?? emptyBudget())))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who, doc])
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored)

  const mk = monthKey()
  const m = monthView(doc, mk)
  const t = totals(m, doc.entities)
  const spent = who === 'family' ? t.expense : (t.byEntity[who] ?? 0)
  const income = who === 'family' ? t.income : m.income.filter(i => i.entity === who).reduce((a, b) => a + b.amount, 0)
  const savingsTotal = (who === 'family' ? doc.savings : doc.savings.filter(s => s.entity === who)).reduce((a, b) => a + (b.balance || 0), 0)
  const monthlySaving = income - spent
  const plannedTotal = draft.planned.reduce((a, b) => a + (b.amount || 0), 0)
  const monthsToFund = monthlySaving > 0 ? Math.ceil(plannedTotal / monthlySaving) : null

  const catAct = new Map<string, number>()
  for (const it of m.items) { const f = who === 'family' ? 1 : (shares(it)[who] ?? 0); if (f <= 0) continue; catAct.set(categoryOf(it), (catAct.get(categoryOf(it)) ?? 0) + it.amount * f) }

  const setCat = (name: string, v: number) => setDraft(d => ({ ...d, byCategory: { ...d.byCategory, [name]: v } }))
  const addPlan = () => setDraft(d => ({ ...d, planned: [...d.planned, { id: uid('plan'), name: 'New goal', amount: 0, targetMonth: monthKey() }] }))
  const updPlan = (id: string, patch: Partial<PlannedItem>) => setDraft(d => ({ ...d, planned: d.planned.map(x => x.id === id ? { ...x, ...patch } : x) }))
  const delPlan = (id: string) => setDraft(d => ({ ...d, planned: d.planned.filter(x => x.id !== id) }))

  const overBudget = draft.monthly > 0 && spent > draft.monthly

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.1rem' }}>
        {whoOptions.length > 1 ? (
          <div className="vg-tabs">
            {whoOptions.map(o => <button key={o} className="vg-tab" data-on={who === o} onClick={() => setWho(o)}>{o === 'family' ? 'Family' : entName(doc.entities, o)}</button>)}
          </div>
        ) : <p className="vg-sec" style={{ margin: 0 }}>My budget</p>}
        {dirty && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="vg-btn" onClick={() => setDraft(structuredClone(stored))}>Discard</button>
            <button className="vg-btn vg-btn-primary" onClick={() => onSaveBudget(who, draft)}><Check className="h-4 w-4" /> Save budget</button>
          </div>
        )}
      </div>

      <div className="vg-kpis" style={{ marginBottom: '1.1rem' }}>
        <div className="vg-kpi"><div className="k">Monthly budget</div><div className="v">
          <input className="vg-input vg-num" style={{ maxWidth: 130 }} inputMode="numeric" value={String(draft.monthly)} onChange={e => setDraft(d => ({ ...d, monthly: num(e.target.value) }))} />
        </div></div>
        <div className="vg-kpi"><div className="k">Spent this month</div><div className={`v ${overBudget ? 'vg-neg' : ''}`}>{INR(spent)}</div></div>
        <div className="vg-kpi"><div className="k">{draft.monthly - spent >= 0 ? 'Left to spend' : 'Over by'}</div><div className={`v ${draft.monthly - spent >= 0 ? 'vg-pos' : 'vg-neg'}`}>{draft.monthly ? INR(Math.abs(draft.monthly - spent)) : '—'}</div></div>
        <div className="vg-kpi"><div className="k">Saving this month</div><div className={`v ${monthlySaving >= 0 ? 'vg-pos' : 'vg-neg'}`}>{INR(Math.abs(monthlySaving))}</div></div>
      </div>

      {draft.monthly > 0 && (
        <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--vg-ink-soft)', marginBottom: 4 }}>
            <span>{INR(spent)} spent</span><span>budget {INR(draft.monthly)}</span>
          </div>
          <div className="vg-emi-bar" style={{ height: 12 }}><i style={{ width: `${Math.min(100, (spent / draft.monthly) * 100)}%`, background: overBudget ? 'linear-gradient(90deg,#e2445c,#b0479a)' : 'linear-gradient(90deg,#a06be0,#6d4bd8)' }} /></div>
        </div>
      )}

      <div className="vg-grid2">
        {/* Category budgets */}
        <div className="vg-card vg-pad">
          <p className="vg-sec">Category limits</p>
          <div className="vg-tablewrap">
            <table className="vg-table" style={{ minWidth: 380 }}>
              <thead><tr><th>Category</th><th className="num">Limit</th><th className="num">Spent</th></tr></thead>
              <tbody>
                {doc.categories.map(c => {
                  const a = catAct.get(c.name) ?? 0
                  const lim = draft.byCategory[c.name] ?? 0
                  const over = lim > 0 && a > lim
                  return (
                    <tr key={c.name}>
                      <td><span className="vg-dot" style={{ background: c.color, marginRight: 6 }} />{c.name}</td>
                      <td className="num"><input className="vg-input vg-num" style={{ width: 90 }} inputMode="numeric" value={String(lim)} onChange={e => setCat(c.name, num(e.target.value))} /></td>
                      <td className={`num ${over ? 'vg-neg' : ''}`} style={{ fontWeight: over ? 700 : 400 }}>{INR(a)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Planned purchases + projection */}
        <div className="vg-card vg-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <p className="vg-sec" style={{ margin: 0 }}>Planned purchases</p>
            <button className="vg-btn vg-btn-primary" onClick={addPlan}><Plus className="h-4 w-4" /> Add</button>
          </div>
          <div className="vg-tablewrap">
            <table className="vg-table" style={{ minWidth: 400 }}>
              <thead><tr><th>Goal</th><th className="num">Cost</th><th style={{ width: 120 }}>Target</th><th style={{ width: 36 }}></th></tr></thead>
              <tbody>
                {draft.planned.map(pl => (
                  <tr key={pl.id}>
                    <td><input className="vg-input" value={pl.name} onChange={e => updPlan(pl.id, { name: e.target.value })} /></td>
                    <td className="num"><input className="vg-input vg-num" style={{ width: 90 }} inputMode="numeric" value={String(pl.amount)} onChange={e => updPlan(pl.id, { amount: num(e.target.value) })} /></td>
                    <td><input className="vg-input" type="month" value={pl.targetMonth} onChange={e => updPlan(pl.id, { targetMonth: e.target.value })} /></td>
                    <td><button className="vg-icobtn" onClick={() => delPlan(pl.id)}><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
                {draft.planned.length === 0 && <tr><td colSpan={4} className="vg-muted" style={{ textAlign: 'center', padding: '1rem' }}>Add something you&rsquo;re saving up for.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '0.9rem', borderTop: '1px solid var(--vg-line)', paddingTop: '0.8rem', lineHeight: 1.7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="vg-muted">Savings now</span><b>{INR(savingsTotal)}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="vg-muted">Wishlist total</span><b>{INR(plannedTotal)}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="vg-muted">After buying it all</span><b className={savingsTotal - plannedTotal >= 0 ? 'vg-pos' : 'vg-neg'}>{INR(savingsTotal - plannedTotal)}</b></div>
            {plannedTotal > 0 && (
              <p style={{ marginTop: '0.6rem', fontSize: '0.88rem' }}>
                {savingsTotal >= plannedTotal
                  ? <span className="vg-pos"><b>Your savings already cover this.</b></span>
                  : monthsToFund != null
                    ? <>At <b>{INR(monthlySaving)}</b> saved this month, the shortfall of <b>{INR(plannedTotal - savingsTotal)}</b> is about <b>{Math.max(0, Math.ceil((plannedTotal - savingsTotal) / monthlySaving))} months</b> away.</>
                    : <span className="vg-neg">You&rsquo;re not saving this month, so this can&rsquo;t be funded from savings yet.</span>}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ---------- Member: My Savings ----------------------------------
function MemberSavings({ doc, entityId, onSave }: { doc: FinanceDoc; entityId: string; onSave: (rows: SavingItem[]) => void }) {
  const stored = () => doc.savings.filter(s => s.entity === entityId).map(s => ({ ...s }))
  const [rows, setRows] = useState<SavingItem[]>(stored)
  useEffect(() => { setRows(stored()) /* eslint-disable-next-line */ }, [doc, entityId])
  const dirty = JSON.stringify(rows) !== JSON.stringify(stored())
  const total = rows.reduce((a, b) => a + (b.balance || 0), 0)
  const upd = (id: string, patch: Partial<SavingItem>) => setRows(r => r.map(x => x.id === id ? { ...x, ...patch } : x))
  const del = (id: string) => setRows(r => r.filter(x => x.id !== id))
  const add = () => setRows(r => [...r, { id: uid('sav'), label: 'New savings', entity: entityId, balance: 0, kind: 'FD' }])
  return (
    <>
      <div className="vg-kpis" style={{ marginBottom: '1.1rem' }}>
        <div className="vg-kpi"><div className="k">My savings</div><div className="v vg-pos">{INR(total)}</div></div>
        <div className="vg-kpi"><div className="k">Pots</div><div className="v">{rows.length}</div></div>
      </div>
      <div className="vg-card vg-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', gap: '0.5rem', flexWrap: 'wrap' }}>
          <p className="vg-sec" style={{ margin: 0 }}><ShieldCheck className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-pos)', verticalAlign: '-3px' }} /> Private to you</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {dirty && <button className="vg-btn" onClick={() => setRows(stored())}>Discard</button>}
            <button className="vg-btn" onClick={add}><Plus className="h-4 w-4" /> Add</button>
            <button className="vg-btn vg-btn-primary" disabled={!dirty} onClick={() => onSave(rows)}><Check className="h-4 w-4" /> Save</button>
          </div>
        </div>
        <div className="vg-tablewrap">
          <table className="vg-table" style={{ minWidth: 560 }}>
            <thead><tr><th>Name</th><th style={{ width: 110 }}>Type</th><th className="num">Balance</th><th>Note</th><th style={{ width: 36 }}></th></tr></thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id}>
                  <td><input className="vg-input" value={s.label} onChange={e => upd(s.id, { label: e.target.value })} /></td>
                  <td><input className="vg-input" value={s.kind ?? ''} placeholder="FD / MF…" onChange={e => upd(s.id, { kind: e.target.value })} /></td>
                  <td className="num"><input className="vg-input vg-num" inputMode="numeric" value={String(s.balance)} onChange={e => upd(s.id, { balance: num(e.target.value) })} /></td>
                  <td><input className="vg-input" value={s.note ?? ''} onChange={e => upd(s.id, { note: e.target.value })} /></td>
                  <td><button className="vg-icobtn" onClick={() => del(s.id)}><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="vg-muted" style={{ textAlign: 'center', padding: '1.2rem' }}>No savings yet. Add an FD, mutual fund, RD, gold, cash…</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.6rem' }}>This is private to your profile. No one else can see it — not other members, and not the family admin.</p>
      </div>
    </>
  )
}

// ---------- Member: This month (same layout as super, writes via approval) ----
function memberNewItem(bucket: Bucket, entities: Entity[], entityId: string): Item {
  const it = newItem(bucket, entities)
  if (bucket === 'personal') { it.paidBy = entityId; it.alloc = { mode: 'single', who: entityId } }
  else if (bucket === 'emi') { it.paidBy = entityId }
  return it
}

// Editable, private per-profile income for a single month.
function MemberIncomeCard({ rows, monthKey: mk, onSave }: {
  rows: IncomeItem[]; monthKey: string
  onSave: (rows: { id: string; source: string; amount: number }[]) => void
}) {
  const [draft, setDraft] = useState<{ id: string; source: string; amount: number }[]>(() => rows.map(r => ({ id: r.id, source: r.source, amount: r.amount })))
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setDraft(rows.map(r => ({ id: r.id, source: r.source, amount: r.amount }))); setDirty(false) /* eslint-disable-next-line */ }, [mk])
  const set = (id: string, patch: Partial<{ source: string; amount: number }>) => { setDraft(d => d.map(r => r.id === id ? { ...r, ...patch } : r)); setDirty(true) }
  const add = () => { setDraft(d => [...d, { id: uid('inc'), source: 'Salary', amount: 0 }]); setDirty(true) }
  const del = (id: string) => { setDraft(d => d.filter(r => r.id !== id)); setDirty(true) }
  const total = draft.reduce((a, b) => a + (Number(b.amount) || 0), 0)
  return (
    <div className="vg-card vg-pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <p className="vg-sec" style={{ margin: 0 }}><ShieldCheck className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-pos)', verticalAlign: '-3px' }} /> My income · {INR(total)}</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="vg-btn" onClick={add}><Plus className="h-4 w-4" /> Add</button>
          <button className="vg-btn vg-btn-primary" disabled={!dirty} onClick={() => { onSave(draft.map(r => ({ ...r, amount: Number(r.amount) || 0 }))); setDirty(false) }}><Check className="h-4 w-4" /> Save</button>
        </div>
      </div>
      <div className="vg-tablewrap">
        <table className="vg-table" style={{ minWidth: 320 }}>
          <thead><tr><th>Source</th><th className="num">Amount / mo</th><th style={{ width: 36 }}></th></tr></thead>
          <tbody>
            {draft.map(r => (
              <tr key={r.id}>
                <td><input className="vg-input" value={r.source} onChange={e => set(r.id, { source: e.target.value })} placeholder="Salary, rent received…" /></td>
                <td className="num"><input className="vg-input" type="number" value={r.amount} onChange={e => set(r.id, { amount: Number(e.target.value) })} style={{ textAlign: 'right', maxWidth: 130 }} /></td>
                <td><button className="vg-icobtn" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
            {draft.length === 0 && <tr><td colSpan={3} className="vg-muted" style={{ textAlign: 'center', padding: '1rem' }}>No income yet. Add your salary or other earnings.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Private to your profile — no one else, including the family admin, can see this.</p>
    </div>
  )
}

function MemberMonth({ doc, entityId, k, setKey, action, openEditor }: {
  doc: FinanceDoc; entityId: string; k: string; setKey: (k: string) => void
  action: (payload: Record<string, unknown>) => void
  openEditor: (e: { item: Item; onSave: (it: Item) => void }) => void
}) {
  const [bucket, setBucket] = useState<'common' | 'emi'>('common')
  const [pbucket, setPbucket] = useState<'regular' | 'emi'>('regular')
  const [env, setEnv] = useState<string>(DASH)
  const [reading, setReading] = useState(false)
  const [receiptWarn, setReceiptWarn] = useState<string | null>(null)
  const [reasonPrompt, setReasonPrompt] = useState<{ title: string; onConfirm: (reason: string) => void } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const entities = doc.entities
  const m = monthView(doc, k)
  const t = totals(m, entities)
  const step = (d: number) => { const [y, mo] = k.split('-').map(Number); setKey(monthKey(new Date(y, mo - 1 + d, 1))) }
  const bal = t.netBalance[entityId] ?? 0
  const envs = visibleEnvelopes(doc, entityId)             // only the envelopes this member belongs to
  const isDash = env === DASH
  const curEnv = isDash ? undefined : (envs.find(e => e.id === env) ?? envs[0])
  const isHousehold = !isDash && (!curEnv || curEnv.system)

  const household = envs.find(e => e.system)
  const hhItems = m.items.filter(it => itemInEnvelope(it, household ?? ({ id: HOUSEHOLD, name: 'Lamba Household', members: [], system: true } as Envelope)))
  const hhRows = hhItems.filter(it => classify(it, entities) === bucket)
  const envItems = curEnv ? m.items.filter(it => itemInEnvelope(it, curEnv)) : m.items
  const personalItems = m.items.filter(it => classify(it, entities) === 'personal')
  const pRows = personalItems.filter(it => (pbucket === 'emi' ? it.kind === 'emi' : it.kind !== 'emi'))
  const rows = isDash ? pRows : isHousehold ? hhRows : envItems
  const counts = { common: 0, emi: 0 }
  hhItems.forEach(it => { const c = classify(it, entities); if (c === 'common') counts.common++; else if (c === 'emi') counts.emi++ })
  const pCounts = { regular: personalItems.filter(it => it.kind !== 'emi').length, emi: personalItems.filter(it => it.kind === 'emi').length }
  const commonIncome = m.income.filter(i => i.entity === 'common').reduce((s, i) => s + (i.amount || 0), 0)
  const commonExpenses = m.items.filter(it => it.paidBy === 'common').reduce((s, it) => s + (it.amount || 0), 0)
  const cats = byCategory(m).map((c, i) => ({ ...c, color: catColor(c.name, doc.categories, i) }))
  const bears = entities.map(e => ({ label: e.name, value: t.byEntity[e.id] ?? 0, color: e.color })).filter(p => p.value > 0)
  // Items already awaiting an edit decision — locked from a second edit.
  const underReview = new Set((doc.proposals ?? []).filter(p => p.monthEdit || (p.template && p.template.op !== 'add')).map(p => p.item?.id))

  const openAdd = (b: Bucket) => {
    const it = memberNewItem(b, entities, entityId)
    if (curEnv && !curEnv.system) { it.envelope = curEnv.id; it.alloc = { mode: 'split', shares: envelopeShares(curEnv) } }
    openEditor({ item: it, onSave: x => action({ action: 'propose', item: x, monthKey: k }) })
  }
  const openEdit = (it: Item) => {
    const mine = isPersonalTo(it, entityId, entities)
    if (mine) { openEditor({ item: it, onSave: x => action({ action: 'proposeMonthEdit', item: x, monthKey: k, op: 'update' }) }); return }
    // Shared: edit the fields, then capture a reason before it goes for approval.
    openEditor({ item: it, onSave: x => setReasonPrompt({ title: 'Reason for this change', onConfirm: reason => { action({ action: 'proposeMonthEdit', item: x, monthKey: k, op: 'update', reason }); setReasonPrompt(null) } }) })
  }
  const del = (it: Item) => {
    const mine = isPersonalTo(it, entityId, entities)
    if (mine) { action({ action: 'proposeMonthEdit', item: it, monthKey: k, op: 'delete' }); return }
    setReasonPrompt({ title: 'Reason for removing this', onConfirm: reason => { action({ action: 'proposeMonthEdit', item: it, monthKey: k, op: 'delete', reason }); setReasonPrompt(null) } })
  }
  const togglePaid = (it: Item, v: boolean) => action({ action: 'proposeMonthEdit', item: { ...it, paid: v }, monthKey: k, op: 'update' })

  async function onReceipt(files: FileList | null) {
    if (!files || !files[0]) return
    const file = files[0]; setReading(true)
    const it = memberNewItem('personal', entities, entityId)
    try {
      const b64 = await fileToB64(file)
      const res = await fetch('/api/vault/receipt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: b64, mediaType: file.type, categories: doc.categories.map(c => c.name) }) })
      const info = await res.json().catch(() => ({}))
      if (info.configured === false) setReceiptWarn('Receipt reading isn’t set up yet — add ANTHROPIC_API_KEY in Vercel to auto-read receipts. Fill it in manually for now.')
      if (info.amount) it.amount = Number(info.amount) || 0
      if (info.merchant) it.name = String(info.merchant)
      if (info.note && !it.name) it.name = String(info.note)
      if (info.date) it.date = String(info.date)
      { const known = doc.categories.map(c => c.name); it.category = (info.category && known.includes(String(info.category))) ? String(info.category) : detectCategory(String(info.merchant || it.name || '')) }
      try {
        const safe = file.name.replace(/[^\w.\-]+/g, '_'); const rkey = `receipts/${Date.now()}-${safe}`
        const u = await fetch('/api/vault/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: rkey, contentType: file.type }) })
        const { url } = await u.json(); if (url) { await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file }); it.receiptKey = rkey }
      } catch { /* ignore */ }
    } catch { /* ignore */ }
    setReading(false)
    openEditor({ item: it, onSave: x => action({ action: 'propose', item: x, monthKey: k }) })
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="vg-nav">
            <button className="vg-icobtn" onClick={() => step(-1)}><ChevronLeft className="h-4 w-4" /></button>
            <span className="lbl">{monthLabel(k)}</span>
            <button className="vg-icobtn" onClick={() => step(1)}><ChevronRight className="h-4 w-4" /></button>
          </div>
          <EnvelopeSelect envelopes={envs} value={env} onChange={setEnv} />
        </div>
        <button className="vg-btn" onClick={() => setKey(monthKey())}><CalendarDays className="h-4 w-4" /> This month</button>
      </div>

      <div className="vg-kpis" style={{ marginBottom: '1.1rem' }}>
        <Kpi label="My income" value={INR(m.income.filter(i => i.entity === entityId).reduce((a, b) => a + b.amount, 0))} cls="vg-pos" info="Income recorded for you this month." />
        <Kpi label="My spend" value={INR(t.byEntity[entityId] ?? 0)} info="Your share of everything this month — your own plus your part of shared and common." />
        <Kpi label="Common income" value={INR(commonIncome)} cls="vg-pos" info="Money paid into the shared Lamba Household account this month." />
        <Kpi label="Common expenditure" value={INR(commonExpenses)} info="Spending from the shared Lamba Household account this month." />
        <Kpi label={bal >= 0 ? 'You are owed' : 'You owe'} small value={INR(Math.abs(bal))} cls={bal >= 0 ? 'vg-pos' : 'vg-neg'} info="Net once everyone settles the shared bills." />
      </div>

      {!isDash && !isHousehold && curEnv && <EnvelopeImpact items={envItems} entities={entities} env={curEnv} viewer={entityId} />}

      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
          {isDash ? (
            <div className="vg-subtabs">
              <button className="vg-subtab" data-on={pbucket === 'regular'} onClick={() => setPbucket('regular')}>Regular expense<span className="vg-count">{pCounts.regular}</span></button>
              <button className="vg-subtab" data-on={pbucket === 'emi'} onClick={() => setPbucket('emi')}>EMIs<span className="vg-count">{pCounts.emi}</span></button>
            </div>
          ) : isHousehold ? (
            <div className="vg-subtabs">
              <button className="vg-subtab" data-on={bucket === 'common'} onClick={() => setBucket('common')}>Common<span className="vg-count">{counts.common}</span></button>
              <button className="vg-subtab" data-on={bucket === 'emi'} onClick={() => setBucket('emi')}>EMIs<span className="vg-count">{counts.emi}</span></button>
            </div>
          ) : (
            <p className="vg-sec" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><TagIcon className="h-4 w-4" /> {curEnv?.name} · {envItems.length} item{envItems.length === 1 ? '' : 's'}</p>
          )}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button className="vg-btn" onClick={() => fileRef.current?.click()} disabled={reading}>{reading ? <Loader2 className="h-4 w-4 vg-spin" /> : <Camera className="h-4 w-4" />} Receipt</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onReceipt(e.target.files)} />
            <button className="vg-btn vg-btn-primary" onClick={() => openAdd(isDash ? (pbucket === 'emi' ? 'emi' : 'personal') : isHousehold ? bucket : 'common')}><Plus className="h-4 w-4" /> Add</button>
          </div>
        </div>
        {isDash && <p className="vg-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.7rem' }}>Your personal expenses — money borne entirely by you. Common and shared items live under <b>Lamba Household</b> and the other envelopes.</p>}
        {receiptWarn && <p className="vg-neg" style={{ fontSize: '0.8rem', margin: '0 0 0.7rem', display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{receiptWarn}</span><button className="vg-icobtn" onClick={() => setReceiptWarn(null)}><X className="h-4 w-4" /></button></p>}
        <ExpenseTable rows={rows} entities={entities} shareCols={shareColumns(rows, entities)}
          member={{ entityId, lockedIds: underReview }}
          onEdit={openEdit} onDelete={del} onTogglePaid={togglePaid}
          emptyLabel={`Nothing in ${isDash ? (pbucket === 'emi' ? 'personal EMIs' : 'personal expenses') : isHousehold ? bucket : (curEnv?.name ?? 'this envelope')}. Use Add or snap a Receipt.`} />
        <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.6rem' }}>Adding or changing a common/shared item sends it to the tagged person to approve; your own personal ones apply straight away.</p>
      </div>

      {isHousehold && <CommonReconcile doc={doc} k={k} entities={entities} me={{ role: 'member', entityId }} action={action} />}

      <div className="vg-grid2">
        {isDash && <MemberIncomeCard rows={m.income.filter(i => i.entity === entityId)} monthKey={k}
          onSave={rows => action({ action: 'setMonthIncome', monthKey: k, income: rows })} />}
        {isHousehold && <CommonIncomeCard doc={doc} k={k} entities={entities} me={{ role: 'member', entityId }} action={action} />}
        <div className="vg-card vg-pad">
          <p className="vg-sec">Where it goes</p>
          {cats.length ? <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}><Donut data={cats} /><div style={{ flex: 1, minWidth: 160 }}><Legend items={cats} /></div></div> : <p className="vg-muted">Add expenses to see the breakdown.</p>}
        </div>
        {bears.length > 0 && <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}><p className="vg-sec">Who bears what</p><StackBar parts={bears} /></div>}
      </div>

      {isDash && <div style={{ marginTop: '1.1rem' }}><EnvelopeImpactList envelopes={envs} items={m.items} entities={entities} viewer={entityId} /></div>}

      {reasonPrompt && <ReasonModal title={reasonPrompt.title} onConfirm={reasonPrompt.onConfirm} onClose={() => setReasonPrompt(null)} />}
    </>
  )
}

// ---------- Member dashboard ------------------------------------
function MemberDashboard({ initialDoc, entityId, profile }: { initialDoc: FinanceDoc; entityId: string; profile?: MeLite & { email?: string } }) {
  const [doc, setDoc] = useState<FinanceDoc>(initialDoc)
  const [tab, setTab] = useState<'month' | 'settle' | 'year' | 'tags' | 'savings' | 'budget' | 'import' | 'setup' | 'approvals' | 'profile'>('month')
  const [key, setKey] = useState(monthKey())
  const [year, setYear] = useState(new Date().getFullYear())
  const [busy, setBusy] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [editing, setEditing] = useState<{ item: Item; onSave: (it: Item) => void } | null>(null)
  const [meState, setMeState] = useState<(MeLite & { email?: string }) | undefined>(profile)
  const me = { role: 'member' as const, entityId }

  async function action(payload: Record<string, unknown>) {
    setBusy('saving')
    try {
      const r = await fetch('/api/vault/finance/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json().catch(() => ({}))
      if (d.doc) setDoc(d.doc as FinanceDoc)
      setBusy('saved'); setTimeout(() => setBusy('idle'), 1400)
      return d
    } catch { setBusy('idle'); return null }
  }

  const pending = (doc.proposals ?? []).filter(p => p.approvers.includes(entityId))
  const TABS = [
    { id: 'month', label: 'This month', icon: CalendarDays },
    { id: 'settle', label: 'Settlement', icon: Scale },
    { id: 'year', label: 'Year', icon: Wallet },
    { id: 'tags', label: 'Tags', icon: TagIcon },
    { id: 'savings', label: 'My Savings', icon: PiggyBank },
    { id: 'import', label: 'Import', icon: FileSpreadsheet },
    { id: 'setup', label: 'Budget', icon: Target },
    { id: 'approvals', label: `Approvals${pending.length ? ` (${pending.length})` : ''}`, icon: BellRing },
  ] as ShellTab[]

  const shellMe: MeLite = { role: 'member', username: meState?.username, firstName: meState?.firstName, name: meState?.name, avatar: meState?.avatar }

  return (
    <Shell saveState={busy} me={shellMe} tabs={TABS} activeTab={tab} onTab={id => setTab(id as typeof tab)}>
      {tab === 'month' && <MemberMonth doc={doc} entityId={entityId} k={key} setKey={setKey} action={action} openEditor={setEditing} />}
      {tab === 'settle' && <SettlementTab doc={doc} me={me} k={key} setKey={setKey} action={action} />}
      {tab === 'year' && <YearTab doc={doc} year={year} setYear={setYear} openMonth={k => { setKey(k); setTab('month') }} />}
      {tab === 'tags' && <TagsTab doc={doc} />}
      {tab === 'savings' && <MemberSavings doc={doc} entityId={entityId} onSave={rows => action({ action: 'setSavings', savings: rows })} />}
      {tab === 'budget' && <BudgetTab doc={doc} me={me} onSaveBudget={(_who, b) => action({ action: 'setBudget', budget: b })} />}
      {tab === 'setup' && <MemberSetup doc={doc} entityId={entityId} openTemplate={(item, section, op) => setEditing({ item, onSave: it => action({ action: 'proposeTemplate', item: it, section, op }) })} onRemove={(item, section) => action({ action: 'proposeTemplate', item, section, op: 'delete' })} />}
      {tab === 'import' && <ImportTab doc={doc} me={me} onImport={(rows, owner) => action({ action: 'importRows', rows, owner })} />}
      {tab === 'approvals' && <ApprovalsTab doc={doc} me={me} onDecide={(id, kind) => action({ action: kind, id })} onRevoke={id => action({ action: 'revoke', id })} />}
      {tab === 'profile' && <ProfileTab me={meState} onSaved={p => setMeState(m => ({ ...(m ?? { role: 'member' }), ...p }))} />}

      {editing && (
        <ExpenseEditor item={editing.item} entities={doc.entities} envelopes={doc.envelopes ?? []} categories={doc.categories} onAddCategory={() => {}} allowNewCategory={false}
          onSave={it => { editing.onSave(it); setEditing(null) }} onClose={() => setEditing(null)} />
      )}
    </Shell>
  )
}

// ---------- Import from bank statement --------------------------
type ImpRow = StatementRow & { shareWith?: string; sharePct?: number; tags?: string; envelope?: string }
function ImportTab({ doc, me, onImport }: {
  doc: FinanceDoc; me: { role: 'super' | 'member'; entityId: string | null }
  onImport: (rows: { date: string; name: string; amount: number; type: 'debit' | 'credit'; category?: string; note?: string; ref?: string; shareWith?: string; sharePct?: number; tags?: string[]; envelope?: string }[], owner: string) => Promise<{ added?: number; proposed?: number; skipped?: number } | null | void> | void
}) {
  const [rows, setRows] = useState<ImpRow[]>([])
  const [fileName, setFileName] = useState('')
  const [owner, setOwner] = useState(me.role === 'super' ? 'bhawneet' : (me.entityId ?? ''))
  const [done, setDone] = useState(0)
  const [proposedN, setProposedN] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const persons = doc.entities.filter(e => e.kind === 'person')
  const others = persons.filter(p => p.id !== owner)
  const catNames = doc.categories.map(c => c.name)

  async function onFile(files: FileList | null) {
    const f = files?.[0]; if (!f) return
    setFileName(f.name); setDone(0); setProposedN(0)
    try {
      const text = await f.text()
      const parsed = parseStatement(text)
      const seen = new Set<string>()
      for (const m of Object.values(doc.months)) { for (const it of m.items) if (it.ref) seen.add(it.ref); for (const inc of m.income) if (inc.ref) seen.add(inc.ref) }
      for (const p of (doc.proposals ?? [])) if (p.item?.ref) seen.add(p.item.ref)
      setRows(parsed.map(r => seen.has(r.ref) ? { ...r, include: false, dup: true } : r))
    } catch { setRows([]) }
  }
  const upd = (id: string, patch: Partial<ImpRow>) => setRows(r => r.map(x => x.id === id ? { ...x, ...patch } : x))
  const setAll = (v: boolean) => setRows(r => r.map(x => ({ ...x, include: v })))

  const selected = rows.filter(r => r.include)
  const debitTotal = selected.filter(r => r.type === 'debit').reduce((a, b) => a + b.amount, 0)
  const creditTotal = selected.filter(r => r.type === 'credit').reduce((a, b) => a + b.amount, 0)
  const ownerName = entName(doc.entities, owner)

  async function doImport() {
    const payload = selected.map(r => ({
      date: r.date, name: r.payee || r.desc, amount: r.amount, type: r.type,
      category: r.category, note: r.note, ref: r.ref,
      shareWith: r.type === 'debit' ? r.shareWith : undefined,
      sharePct: r.type === 'debit' ? r.sharePct : undefined,
      tags: r.tags ? r.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      envelope: r.envelope || HOUSEHOLD,
    }))
    const res = await onImport(payload, owner)
    setDone(res && res.added != null ? res.added : payload.length)
    setProposedN(res && res.proposed != null ? res.proposed : 0)
    setSkipped(res && res.skipped != null ? res.skipped : 0)
    setRows([])
  }

  return (
    <>
      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, color: '#241b40' }}>
            <FileSpreadsheet className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} /> Upload a <b>bank statement CSV</b>. It reads every credit and debit, guesses a category, and lets you tick which to bring in — you can fix the payee, category and add a remark first.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="vg-btn vg-btn-primary" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> {fileName ? 'Choose another' : 'Upload CSV'}</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={e => onFile(e.target.files)} />
          </div>
        </div>
        {(done > 0 || proposedN > 0 || skipped > 0) && <p className="vg-pos" style={{ marginTop: '0.6rem', marginBottom: 0 }}><Check className="h-4 w-4" style={{ display: 'inline' }} /> Added {done}{proposedN > 0 ? ` · sent ${proposedN} for approval` : ''}{skipped > 0 ? ` · skipped ${skipped} already imported` : ''}. Personal ones land in their month; shared ones wait on a yes.</p>}
      </div>

      {rows.length > 0 && (
        <>
          <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="vg-muted" style={{ fontSize: '0.85rem' }}><b style={{ color: '#241b40' }}>{selected.length}</b> of {rows.length} selected</span>
              {rows.some(r => r.dup) && <span className="vg-muted" style={{ fontSize: '0.85rem' }}>· {rows.filter(r => r.dup).length} already imported</span>}
              <span className="vg-neg" style={{ fontSize: '0.85rem' }}>− {INR(debitTotal)} out</span>
              <span className="vg-pos" style={{ fontSize: '0.85rem' }}>+ {INR(creditTotal)} in</span>
              <button className="vg-btn" onClick={() => setAll(true)}>All</button>
              <button className="vg-btn" onClick={() => setAll(false)}>None</button>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {me.role === 'super' && (
                <label className="vg-muted" style={{ fontSize: '0.8rem' }}>Paid from:&nbsp;
                  <select className="vg-select" style={{ width: 'auto', display: 'inline-block' }} value={owner} onChange={e => setOwner(e.target.value)}>
                    {persons.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              )}
              <button className="vg-btn vg-btn-primary" disabled={selected.length === 0} onClick={doImport}><Plus className="h-4 w-4" /> Add {selected.length}</button>
            </div>
          </div>

          <div className="vg-card vg-pad">
            <div className="vg-tablewrap">
              <table className="vg-table" style={{ minWidth: 1040 }}>
                <thead><tr>
                  <th style={{ width: 30 }}><input type="checkbox" title="Select / clear all" checked={rows.length > 0 && rows.every(r => r.include)} ref={el => { if (el) el.indeterminate = rows.some(r => r.include) && !rows.every(r => r.include) }} onChange={e => setAll(e.target.checked)} /></th><th style={{ width: 62 }}>Date</th><th>Payee</th>
                  <th style={{ width: 140 }}>Category</th><th style={{ width: 52 }}>In/Out</th>
                  <th className="num" style={{ width: 92 }}>Amount</th>
                  <th style={{ width: 96 }}>Paid from</th>
                  <th style={{ width: 240 }}>Split</th>
                  <th style={{ width: 140 }}>Envelope</th>
                  <th style={{ width: 130 }}>Remark</th>
                  <th style={{ width: 120 }}>Tag / event</th>
                </tr></thead>
                <tbody>
                  {rows.map(r => {
                    const opts = catNames.includes(r.category) ? catNames : [r.category, ...catNames]
                    const isDebit = r.type === 'debit'
                    const shared = !!r.shareWith && (r.sharePct ?? 0) > 0
                    return (
                      <tr key={r.id} style={{ opacity: r.include ? 1 : 0.45 }}>
                        <td><input type="checkbox" checked={r.include} onChange={e => upd(r.id, { include: e.target.checked })} /></td>
                        <td className="vg-muted" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{r.date.slice(8) + '/' + r.date.slice(5, 7)}</td>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{r.dup && <span className="vg-chip" style={{ background: 'rgba(226,68,92,0.14)', color: 'var(--vg-neg)' }}>dup</span>}<input className="vg-input" value={r.payee} onChange={e => upd(r.id, { payee: e.target.value })} title={r.desc} /></div></td>
                        <td><select className="vg-select" value={r.category} onChange={e => upd(r.id, { category: e.target.value })}>{opts.map(c => <option key={c} value={c}>{c}</option>)}</select></td>
                        <td><span className="vg-chip" style={{ background: r.type === 'credit' ? 'rgba(31,157,107,0.14)' : 'rgba(226,68,92,0.14)', color: r.type === 'credit' ? 'var(--vg-pos)' : 'var(--vg-neg)' }}>{r.type === 'credit' ? 'In' : 'Out'}</span></td>
                        <td className="num">{INR(r.amount)}</td>
                        <td className="vg-muted" style={{ fontSize: '0.8rem' }}>{r.type === 'credit' ? '—' : ownerName}</td>
                        <td>
                          {isDebit ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                              <select className="vg-select" style={{ width: 'auto' }} value={shared ? 'share' : 'personal'} onChange={e => upd(r.id, e.target.value === 'share' ? { shareWith: others[0]?.id, sharePct: r.sharePct || 50 } : { shareWith: undefined, sharePct: undefined })}>
                                <option value="personal">Personal</option>
                                <option value="share">Share…</option>
                              </select>
                              {shared && others.length > 0 && <>
                                <select className="vg-select" style={{ width: 'auto' }} value={r.shareWith} onChange={e => upd(r.id, { shareWith: e.target.value })}>
                                  {others.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <input className="vg-input" type="number" min={1} max={100} style={{ width: 54, textAlign: 'right' }} value={r.sharePct ?? 50} onChange={e => upd(r.id, { sharePct: Math.max(1, Math.min(100, Number(e.target.value) || 0)) })} />
                                <span className="vg-muted" style={{ fontSize: '0.72rem' }}>% theirs</span>
                              </>}
                            </div>
                          ) : <span className="vg-muted" style={{ fontSize: '0.8rem' }}>income</span>}
                        </td>
                        <td>
                          {isDebit
                            ? <select className="vg-select" value={r.envelope ?? HOUSEHOLD} onChange={e => upd(r.id, { envelope: e.target.value })}>{(doc.envelopes ?? []).map(env => <option key={env.id} value={env.id}>{env.name}</option>)}</select>
                            : <span className="vg-muted" style={{ fontSize: '0.8rem' }}>—</span>}
                        </td>
                        <td><input className="vg-input" value={r.note} placeholder="optional" onChange={e => upd(r.id, { note: e.target.value })} /></td>
                        <td><input className="vg-input" value={r.tags ?? ''} placeholder="e.g. Ooty 2026" onChange={e => upd(r.id, { tags: e.target.value })} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.6rem' }}>
              Each debit is <b>paid from {ownerName}</b>. Leave it <b>Personal</b> (lands on that profile, no split) or choose <b>Share…</b>, pick the person and their %; that one goes to them to approve before it joins the shared tracker. Credits are recorded as private income. Add a <b>Tag</b> to group an expense under an event (e.g. a trip) regardless of its category.
            </p>
          </div>
        </>
      )}
    </>
  )
}

// ---------- Member: Setup (edits route through approval) --------
function MemberSetup({ doc, entityId, openTemplate, onRemove }: {
  doc: FinanceDoc; entityId: string
  openTemplate: (item: Item, section: 'monthly' | 'emis' | 'annual', op: 'add' | 'update') => void
  onRemove: (item: Item, section: 'monthly' | 'emis' | 'annual') => void
}) {
  const mkNew = (section: 'monthly' | 'emis' | 'annual'): Item => {
    const base = { id: uid(section), name: '', amount: 0, paidBy: entityId, alloc: { mode: 'single', who: entityId } as Alloc, envelope: HOUSEHOLD }
    if (section === 'emis') return { ...base, kind: 'emi', startDate: monthKey() + '-01', endDate: null }
    if (section === 'annual') return { ...base, kind: 'annual', dueDate: monthKey() + '-15' }
    return { ...base, kind: 'monthly' }
  }

  const Section = ({ title, section }: { title: string; section: 'monthly' | 'emis' | 'annual' }) => (
    <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
        <p className="vg-sec" style={{ margin: 0 }}>{title}</p>
        <button className="vg-btn vg-btn-primary" onClick={() => openTemplate(mkNew(section), section, 'add')}><Plus className="h-4 w-4" /> Add</button>
      </div>
      <div className="vg-tablewrap">
        <table className="vg-table" style={{ minWidth: 560 }}>
          <thead><tr>
            <th>Item</th><th>Paid by</th><th>Shared</th>
            <th className="num">{section === 'annual' ? 'Amount/yr' : 'Amount'}</th>
            {section === 'emis' && <><th style={{ width: 100 }}>Starts</th><th style={{ width: 100 }}>Ends</th></>}
            {section === 'annual' && <th style={{ width: 140 }}>Appears in month</th>}
            <th style={{ width: 80 }}></th>
          </tr></thead>
          <tbody>
            {doc.template[section].map(it => {
              const mine = isPersonalTo(it, entityId, doc.entities)
              return (
                <tr key={it.id}>
                  <td className="vg-nm" style={{ fontWeight: 600 }}>{it.name || <span className="vg-muted">Untitled</span>}{!mine && <span className="vg-chip" style={{ marginLeft: 6 }}>shared</span>}</td>
                  <td><span className="vg-chip" style={{ background: entColor(doc.entities, it.paidBy) + '22', color: entColor(doc.entities, it.paidBy) }}>{entName(doc.entities, it.paidBy)}</span></td>
                  <td className="vg-muted" style={{ fontSize: '0.8rem' }}>{shareSummary(it, doc.entities)}</td>
                  <td className="num">{INR(it.amount)}</td>
                  {section === 'emis' && <>
                    <td className="vg-muted" style={{ fontSize: '0.8rem' }}>{fmtMon(it.startDate)}</td>
                    <td className="vg-muted" style={{ fontSize: '0.8rem' }}>{it.endDate ? fmtMon(it.endDate) : 'Open'}</td>
                  </>}
                  {section === 'annual' && <td className="vg-muted" style={{ fontSize: '0.8rem' }}>{fmtMon(it.dueDate)}</td>}
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="vg-icobtn" title={mine ? 'Edit' : 'Propose a change (needs approval)'} onClick={() => openTemplate(it, section, 'update')}><Pencil className="h-4 w-4" /></button>
                      <button className="vg-icobtn" title={mine ? 'Remove' : 'Propose removal (needs approval)'} onClick={() => onRemove(it, section)}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {doc.template[section].length === 0 && <tr><td colSpan={section === 'emis' ? 7 : section === 'annual' ? 6 : 5} className="vg-muted" style={{ textAlign: 'center', padding: '1rem' }}>Nothing yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <>
      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        <p style={{ margin: 0, color: '#241b40' }}>
          <SlidersHorizontal className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} /> Your household&rsquo;s <b>recurring</b> items. Add or change anything here — items that are <b>only yours</b> apply straight away, while anything <b>common or shared</b> is sent to the tagged person to approve first. You only see common items and ones that involve you.
        </p>
      </div>
      <div className="vg-grid2">
        <Section title="Monthly recurring" section="monthly" />
        <Section title="EMIs & loans" section="emis" />
        <Section title="Yearly items" section="annual" />
      </div>
    </>
  )
}
