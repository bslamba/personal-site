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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Loader2, Check,
  CalendarDays, Pencil, X, Camera, Users, PiggyBank, Wallet, SlidersHorizontal,
  Equal, Target, BellRing, ShieldCheck, Upload, FileSpreadsheet, KeyRound, Tag as TagIcon, Scale, WalletCards, Landmark, IndianRupee,
  UserCheck,
} from 'lucide-react'
import {
  type FinanceDoc, type MonthData, type Item, type IncomeItem, type Entity,
  type SavingItem, type Alloc, type Bucket, type Template, type Category,
  type EntityBudget, type PlannedItem, type Proposal,
  seedDoc, uid, monthKey, monthView, totals, byCategory, shares,
  putMonthOverride, deleteMonthTemplate, setMonthPaid,
  classify, INR, monthLabel, entName, entColor, ENTITY_COLORS,
  emptyBudget, categoryOf, detectCategory, isPersonalTo, entityReferences,
  computeSettlement, type SettleTransfer,
  type Envelope, envelopeShares, HOUSEHOLD, itemInEnvelope, visibleEnvelopes, bearerShares,
  personalEnvId, bearersOf, loanView, loanYear, fyOf, type AuditEntry, type AuditChange,
  forecast, sinkingFund, upiLink, isUpiId, reconcile, type Recon, type ForecastMonth, type SinkingRow,
  debtOverTime, debtFreeBy, simulatePrepay, type DebtPoint, type LoanView,
} from '@/lib/finance-data'
import { parseStatement, type StatementRow } from '@/lib/statement'
import { VaultTopBar, Hello, CountUp, type DockItem } from '@/components/vault/vault-chrome'
import { SheetButton, ClosedBanner } from '@/components/vault/finance-sheets'
import { AccessTab, SplitPreview, ProfileSwitcher, ActingBanner, ErrorToast, permFrom, type ActingInfo } from '@/components/vault/finance-access'
import IdleLogout from '@/components/vault/idle-logout'

const CAT_COLORS: Record<string, string> = {
  'Loans & EMIs': '#6d4bd8', 'Home & Utilities': '#4b7bec', 'Food & Groceries': '#1f9d6b',
  'Vehicles & Travel': '#e8963a', 'Insurance & Taxes': '#b0479a', 'Subscriptions': '#5bc0d0', 'Other': '#9b93b8',
}
const PALETTE = ['#6d4bd8', '#4b7bec', '#1f9d6b', '#e8963a', '#b0479a', '#5bc0d0', '#9b93b8', '#e2445c']
/** A person's or category's colour as TEXT: mixed toward the theme's ink so
 *  it keeps its hue but always reads on light and dark themes alike. */
const inkOf = (c: string) => `color-mix(in oklab, ${c} 55%, var(--vg-ink))`
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
      <circle cx={cx} cy={cy} r={rad} fill="none" stroke="color-mix(in srgb, var(--vg-ink-faint) 12%, transparent)" strokeWidth={stroke} />
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
          <b style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--vg-ink)' }}>{INR(it.value)}</b>
        </span>
      ))}
    </div>
  )
}
function StackBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const t = parts.reduce((s, p) => s + p.value, 0) || 1
  return (
    <div>
      <div style={{ display: 'flex', height: 26, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--vg-edge)' }}>
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
        <span key={p.id} className="vg-chip" style={{ background: p.color + '1c', color: inkOf(p.color), fontSize: '0.72rem', fontWeight: 600 }}>
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
function ExpenseTable({ rows, entities, shareCols, onEdit, onDelete, onTogglePaid, member, emptyLabel, readOnly }: {
  rows: Item[]; entities: Entity[]; shareCols: string[]
  onEdit: (it: Item) => void; onDelete: (it: Item) => void; onTogglePaid: (it: Item, v: boolean) => void
  member?: { entityId: string; lockedIds: Set<string | undefined> }
  emptyLabel: string
  readOnly?: boolean          // a closed month: shown, never changed
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
            {cols.length > 0 && <th colSpan={cols.length} style={{ textAlign: 'center', borderBottom: '1px solid color-mix(in srgb, var(--vg-accent) 15%, transparent)' }}>Borne by — each share&rsquo;s amount</th>}
            <th rowSpan={2} className="num">Amount</th>
            <th rowSpan={2} style={{ width: 42 }}>Paid</th>
            <th rowSpan={2} style={{ width: 76 }}></th>
          </tr>
          <tr>{cols.map(id => <th key={id} className="num" style={{ color: inkOf(entColor(entities, id)), fontSize: '0.76rem' }}>{colLabel(entities, id)}</th>)}</tr>
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
                  {locked && <span className="vg-chip" style={{ marginLeft: 6, background: 'rgba(224,112,60,0.14)', color: 'var(--vg-warn)' }}>under review</span>}
                </td>
                <td><span className="vg-chip" style={{ background: entColor(entities, it.paidBy) + '22', color: inkOf(entColor(entities, it.paidBy)) }}>{entName(entities, it.paidBy)}</span></td>
                {cols.map(id => { const a = amtFor(it, id); return <td key={id} className="num" style={{ color: a > 0.5 ? inkOf(entColor(entities, id)) : 'var(--vg-ink-faint)', fontVariantNumeric: 'tabular-nums' }}>{a > 0.5 ? INR(a) : '—'}</td> })}
                <td className="num" style={{ fontWeight: 600 }}>{INR(it.amount)}</td>
                <td style={{ textAlign: 'center' }}>{readOnly ? (it.paid ? <Check className="h-4 w-4" style={{ color: 'var(--vg-pos)', display: 'inline' }} aria-label="Paid" /> : <span className="vg-muted">—</span>) : (!member || mine) ? <input type="checkbox" checked={!!it.paid} onChange={e => onTogglePaid(it, e.target.checked)} /> : <span className="vg-muted">—</span>}</td>
                <td>
                  {!readOnly && <div style={{ display: 'flex', gap: 4 }}>
                    <button className="vg-icobtn" disabled={locked} title={member ? (locked ? 'An edit is already waiting for approval' : mine ? 'Edit' : 'Propose a change (needs approval)') : 'Edit'} onClick={() => onEdit(it)}><Pencil className="h-4 w-4" /></button>
                    <button className="vg-icobtn" disabled={locked} title={member ? (locked ? 'An edit is already waiting for approval' : mine ? 'Remove' : 'Propose removal (needs approval)') : 'Delete'} onClick={() => onDelete(it)}><Trash2 className="h-4 w-4" /></button>
                  </div>}
                </td>
              </tr>
            )
          })}
          {rows.length === 0 && <tr><td colSpan={nCols} className="vg-muted" style={{ textAlign: 'center', padding: '1.2rem' }}>{emptyLabel}</td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ borderTop: '2px solid color-mix(in srgb, var(--vg-accent) 25%, transparent)' }}>
              <td colSpan={2} style={{ fontWeight: 700, paddingTop: '0.6rem' }}>Total</td>
              {cols.map(id => <td key={id} className="num" style={{ fontWeight: 700, color: inkOf(entColor(entities, id)), paddingTop: '0.6rem' }}>{INR(colTotal(id))}</td>)}
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
      <div className="vg-card vg-pad" style={{ width: 'min(460px, 96vw)', background: 'var(--vg-glass-2)' }} onClick={e => e.stopPropagation()}>
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
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.6rem' }}>
              <div><label className="vg-lbl">Start</label><input type="date" className="vg-input" value={d.startDate ?? ''} onChange={e => set({ startDate: e.target.value || null })} /></div>
              <div><label className="vg-lbl">End</label><input type="date" className="vg-input" value={d.endDate ?? ''} onChange={e => set({ endDate: e.target.value || null })} /></div>
            </div>
            {/* The amount borrowed, the tenure and the EMI are enough to
                recover the interest rate, which is what the Loans page
                amortises. A rate can be given instead when it is known. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginTop: '0.6rem' }}>
              <div><label className="vg-lbl">Amount borrowed</label><input className="vg-input vg-num" inputMode="numeric" value={d.principal != null ? String(d.principal) : ''} placeholder="optional" onChange={e => set({ principal: e.target.value ? num(e.target.value) : null })} /></div>
              <div><label className="vg-lbl">Tenure (months)</label><input className="vg-input vg-num" inputMode="numeric" value={d.tenure != null ? String(d.tenure) : ''} placeholder="optional" onChange={e => set({ tenure: e.target.value ? num(e.target.value) : null })} /></div>
              <div><label className="vg-lbl">Rate % / year</label><input className="vg-input vg-num" inputMode="decimal" value={d.rate != null ? String(d.rate) : ''} placeholder="auto" onChange={e => set({ rate: e.target.value ? num(e.target.value) : null })} /></div>
            </div>
            <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.3rem' }}>Give the amount actually borrowed (not the total of all the instalments) and the rate is worked out for you. Set a rate yourself if the EMI has been revised since.</p>
          </>
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

        <SplitPreview item={d} entities={entities} />

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

// The Budget page holds two halves: the recurring commitments that repeat
// every month, and the limits and goals they are measured against.
type BudgetView = 'recurring' | 'limits' | 'ahead'
function BudgetSwitch({ view, onView }: { view: BudgetView; onView: (v: BudgetView) => void }) {
  return (
    <div className="vg-subtabs" style={{ marginBottom: '1.1rem' }}>
      <button className="vg-subtab" data-on={view === 'recurring'} onClick={() => onView('recurring')}>Recurring commitments</button>
      <button className="vg-subtab" data-on={view === 'limits'} onClick={() => onView('limits')}>Limits &amp; goals</button>
      <button className="vg-subtab" data-on={view === 'ahead'} onClick={() => onView('ahead')}>The year ahead</button>
    </div>
  )
}

// ---------- helpers for creating / reading ----------------------
function firstPerson(entities: Entity[]): string {
  return (entities.find(e => e.kind === 'person') ?? entities[0])?.id ?? ''
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
type Tab = 'month' | 'settle' | 'year' | 'loans' | 'approvals' | 'import' | 'entities' | 'setup' | 'profile' | 'tags' | 'access'
interface Editing { item: Item; commit: (it: Item) => void; remove?: () => void }

export default function FinanceDashboard({ initialRole }: { initialRole?: 'super' | 'member' }) {
  const [doc, setDoc] = useState<FinanceDoc | null>(null)
  const [tab, setTab] = useState<Tab>('month')
  const [key, setKey] = useState<string>(monthKey())
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'conflict'>('idle')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [setupDraft, setSetupDraft] = useState<Template | null>(null)
  const [budgetView, setBudgetView] = useState<BudgetView>('recurring')
  const [me, setMe] = useState<{ role: 'super' | 'member'; entityId: string | null; username?: string; name?: string; firstName?: string; lastName?: string; email?: string; avatar?: string } | null>(null)
  const firstLoad = useRef(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const base = useRef('')             // the stored version this page is editing on top of
  const fromServer = useRef(false)    // the next doc change came from the server, don't save it back

  useEffect(() => {
    let live = true
    fetch('/api/vault/finance')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then(d => { if (live) { base.current = (d.doc as FinanceDoc)?.updatedAt ?? ''; setDoc(d.doc as FinanceDoc); setMe(d.me ?? { role: 'super', entityId: null }) } })
      .catch(() => { if (live) { setDoc(seedDoc()); setMe({ role: 'super', entityId: null }) } })
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (!doc) return
    if (firstLoad.current) { firstLoad.current = false; return }
    // A doc that just came back from the server is already saved — writing it
    // straight back would be a pointless round trip (and, after a conflict,
    // would fight whatever we just reloaded).
    if (fromServer.current) { fromServer.current = false; return }
    // No known base version means the sheet never loaded (we are showing the
    // seeded fallback). Saving that would overwrite the real document with an
    // empty one, so this page stays read-only until a load succeeds.
    if (!base.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = setTimeout(async () => {
      try {
        const r = await fetch('/api/vault/finance', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc, baseUpdatedAt: base.current }),
        })
        const d = await r.json().catch(() => ({}))
        if (r.status === 409) {
          // Someone else changed the sheet first. Take their version rather
          // than overwriting it, and say so — the last edit needs redoing.
          if (d.doc) { fromServer.current = true; base.current = (d.doc as FinanceDoc).updatedAt; setDoc(d.doc as FinanceDoc) }
          setSaveState('conflict')
          return
        }
        if (d.updatedAt) base.current = d.updatedAt
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
  const [actErr, setActErr] = useState<string | null>(null)
  const runAction = useCallback(async (payload: Record<string, unknown>) => {
    try {
      const r = await fetch('/api/vault/finance/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json().catch(() => ({}))
      if (d.doc) { fromServer.current = true; base.current = (d.doc as FinanceDoc).updatedAt; setDoc(d.doc as FinanceDoc) }
      setActErr(d.error ? String(d.error) : !r.ok ? 'That did not go through. Please try again.' : null)
      return d
    } catch { setActErr('Could not reach the server — check your connection.'); return null }
  }, [])

  if (!doc || !me) return <Shell role={initialRole}><p className="vg-empty"><Loader2 className="h-5 w-5 vg-spin" style={{ display: 'inline' }} /> Loading…</p></Shell>

  if (me.role === 'member') return <MemberApp initialDoc={doc} entityId={me.entityId ?? ''} profile={me} />

  const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
    { id: 'month', label: 'This month', icon: CalendarDays },
    { id: 'settle', label: 'Settlement', icon: Scale },
    { id: 'year', label: 'Year', icon: Wallet },
    { id: 'loans', label: 'Loans', icon: Landmark },
    { id: 'tags', label: 'Tags', icon: TagIcon },
    { id: 'import', label: 'Import', icon: FileSpreadsheet },
    { id: 'approvals', label: `Approvals${(doc.proposals?.length ? ' (' + doc.proposals.length + ')' : '')}`, icon: BellRing },
    { id: 'access', label: 'Access', icon: UserCheck },
    { id: 'entities', label: 'Admin', icon: Users },
    { id: 'setup', label: 'Budget', icon: Target },
  ]
  const superMe = { role: 'super' as const, entityId: null }

  const setupTemplate = setupDraft ?? doc.template
  const setupDirty = setupDraft !== null && JSON.stringify(setupDraft) !== JSON.stringify(doc.template)
  const setSetupTemplate = (fn: (t: Template) => Template) => setSetupDraft(prev => fn(structuredClone(prev ?? doc.template) as Template))
  const saveSetup = () => {
    const draft = structuredClone(setupDraft ?? doc.template) as Template
    patchDoc(d => { d.template = draft; return d })
    setSetupDraft(null)
  }

  return (
    <Shell saveState={saveState} me={me} tabs={TABS} activeTab={tab} onTab={id => setTab(id as Tab)}>
      {tab === 'access' && <AccessTab doc={doc} me={superMe} action={runAction} />}
      {tab === 'month' && <MonthTab doc={doc} k={key} setKey={setKey} patchMonth={patchMonth} openEditor={setEditing} action={runAction} />}
      {tab === 'settle' && <SettlementTab doc={doc} me={me} k={key} setKey={setKey} action={runAction} />}
      {tab === 'year' && <YearTab doc={doc} year={year} setYear={setYear} openMonth={k => { setKey(k); setTab('month') }} />}
      {tab === 'tags' && <TagsTab doc={doc} />}
      {tab === 'loans' && <LoansTab doc={doc} me={{ role: 'super', entityId: null }} />}
      {tab === 'approvals' && <ApprovalsTab doc={doc} me={me} onDecide={(id, kind) => runAction({ action: kind, id })} onRevoke={id => runAction({ action: 'revoke', id })} onRevert={(auditId, reason) => runAction({ action: 'revertChange', auditId, reason })} />}
      {tab === 'import' && <ImportTab doc={doc} me={{ role: 'super', entityId: null }} onImport={(rows, owner) => runAction({ action: 'importRows', rows, owner })} />}
      {tab === 'entities' && <EntitiesTab doc={doc} patchDoc={patchDoc} />}
      {tab === 'setup' && (
        <>
          <BudgetSwitch view={budgetView} onView={setBudgetView} />
          {budgetView === 'recurring'
            ? <SetupTab entities={doc.entities} draft={setupTemplate} setDraft={setSetupTemplate} dirty={setupDirty} onSave={saveSetup} onDiscard={() => setSetupDraft(null)} openEditor={setEditing} envelopes={doc.envelopes ?? []} />
            : budgetView === 'ahead'
              ? <AheadTab doc={doc} me={{ role: 'super', entityId: null }} />
              : <BudgetTab doc={doc} me={{ role: 'super', entityId: null }} onSaveBudget={(who, b) => patchDoc(d => { if (who === 'family') d.budgets.family = b; else d.budgets.byEntity[who] = b; return d })} />}
        </>
      )}
      {tab === 'profile' && <ProfileTab me={me} onSaved={p => setMe(m => (m ? { ...m, ...p } : m))} />}
      <ErrorToast text={actErr} onClose={() => setActErr(null)} />

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
  const label = (me?.firstName || me?.name || me?.username || '').trim()
  const initials = label.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <span className="vg-avatar" style={{ width: size + 4, height: size + 4, cursor: 'default' }}>
      <span className="vg-avatar-in" style={{ width: size, height: size, fontSize: size * 0.38, borderWidth: Math.max(2, size / 16) }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a small data-URL avatar, nothing to optimise */}
        {me?.avatar ? <img src={me.avatar} alt="" /> : initials}
      </span>
    </span>
  )
}

interface ShellTab { id: string; label: string; icon: typeof Wallet }
function Shell({ children, saveState, me, tabs, activeTab, onTab, role }: {
  children: React.ReactNode
  saveState?: 'idle' | 'saving' | 'saved' | 'conflict'
  me?: MeLite
  tabs?: ShellTab[]
  activeTab?: string
  onTab?: (id: string) => void
  role?: MeLite['role']          // known before `me` loads, for the wrapper class only
}) {
  const firstName = (me?.firstName || me?.name || me?.username || '').split(' ')[0]
  // "Approvals (3)" becomes a Dock icon named Approvals with a red 3 badge.
  const items: DockItem[] = (tabs ?? []).map(t => {
    const m = t.label.match(/^(.*?)\s*\((\d+)\)$/)
    return { id: t.id, label: m ? m[1] : t.label, icon: t.icon, badge: m ? Number(m[2]) : undefined }
  })
  const isMember = (me?.role ?? role) === 'member'
  return (
    <div className={`vg vg-root${isMember ? ' vg-member' : ''}`}>
      <IdleLogout />
      <VaultTopBar items={items} active={activeTab} onPick={id => onTab?.(id)}
        me={me} onProfile={me ? () => onTab?.('profile') : undefined} profileOn={activeTab === 'profile'}
        homeHref={isMember ? '/vault/finance' : '/vault'} status={saveState} />
      <div className="vg-wrap">
        {me && <Hello name={firstName} />}
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
function EnvelopeSelect({ envelopes, value, onChange, includeDash = true }: {
  envelopes: Envelope[]; value: string; onChange: (id: string) => void; includeDash?: boolean
}) {
  // Personal envelopes are surfaced as their own named entries (e.g. "Gurneet's
  // Personal") rather than duplicated under a generic "My Dashboard" option —
  // except for the viewer's own, which "My Dashboard" IS (see includeDash).
  const ordered = [...envelopes].sort((a, b) => (a.system ? 0 : 1) - (b.system ? 0 : 1))
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <WalletCards className="h-4 w-4" style={{ color: 'var(--vg-accent)' }} />
      <select className="vg-select" value={value} onChange={e => onChange(e.target.value)} style={{ maxWidth: 240, fontWeight: 600 }} aria-label="View">
        {includeDash && <option value={DASH}>My Dashboard</option>}
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
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: 12, background: mine ? 'color-mix(in srgb, var(--vg-accent) 10%, transparent)' : 'color-mix(in srgb, var(--vg-solid) 55%, transparent)' }}>
                <span><b style={{ color: inkOf(entColor(entities, tr.from)) }}>{entName(entities, tr.from)}</b> <span className="vg-muted">pays</span> <b style={{ color: inkOf(entColor(entities, tr.to)) }}>{entName(entities, tr.to)}</b></span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{INR(tr.amount)}</b>
              </div>
            )
          })}
        </div>
      ) : <p className="vg-muted" style={{ margin: 0 }}>All square — nobody owes anyone in this envelope.</p>}
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
            <tr style={{ borderTop: '2px solid color-mix(in srgb, var(--vg-accent) 25%, transparent)' }}>
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
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0.5rem 0.8rem', borderRadius: 12, background: 'color-mix(in srgb, var(--vg-solid) 60%, transparent)', minWidth: 190 }}>
                <span><b style={{ color: inkOf(e.color) }}>{e.name}</b> <span className="vg-muted">{net < 0 ? 'owes common' : 'can take out'}</span></span>
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
function CommonIncomeCard({ doc, k, entities, me, action, locked }: {
  doc: FinanceDoc; k: string; entities: Entity[]
  me: { role: 'super' | 'member'; entityId: string | null }
  action: (payload: Record<string, unknown>) => Promise<{ doc?: FinanceDoc } | null | void> | void
  locked?: boolean
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
        {!editing && !locked && <button className="vg-btn" onClick={() => { setAmount(String(current)); setEditing(true) }}><Pencil className="h-4 w-4" /> Edit</button>}
      </div>
      {!editing ? null : (
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
  // Super has no "My Dashboard" of their own — each person's Personal
  // envelope (their My Dashboard) is just another envelope to pick from.
  const [env, setEnv] = useState<string>(HOUSEHOLD)
  const [reading, setReading] = useState(false)
  const [receiptWarn, setReceiptWarn] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const entities = doc.entities
  const envs = visibleEnvelopes(doc, null)                 // super sees every envelope
  const curEnv = envs.find(e => e.id === env) ?? envs[0]
  const isHousehold = !curEnv || curEnv.system

  useEffect(() => { if (!doc.months[k]) patchMonth(k, m => m) /* eslint-disable-next-line */ }, [k])

  const closed = !!doc.settlements?.[k]?.closed
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
  const rows = isHousehold ? hhRows : envItems
  const counts = { common: 0, emi: 0 }
  hhItems.forEach(it => { const c = classify(it, entities); if (c === 'common') counts.common++; else if (c === 'emi') counts.emi++ })
  const commonIncome = m.income.filter(i => i.entity === 'common').reduce((s, i) => s + (i.amount || 0), 0)
  const commonExpenses = m.items.filter(it => it.paidBy === 'common').reduce((s, it) => s + (it.amount || 0), 0)

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
          <EnvelopeSelect envelopes={envs} value={env} onChange={setEnv} includeDash={false} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <SheetButton k={k} />
          <button className="vg-btn" onClick={() => setKey(monthKey())}><CalendarDays className="h-4 w-4" /> This month</button>
        </div>
      </div>

      {closed && <ClosedBanner k={k} closedAt={doc.settlements?.[k]?.closedAt} closedBy={doc.settlements?.[k]?.closedBy} />}

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

      {!isHousehold && curEnv && !curEnv.personalOf && <EnvelopeImpact items={envItems} entities={entities} env={curEnv} />}

      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
          {isHousehold ? (
            <div className="vg-subtabs">
              <button className="vg-subtab" data-on={bucket === 'common'} onClick={() => setBucket('common')}>Common<span className="vg-count">{counts.common}</span></button>
              <button className="vg-subtab" data-on={bucket === 'emi'} onClick={() => setBucket('emi')}>EMIs<span className="vg-count">{counts.emi}</span></button>
            </div>
          ) : (
            <p className="vg-sec" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><TagIcon className="h-4 w-4" /> {curEnv?.name} · {envItems.length} item{envItems.length === 1 ? '' : 's'}</p>
          )}
          {!closed && <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button className="vg-btn" onClick={() => fileRef.current?.click()} disabled={reading}>{reading ? <Loader2 className="h-4 w-4 vg-spin" /> : <Camera className="h-4 w-4" />} Receipt</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onReceipt(e.target.files)} />
            <button className="vg-btn vg-btn-primary" onClick={() => openNew(isHousehold ? bucket : 'common')}><Plus className="h-4 w-4" /> Add</button>
          </div>}
        </div>
        {receiptWarn && <p className="vg-neg" style={{ fontSize: '0.8rem', margin: '0 0 0.7rem', display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{receiptWarn}</span><button className="vg-icobtn" onClick={() => setReceiptWarn(null)}><X className="h-4 w-4" /></button></p>}
        <ExpenseTable rows={rows} entities={entities} shareCols={shareColumns(rows, entities)} readOnly={closed}
          onEdit={openEdit} onDelete={delItem} onTogglePaid={togglePaid}
          emptyLabel={`Nothing in ${isHousehold ? bucket : (curEnv?.name ?? 'this envelope')}. Use Add or snap a Receipt.`} />
      </div>

      {isHousehold && !closed && <CommonReconcile doc={doc} k={k} entities={entities} me={{ role: 'super', entityId: null }} action={action} />}

      <div className="vg-grid2">
        {isHousehold && <CommonIncomeCard doc={doc} k={k} entities={entities} me={{ role: 'super', entityId: null }} action={action} locked={closed} />}

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
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: 12, background: 'color-mix(in srgb, var(--vg-solid) 55%, transparent)' }}>
                  <span><b style={{ color: inkOf(entColor(entities, tr.from)) }}>{entName(entities, tr.from)}</b> <span className="vg-muted">pays</span> <b style={{ color: inkOf(entColor(entities, tr.to)) }}>{entName(entities, tr.to)}</b></span>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{INR(tr.amount)}</b>
                </div>
              ))}
            </div>
          ) : <p className="vg-muted">{settleTxt}</p>}
        </div>

        <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
          <p className="vg-sec">Note</p>
          <textarea className="vg-input" rows={2} placeholder="Anything to remember about this month…" value={m.note ?? ''} onChange={e => patchMonth(k, mm => ({ ...mm, note: e.target.value }))} />
        </div>
      </div>

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
                  <span style={{ fontSize: 9, color: 'var(--vg-ink-soft)', fontVariantNumeric: 'tabular-nums' }}>{p.t.expense ? Math.round(p.t.expense / 1000) + 'k' : ''}</span>
                  <span style={{ width: '100%', display: 'flex', alignItems: 'flex-end', height: 130 }}>
                    <span style={{ width: '100%', height: `${(p.t.expense / max) * 100}%`, minHeight: p.t.expense ? 3 : 0, background: p.k === now ? 'linear-gradient(180deg,#e0708f,#b0479a)' : 'linear-gradient(180deg,#a06be0,#6d4bd8)', borderRadius: '6px 6px 3px 3px' }} />
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--vg-ink-faint)' }}>{MON[i]}</span>
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
        <p style={{ margin: 0, color: 'var(--vg-ink)' }}><TagIcon className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} /> Group spending by <b>event or tag</b> — a trip, a function, a project — no matter what category each expense sits in. Tag an expense from its edit form (or while importing), then pick the tag here to see the total and who bore what.</p>
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
                        <td><span className="vg-chip" style={{ background: entColor(entities, it.paidBy) + '22', color: inkOf(entColor(entities, it.paidBy)) }}>{entName(entities, it.paidBy)}</span></td>
                        <td><ShareCell it={it} entities={entities} /></td>
                        <td className="num">{INR(it.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr style={{ borderTop: '2px solid color-mix(in srgb, var(--vg-accent) 25%, transparent)' }}><td colSpan={5} style={{ fontWeight: 700 }}>Total</td><td className="num" style={{ fontWeight: 800, color: 'var(--vg-accent)' }}>{INR(total)}</td></tr></tfoot>
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
// ---------- Entities tab ----------------------------------------
interface PUser { username: string; name: string; role: 'super' | 'member'; entityId: string | null; email?: string }

function EntitiesTab({ doc, patchDoc }: { doc: FinanceDoc; patchDoc: (fn: (d: FinanceDoc) => FinanceDoc) => void }) {
  const upd = (id: string, patch: Partial<Entity>) => patchDoc(d => ({ ...d, entities: d.entities.map(e => e.id === id ? { ...e, ...patch } : e) }))
  // Removing someone who still appears on an expense would leave that expense
  // pointing at nobody — their share would silently drop out of the
  // settlement. Refuse, and say exactly what is holding them.
  const del = (id: string) => {
    const refs = entityReferences(doc, id)
    if (refs.total > 0) {
      const parts = [
        refs.items && `${refs.items} expense${refs.items === 1 ? '' : 's'}`,
        refs.income && `${refs.income} income row${refs.income === 1 ? '' : 's'}`,
        refs.savings && `${refs.savings} savings pot${refs.savings === 1 ? '' : 's'}`,
        refs.envelopes && `${refs.envelopes} envelope${refs.envelopes === 1 ? '' : 's'}`,
      ].filter(Boolean).join(', ')
      setErr(`${entName(doc.entities, id)} is still on ${parts}. Move those to someone else first — removing them now would drop their share out of every settlement.`)
      return
    }
    setErr(null)
    patchDoc(d => ({
      ...d,
      entities: d.entities.filter(e => e.id !== id),
      envelopes: (d.envelopes ?? []).filter(e => e.personalOf !== id).map(e => ({ ...e, members: e.members.filter(mm => mm !== id) })),
    }))
  }
  const add = () => patchDoc(d => {
    const id = uid('ent')
    return {
      ...d,
      entities: [...d.entities, { id, name: 'New member', kind: 'person', canPay: false, earning: false, isLiability: true, color: ENTITY_COLORS[d.entities.length % ENTITY_COLORS.length] }],
      envelopes: [...(d.envelopes ?? []), { id: personalEnvId(id), name: 'New member’s Personal', members: [id], personalOf: id }],
    }
  })

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
        <p style={{ margin: 0, color: 'var(--vg-ink)' }}><Users className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} /> These are the people (and the shared <b>Common</b> pool) you split and tag money against. Onboard a family member here — mark whether they <b>earn</b>, are a <b>dependant</b>, and whether they can <b>pay</b> (have an account money comes from). Then give them a login below.</p>
      </div>

      <div className="vg-card vg-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
          <p className="vg-sec" style={{ margin: 0 }}>Entities</p>
          <button className="vg-btn vg-btn-primary" onClick={add}><Plus className="h-4 w-4" /> Add member</button>
        </div>
        <div className="vg-tablewrap">
          <table className="vg-table" style={{ minWidth: 720 }}>
            <thead><tr><th style={{ width: 34 }}></th><th>Name</th><th style={{ width: 150 }}>Role in family</th><th style={{ width: 160 }}>UPI id</th><th style={{ width: 110 }}>Type</th><th style={{ width: 70 }}>Can pay</th><th style={{ width: 70 }}>Earns</th><th style={{ width: 90 }}>Dependant</th><th style={{ width: 70 }}>Alerts</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {doc.entities.map(e => (
                <tr key={e.id}>
                  <td><input type="color" value={e.color} onChange={ev => upd(e.id, { color: ev.target.value })} style={{ width: 26, height: 26, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} /></td>
                  <td><input className="vg-input" value={e.name} onChange={ev => upd(e.id, { name: ev.target.value })} /></td>
                  <td>{e.kind === 'person'
                    ? <input className="vg-input" list="vg-roles" placeholder="e.g. Father" value={e.role ?? ''} onChange={ev => upd(e.id, { role: ev.target.value })} />
                    : <span className="vg-muted" style={{ fontSize: '0.8rem' }}>Shared pool</span>}</td>
                  <td>
                    <input className="vg-input" placeholder="name@bank" value={e.upi ?? ''} onChange={ev => upd(e.id, { upi: ev.target.value.trim() })} />
                    {e.upi && !isUpiId(e.upi) && <span className="vg-neg" style={{ fontSize: '0.7rem', display: 'block', marginTop: 2 }}>not a UPI id — no pay button</span>}
                  </td>
                  <td><select className="vg-select" value={e.kind} onChange={ev => upd(e.id, { kind: ev.target.value as EntityKind })}><option value="person">Person</option><option value="common">Common pool</option></select></td>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" checked={e.canPay} onChange={ev => upd(e.id, { canPay: ev.target.checked })} /></td>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" checked={e.earning} onChange={ev => upd(e.id, { earning: ev.target.checked })} /></td>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" checked={e.isLiability} onChange={ev => upd(e.id, { isLiability: ev.target.checked })} /></td>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" title="Email them when they pass their own budget, or a month runs well above their usual" checked={e.alerts !== false} onChange={ev => upd(e.id, { alerts: ev.target.checked })} /></td>
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
      </div>

      <EnvelopesCard doc={doc} patchDoc={patchDoc} />
      <BackupsCard />
    </>
  )
}

// ---------- Backups (super only) --------------------------------
// A day-by-day history to fall back on. Restoring rolls back the SHARED
// picture only: private savings and income stay as they are, and so do
// settlement payments, because that money has already left the bank whatever
// this file says. Everyone sees the restore on the sheet afterwards.
interface BackupDay { day: string; size: number; takenAt?: string }
/** "18 Sep", with the year only when it is not this one. */
function dayLabel(day: string): string {
  const [y, m, d] = day.split('-')
  const mon = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short' })
  return `${Number(d)} ${mon}${y === String(new Date().getFullYear()) ? '' : ` ${y.slice(2)}`}`
}
function BackupsCard() {
  const [days, setDays] = useState<BackupDay[] | null>(null)
  const [kept, setKept] = useState(183)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const [summary, setSummary] = useState<{ label: string; from: string; to: string }[] | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/vault/finance/backups')
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error ?? 'Could not list backups'); return }
      setDays(d.days ?? []); setKept(d.keptForDays ?? 183)
    } catch { setErr('Could not list backups') }
  }, [])

  async function preview(day: string) {
    setChosen(day); setSummary(null); setReason(''); setErr(null); setDone(null)
    const r = await fetch('/api/vault/finance/backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day, preview: true }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error ?? 'Could not read that backup'); return }
    setSummary(d.summary ?? [])
  }

  async function restore() {
    if (!chosen) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/vault/finance/backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day: chosen, reason: reason.trim() }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error ?? 'Restore failed') }
      else { setDone(chosen); setChosen(null); setSummary(null); setTimeout(() => window.location.reload(), 1200) }
    } catch { setErr('Restore failed') }
    setBusy(false)
  }

  return (
    <div className="vg-card vg-pad" style={{ marginTop: '1.1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <p className="vg-sec" style={{ margin: 0 }}>
          <ShieldCheck className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} /> Backups
        </p>
        <button className="vg-btn" onClick={() => { setOpen(o => !o); if (days === null) load() }}>{open ? 'Hide' : 'Show backups'}</button>
      </div>
      <p className="vg-muted" style={{ fontSize: '0.82rem', marginTop: '0.5rem', marginBottom: 0 }}>
        The sheet is copied once a day and kept for about six months. Restoring puts the <b>shared</b> picture back to how it was on a chosen day — everyone&rsquo;s private savings and income stay as they are now, and so does every settlement payment, because that money has already moved. The restore is logged where all the profiles can see it.
      </p>

      {done && <p className="vg-pos" style={{ fontSize: '0.85rem' }}><Check className="h-4 w-4" style={{ display: 'inline', verticalAlign: '-2px' }} /> Restored to {done}. Reloading…</p>}
      {err && <p className="vg-neg" style={{ fontSize: '0.85rem' }}>{err}</p>}

      {open && (
        <div style={{ marginTop: '0.9rem' }}>
          {days === null ? <p className="vg-muted" style={{ fontSize: '0.85rem' }}><Loader2 className="h-4 w-4 vg-spin" style={{ display: 'inline' }} /> Looking…</p>
            : days.length === 0 ? <p className="vg-muted" style={{ fontSize: '0.85rem' }}>No backups yet — the first one is taken the next time the sheet changes.</p>
            : (
              <>
                <p className="vg-muted" style={{ fontSize: '0.75rem', margin: '0 0 0.5rem' }}>{days.length} day{days.length === 1 ? '' : 's'} available · kept for {kept} days</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxHeight: 220, overflowY: 'auto' }} className="slim-scroll">
                  {days.map(b => (
                    <button key={b.day} className="vg-btn" data-on={chosen === b.day}
                      style={chosen === b.day ? { borderColor: 'var(--vg-accent)', color: 'var(--vg-accent)', fontWeight: 700 } : undefined}
                      onClick={() => preview(b.day)}>
                      {dayLabel(b.day)}
                    </button>
                  ))}
                </div>
              </>
            )}

          {chosen && (
            <div className="vg-card" style={{ marginTop: '0.9rem', padding: '0.9rem 1rem', boxShadow: 'none', border: '1px solid var(--vg-accent)' }}>
              <p className="vg-sec" style={{ margin: '0 0 0.5rem' }}>Restore to {dayLabel(chosen)} {chosen.slice(0, 4)}</p>
              {summary === null ? <p className="vg-muted" style={{ fontSize: '0.85rem' }}><Loader2 className="h-4 w-4 vg-spin" style={{ display: 'inline' }} /> Reading that day…</p> : (
                <>
                  <div className="vg-tablewrap">
                    <table className="vg-table" style={{ minWidth: 360 }}>
                      <thead><tr><th></th><th className="num">Now</th><th className="num">After restoring</th></tr></thead>
                      <tbody>
                        {summary.map(r => (
                          <tr key={r.label}>
                            <td>{r.label}</td>
                            <td className="num vg-muted">{r.to}</td>
                            <td className="num" style={{ fontWeight: r.from !== r.to ? 700 : 400, color: r.from !== r.to ? 'var(--vg-accent)' : undefined }}>{r.from}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: '0.8rem' }}>
                    <label className="vg-lbl">Why are you restoring?</label>
                    <input className="vg-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. the rashan amount was changed by mistake" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '0.8rem' }}>
                    <button className="vg-btn" onClick={() => { setChosen(null); setSummary(null) }}>Cancel</button>
                    <button className="vg-btn vg-btn-primary" disabled={busy || reason.trim().length < 3} onClick={restore}>
                      {busy ? <Loader2 className="h-4 w-4 vg-spin" /> : <Check className="h-4 w-4" />} Restore the shared sheet
                    </button>
                  </div>
                  <p className="vg-muted" style={{ fontSize: '0.72rem', marginTop: '0.6rem' }}>The sheet as it stands right now is copied aside first, so this can be undone.</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Envelopes (super manages) ---------------------------
function EnvelopesCard({ doc, patchDoc }: { doc: FinanceDoc; patchDoc: (fn: (d: FinanceDoc) => FinanceDoc) => void }) {
  const persons = doc.entities.filter(e => e.kind === 'person')
  // Personal envelopes are auto-managed (one per person) — not shown here.
  const envs = (doc.envelopes ?? []).filter(e => !e.personalOf)
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
function SetupTab({ entities, draft, setDraft, dirty, onSave, onDiscard, openEditor, envelopes = [] }: {
  entities: Entity[]
  draft: Template
  setDraft: (fn: (t: Template) => Template) => void
  dirty: boolean
  onSave: () => void
  onDiscard: () => void
  openEditor: (e: Editing) => void
  envelopes?: Envelope[]
}) {
  const envName = (id?: string) => envelopes.find(e => e.id === (id ?? HOUSEHOLD))?.name ?? 'Lamba Household'

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
                <td><span className="vg-chip" style={{ background: entColor(entities, it.paidBy) + '22', color: inkOf(entColor(entities, it.paidBy)) }}>{entName(entities, it.paidBy)}</span></td>
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
        <p style={{ margin: 0, color: 'var(--vg-ink)' }}>
          <SlidersHorizontal className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} />{' '}
          {dirty ? <b>Unsaved changes</b> : 'Saved manually'} — edits here don’t save as you type. Once saved, every month follows these figures, apart from a month you have deliberately edited on its own.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {dirty && <button className="vg-btn" onClick={onDiscard}>Discard</button>}
          <button className="vg-btn vg-btn-primary" disabled={!dirty} onClick={onSave}><Check className="h-4 w-4" /> Save</button>
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

    </>
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
      <div className={`v ${cls ?? ''}`} style={small ? { fontSize: '0.95rem', lineHeight: 1.3 } : undefined}>{typeof value === 'string' && /^[−-]?₹[\d,]+$/.test(value) ? <CountUp text={value} /> : value}</div>
      {open && info && <div className="vg-pop" role="tooltip" onClick={() => setOpen(false)}>{info}</div>}
    </div>
  )
}

function catColor(name: string, cats: Category[], i = 0): string {
  return cats.find(c => c.name === name)?.color ?? CAT_COLORS[name] ?? PALETTE[i % PALETTE.length]
}

/** "14 Sept" — a statement line needs the day, not just the month. */
function fmtDay(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
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
    </div>
  )
}

// Record a payment against a settlement transfer — all of it, or part.
// Paying in instalments is ordinary, and the remainder has to stay on the
// books rather than the whole debt reading as unpaid.
function RecordPaymentModal({ tr, payee, monthLabelText, busy, onClose, onSave }: {
  tr: SettleTransfer; payee?: Entity; monthLabelText: string; busy: boolean
  onClose: () => void; onSave: (amount: number, file?: File) => void
}) {
  const [amount, setAmount] = useState(String(Math.round(tr.due)))
  const [file, setFile] = useState<File | undefined>()
  const fileRef = useRef<HTMLInputElement>(null)
  const value = Math.min(num(amount), tr.due)
  const rest = tr.due - value
  const link = upiLink(payee, value, `${monthLabelText} settlement`)

  return (
    <div className="vg-lb" onClick={onClose}>
      <div className="vg-card vg-pad" style={{ width: 'min(420px, 96vw)', background: 'var(--vg-glass-2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <p className="vg-sec" style={{ margin: 0 }}>Record a payment</p>
          <button className="vg-icobtn" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <p className="vg-muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
          {INR(tr.due)} still owed to <b>{payee?.name ?? 'the common account'}</b>
          {tr.settled > 0.5 && <> · {INR(tr.settled)} of {INR(tr.amount)} already paid</>}.
        </p>

        <label className="vg-lbl">How much was paid</label>
        <input className="vg-input vg-num" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
        <div style={{ display: 'flex', gap: 6, marginTop: '0.4rem', flexWrap: 'wrap' }}>
          <button className="vg-btn" onClick={() => setAmount(String(Math.round(tr.due)))}>All of it</button>
          <button className="vg-btn" onClick={() => setAmount(String(Math.round(tr.due / 2)))}>Half</button>
        </div>
        {rest > 0.5 && value > 0 && (
          <p className="vg-muted" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>
            {INR(rest)} would stay outstanding, and carry into next month if this one is closed.
          </p>
        )}

        {link && (
          <p style={{ marginTop: '0.8rem' }}>
            <a className="vg-btn" href={link}><IndianRupee className="h-4 w-4" /> Pay {INR(value)} by UPI</a>
            <span className="vg-muted" style={{ display: 'block', fontSize: '0.72rem', marginTop: '0.35rem' }}>
              Opens your UPI app with {payee?.upi} and the amount filled in. On a computer it will not open — pay from your phone, then record it here.
            </span>
          </p>
        )}

        <div style={{ marginTop: '0.9rem' }}>
          <label className="vg-lbl">Screenshot <span className="vg-muted" style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => setFile(e.target.files?.[0])} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="vg-btn" onClick={() => fileRef.current?.click()}><Camera className="h-4 w-4" /> {file ? 'Change' : 'Attach'}</button>
            {file && <span className="vg-muted" style={{ fontSize: '0.8rem' }}>{file.name}</span>}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1rem' }}>
          <button className="vg-btn" onClick={onClose}>Cancel</button>
          <button className="vg-btn vg-btn-primary" disabled={busy || !(value > 0)} onClick={() => onSave(value, file)}>
            {busy ? <Loader2 className="h-4 w-4 vg-spin" /> : <Check className="h-4 w-4" />} Record {INR(value)}
          </button>
        </div>
      </div>
    </div>
  )
}

// Your own UPI id, offered where it pays off: the settlement page. Without
// one, everybody else has to type your details in by hand every month.
function MyUpiCard({ entity, action }: {
  entity?: Entity
  action: (payload: Record<string, unknown>) => Promise<{ doc?: FinanceDoc } | null | void> | void
}) {
  const [value, setValue] = useState(entity?.upi ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setValue(entity?.upi ?? ''); setSaved(false) }, [entity?.upi])
  const trimmed = value.trim()
  const bad = trimmed.length > 0 && !isUpiId(trimmed)
  const dirty = trimmed !== (entity?.upi ?? '')

  return (
    <div className="vg-card vg-pad" style={{ marginTop: '1.1rem' }}>
      <p className="vg-sec" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <IndianRupee className="h-4 w-4" /> How the others pay you
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <input className="vg-input" value={value} placeholder="yourname@bank" onChange={e => { setValue(e.target.value); setSaved(false) }} />
          {bad && <p className="vg-neg" style={{ fontSize: '0.75rem', margin: '0.3rem 0 0' }}>A UPI id looks like <b>yourname@bank</b> — until it does, no one gets a pay button for you.</p>}
        </div>
        <button className="vg-btn vg-btn-primary" disabled={busy || bad || !dirty}
          onClick={async () => { setBusy(true); await action({ action: 'setUpi', upi: trimmed }); setBusy(false); setSaved(true) }}>
          {busy ? <Loader2 className="h-4 w-4 vg-spin" /> : <Check className="h-4 w-4" />} Save
        </button>
      </div>
      {saved && <p className="vg-pos" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>Saved.</p>}
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
  const [paying, setPaying] = useState<SettleTransfer | null>(null)
  const step = (d: number) => { const [y, mo] = k.split('-').map(Number); setKey(monthKey(new Date(y, mo - 1 + d, 1))) }
  const nm = (id: string) => (id === 'common' ? 'Common account' : entName(entities, id))

  async function recordPayment(tr: SettleTransfer, amount: number, file?: File) {
    setBusyKey(tr.key)
    let proofKey = ''
    if (file) {
      try {
        const safe = file.name.replace(/[^\w.\-]+/g, '_'); proofKey = `settlements/${k}-${tr.key.replace(/[^\w]+/g, '_')}-${Date.now()}-${safe}`
        const u = await fetch('/api/vault/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: proofKey, contentType: file.type }) })
        const { url } = await u.json(); if (url) await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      } catch { /* the payment still counts; the screenshot is optional */ }
    }
    await action({ action: 'settlePay', monthKey: k, transferKey: tr.key, amount, proofKey })
    setBusyKey(null); setPaying(null)
  }

  const kindChip = (kind: SettleTransfer['kind']) =>
    kind === 'common' ? <span className="vg-chip">common pot</span>
      : kind === 'carry' ? <span className="vg-chip" style={{ background: 'rgba(224,112,60,0.14)', color: 'var(--vg-warn)' }}>carried forward</span>
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
        {s.carryIn > 0.5 && <Kpi label="Carried in" value={INR(s.carryIn)} cls="vg-pos" info="Last month's surplus was left in the common account, so it pays this month's bills before anyone tops up." />}
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
              <thead><tr><th>From</th><th>To</th><th></th><th className="num">Amount</th><th className="num" style={{ width: 120 }}>Still due</th><th style={{ width: 260 }}>Status</th></tr></thead>
              <tbody>
                {s.transfers.map(tr => {
                  const done = tr.due <= 0.5
                  const part = tr.settled > 0.5 && !done
                  const payee = entities.find(e => e.id === tr.to)
                  const link = upiLink(payee, tr.due, `${monthLabel(k)} settlement`)
                  return (
                    <tr key={tr.key}>
                      <td><span className="vg-chip" style={{ background: entColor(entities, tr.from) + '22', color: inkOf(entColor(entities, tr.from)) }}>{nm(tr.from)}</span></td>
                      <td><span className="vg-chip" style={{ background: (tr.to === 'common' ? '#6d4bd8' : entColor(entities, tr.to)) + '22', color: inkOf(tr.to === 'common' ? '#6d4bd8' : entColor(entities, tr.to)) }}>{nm(tr.to)}</span></td>
                      <td>{kindChip(tr.kind)}{tr.kind === 'carry' && tr.fromMonth && <span className="vg-muted" style={{ fontSize: '0.72rem', marginLeft: 4 }}>from {fmtMon(tr.fromMonth)}</span>}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{INR(tr.amount)}</td>
                      <td className="num">
                        {done
                          ? <span className="vg-pos" style={{ fontWeight: 700 }}>settled</span>
                          : <b className="vg-neg">{INR(tr.due)}</b>}
                        {part && <span className="vg-muted" style={{ display: 'block', fontSize: '0.7rem' }}>{INR(tr.settled)} paid</span>}
                      </td>
                      <td>
                        {tr.payments.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: done ? 0 : 5 }}>
                            {tr.payments.map(pay => (
                              <span key={pay.id} style={{ fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <Check className="h-3.5 w-3.5" style={{ color: 'var(--vg-pos)' }} />
                                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{INR(pay.amount)}</b>
                                <span className="vg-muted">· {pay.by}</span>
                                {!s.closed && <button className="vg-icobtn" style={{ width: 22, height: 22 }} title="Undo this payment"
                                  onClick={() => action({ action: 'settleUnpay', monthKey: k, transferKey: tr.key, paymentId: pay.id })}><X className="h-3 w-3" /></button>}
                              </span>
                            ))}
                          </div>
                        )}
                        {!done && (s.closed
                          ? <span className="vg-neg" style={{ fontSize: '0.82rem' }}>unpaid → carried</span>
                          : (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {link && <a className="vg-btn" href={link} title={`Opens your UPI app to pay ${payee?.upi}`}><IndianRupee className="h-4 w-4" /> Pay {INR(tr.due)}</a>}
                              <button className="vg-btn" disabled={busyKey === tr.key} onClick={() => setPaying(tr)}>
                                {busyKey === tr.key ? <Loader2 className="h-4 w-4 vg-spin" /> : <Camera className="h-4 w-4" />} Record payment
                              </button>
                            </div>
                          ))}
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
            {s.contributors.length > 0 && s.shortfall > 0 && (
              <div style={{ marginTop: '0.7rem', fontSize: '0.82rem', padding: '0.5rem 0.7rem', background: 'color-mix(in srgb, var(--vg-accent) 6%, transparent)', borderRadius: 8 }}>
                <b>Common account:</b> earned {INR(s.commonIncome)}{s.carryIn > 0.5 && <> + {INR(s.carryIn)} carried in</>} − spent {INR(s.commonExpenses)} = <b style={{ color: 'var(--vg-neg)' }}>−{INR(s.shortfall)}</b> shortfall, split into {INR(s.perContributor)} each.
              </div>
            )}
            {/* A plain grid (no full-span sibling) so auto-fit correctly collapses
                any unused tracks and the cards stretch to fill the row — instead
                of being squeezed into a corner by phantom empty columns. */}
            <div style={{ marginTop: '0.7rem', display: 'grid', gap: '0.8rem', gridTemplateColumns: `repeat(${Math.max(1, Math.min(3, Object.keys(s.ledger).length))}, minmax(0, 1fr))` }}>
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
          </details>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.9rem', gap: 8, flexWrap: 'wrap' }}>
          {s.closed
            ? (me.role === 'super' && <button className="vg-btn" onClick={() => action({ action: 'reopenSettlement', monthKey: k })}>Reopen</button>)
            : <button className="vg-btn vg-btn-primary" disabled={s.transfers.length === 0} onClick={() => action({ action: 'closeSettlement', monthKey: k })}><Check className="h-4 w-4" /> Close this month</button>}
        </div>
      </div>

      {me.role === 'member' && me.entityId && <MyUpiCard entity={entities.find(e => e.id === me.entityId)} action={action} />}

      {paying && <RecordPaymentModal tr={paying} payee={entities.find(e => e.id === paying.to)} monthLabelText={monthLabel(k)} busy={busyKey === paying.key}
        onClose={() => setPaying(null)} onSave={(amount, file) => recordPayment(paying, amount, file)} />}

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

function ApprovalsTab({ doc, onDecide, onRevoke, onRevert, me }: {
  doc: FinanceDoc
  onDecide: (id: string, kind: 'accept' | 'decline') => void
  onRevoke?: (id: string) => void
  onRevert?: (auditId: string, reason: string) => Promise<{ error?: string } | null | void> | void
  me?: { role: 'super' | 'member'; entityId: string | null }
}) {
  const [undoing, setUndoing] = useState<AuditEntry | null>(null)
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
  const evColor: Record<string, string> = { propose: 'var(--vg-accent)', accept: 'var(--vg-pos)', decline: 'var(--vg-neg)', revoke: 'var(--vg-warn)', apply: 'var(--vg-ink-faint)' }

  const Card = ({ p }: { p: Proposal }) => (
    <div className="vg-card" style={{ padding: '0.9rem 1rem', boxShadow: 'none', border: '1px solid var(--vg-line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <b style={{ fontSize: '1rem' }}>{p.item.name || 'Expense'}</b> <span className="vg-chip">{editKind(p)}</span> {!p.template && <span className="vg-chip">{monthLabel(p.monthKey)}</span>}
          <div className="vg-muted" style={{ fontSize: '0.82rem', marginTop: 2 }}>
            Proposed by <b>{p.proposedByName}</b> · paid by {entName(ent, p.item.paidBy)} · {shareSummary(p.item, ent)}
          </div>
          {p.reason && <div style={{ fontSize: '0.82rem', marginTop: 4, padding: '0.35rem 0.55rem', background: 'color-mix(in srgb, var(--vg-accent) 6%, transparent)', borderLeft: '2px solid var(--vg-accent)', borderRadius: 4 }}><b>Reason:</b> {p.reason}</div>}
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
                <span className="vg-chip" style={{ background: 'rgba(224,112,60,0.14)', color: 'var(--vg-warn)' }}>waiting on {p.approvers.map(a => entName(ent, a)).join(', ')}</span>
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
      </div>

      {mineOut.length > 0 && (
        <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
          <p className="vg-sec">Your requests — waiting on others</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>{mineOut.map(p => <Card key={p.id} p={p} />)}</div>
        </div>
      )}

      <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
        <p className="vg-sec">History</p>
        {log.length === 0 ? <p className="vg-muted">No activity yet.</p> : (
          <div className="vg-tablewrap">
            <table className="vg-table" style={{ minWidth: 560 }}>
              <thead><tr><th style={{ width: 130 }}>When</th><th style={{ width: 90 }}>Who</th><th style={{ width: 90 }}>Action</th><th>What</th><th>Reason</th>{onRevert && <th style={{ width: 90 }}></th>}</tr></thead>
              <tbody>
                {log.slice(0, 60).map(a => (
                  <tr key={a.id}>
                    <td className="vg-muted" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{when(a.ts)}</td>
                    <td style={{ fontSize: '0.82rem' }}>{a.actorName}{a.onBehalfName && <span className="vg-muted" style={{ display: 'block', fontSize: '0.72rem' }}>for {a.onBehalfName}</span>}</td>
                    <td><span className="vg-chip" style={{ background: `color-mix(in srgb, ${evColor[a.event] || 'var(--vg-ink-faint)'} 14%, transparent)`, color: evColor[a.event] || 'var(--vg-ink-faint)', textTransform: 'capitalize' }}>{a.event}</span></td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {a.what}
                      {a.change && <ChangeBlurb c={a.change} />}
                    </td>
                    <td className="vg-muted" style={{ fontSize: '0.8rem' }}>{a.reason || '—'}</td>
                    {onRevert && (
                      <td>
                        {a.revertedAt
                          ? <span className="vg-chip" style={{ background: 'rgba(139,129,173,0.16)', color: 'var(--vg-ink-faint)' }}>undone</span>
                          : a.change
                            ? <button className="vg-btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.76rem' }} onClick={() => setUndoing(a)}>Undo</button>
                            : null}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {undoing && onRevert && <UndoChangeModal entry={undoing} entities={ent} onClose={() => setUndoing(null)} onConfirm={onRevert} />}
    </div>
  )
}

// A one-line account of what an entry did, so the history reads as figures
// rather than only as labels.
function ChangeBlurb({ c }: { c: AuditChange }) {
  const money = (it: Item | null) => (it ? INR(it.amount || 0) : null)
  const from = money(c.before), to = money(c.after)
  const where = c.scope === 'month' ? (c.mode === 'override' ? 'this month only' : 'one-off') : 'recurring'
  return (
    <span className="vg-muted" style={{ display: 'block', fontSize: '0.74rem', marginTop: 2 }}>
      {from && to ? <>{from} → <b>{to}</b></> : to ? <>added at <b>{to}</b></> : from ? <>removed, was <b>{from}</b></> : 'removed'}
      <span style={{ opacity: 0.7 }}> · {where}</span>
    </span>
  )
}

// Undoing one change. It asks for a reason because everyone else sees the
// entry, and it can fail — if the figure has moved again since, putting the
// old one back would wipe out the newer change, so the server refuses.
function UndoChangeModal({ entry, entities, onClose, onConfirm }: {
  entry: AuditEntry; entities: Entity[]
  onClose: () => void
  onConfirm: (auditId: string, reason: string) => Promise<{ error?: string } | null | void> | void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const c = entry.change!
  const target = c.before ?? c.after
  void entities
  return (
    <div className="vg-lb" onClick={onClose}>
      <div className="vg-card vg-pad" style={{ width: 'min(440px, 96vw)', background: 'var(--vg-glass-2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <p className="vg-sec" style={{ margin: 0 }}>Undo this change</p>
          <button className="vg-icobtn" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <p style={{ margin: 0, color: 'var(--vg-ink)', fontSize: '0.9rem' }}>
          <b>{target?.name || entry.what}</b>
          {c.before && c.after
            ? <> goes back to <b>{INR(c.before.amount || 0)}</b>, from {INR(c.after.amount || 0)}.</>
            : c.after ? <> was added — it will be removed again.</>
            : <> was removed — it will be put back at {INR(c.before?.amount || 0)}.</>}
        </p>
        <p className="vg-muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
          {c.scope === 'template'
            ? 'This is a recurring item, so every month that has not been edited by hand follows it.'
            : c.mode === 'override'
              ? `Only ${c.monthKey ? monthLabel(c.monthKey) : 'that month'} is affected — the recurring item itself is untouched.`
              : `Only that one entry in ${c.monthKey ? monthLabel(c.monthKey) : 'that month'} is affected.`}
        </p>

        <div style={{ marginTop: '0.9rem' }}>
          <label className="vg-lbl">Why? <span className="vg-muted" style={{ textTransform: 'none', letterSpacing: 0 }}>(everyone sees this)</span></label>
          <input className="vg-input" value={reason} onChange={e => { setReason(e.target.value); setErr(null) }} placeholder="e.g. the amount was typed wrong" autoFocus />
        </div>
        {err && <p className="vg-neg" style={{ fontSize: '0.82rem', marginTop: '0.6rem' }}>{err}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1rem' }}>
          <button className="vg-btn" onClick={onClose}>Cancel</button>
          <button className="vg-btn vg-btn-primary" disabled={busy}
            onClick={async () => {
              setBusy(true); setErr(null)
              const r = await onConfirm(entry.id, reason.trim())
              setBusy(false)
              if (r && typeof r === 'object' && 'error' in r && r.error) setErr(String(r.error))
              else onClose()
            }}>
            {busy ? <Loader2 className="h-4 w-4 vg-spin" /> : <Check className="h-4 w-4" />} Undo it
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- Budget: limits and goals ----------------------------
// Spending limits and what you're saving up for, against what actually
// happened in a month.
//
// Income and savings are private to each profile — the server strips them
// from the super view — so anything derived from them (what you saved this
// month, whether a goal is funded) is only shown to the person themselves.
// Limits and spend work for everyone, because spend is shared information.
function BudgetTab({ doc, me, onSaveBudget }: {
  doc: FinanceDoc; me: { role: 'super' | 'member'; entityId: string | null }
  onSaveBudget: (who: string, b: EntityBudget) => void
}) {
  const persons = doc.entities.filter(e => e.kind === 'person')
  const whoOptions = me.role === 'super' ? ['family', ...persons.map(p => p.id)] : [me.entityId ?? persons[0]?.id ?? '']
  const [who, setWho] = useState(whoOptions[0])
  const [k, setK] = useState(monthKey())
  const stored = who === 'family' ? doc.budgets.family : (doc.budgets.byEntity[who] ?? emptyBudget())
  const [draft, setDraft] = useState<EntityBudget>(() => structuredClone(stored))
  useEffect(() => {
    setDraft(structuredClone(who === 'family' ? doc.budgets.family : (doc.budgets.byEntity[who] ?? emptyBudget())))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who, doc])
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored)

  const m = monthView(doc, k)
  const t = totals(m, doc.entities)
  const step = (d: number) => { const [y, mo] = k.split('-').map(Number); setK(monthKey(new Date(y, mo - 1 + d, 1))) }
  const spent = who === 'family' ? t.expense : (t.byEntity[who] ?? 0)
  // Only your own income and savings are ever visible to you, so the
  // saving-and-goals half of this page is yours alone.
  const isMine = me.role === 'member' && who === me.entityId
  const income = isMine ? m.income.filter(i => i.entity === who).reduce((a, b) => a + b.amount, 0) : 0
  const savingsTotal = isMine ? doc.savings.filter(s => s.entity === who).reduce((a, b) => a + (b.balance || 0), 0) : 0
  const monthlySaving = income - spent
  const plannedTotal = draft.planned.reduce((a, b) => a + (b.amount || 0), 0)

  // Per-category spend must sit on the same basis as "Spent this month" above,
  // which is byEntity → bearerShares: a bill paid from the common account is
  // borne by the pool, not split onto a person. Using raw shares() here made
  // the category column total more than the headline figure.
  const catAct = new Map<string, number>()
  for (const it of m.items) { const f = who === 'family' ? 1 : (bearerShares(it)[who] ?? 0); if (f <= 0) continue; catAct.set(categoryOf(it), (catAct.get(categoryOf(it)) ?? 0) + it.amount * f) }
  const limitsTotal = doc.categories.reduce((a, c) => a + (draft.byCategory[c.name] ?? 0), 0)

  const setCat = (name: string, v: number) => setDraft(d => ({ ...d, byCategory: { ...d.byCategory, [name]: v } }))
  const addPlan = () => setDraft(d => ({ ...d, planned: [...d.planned, { id: uid('plan'), name: 'New goal', amount: 0, targetMonth: monthKey() }] }))
  const updPlan = (id: string, patch: Partial<PlannedItem>) => setDraft(d => ({ ...d, planned: d.planned.map(x => x.id === id ? { ...x, ...patch } : x) }))
  const delPlan = (id: string) => setDraft(d => ({ ...d, planned: d.planned.filter(x => x.id !== id) }))

  const overBudget = draft.monthly > 0 && spent > draft.monthly

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="vg-nav">
            <button className="vg-icobtn" onClick={() => step(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
            <span className="lbl">{monthLabel(k)}</span>
            <button className="vg-icobtn" onClick={() => step(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
          </div>
          {whoOptions.length > 1 ? (
            <div className="vg-tabs">
              {whoOptions.map(o => <button key={o} className="vg-tab" data-on={who === o} onClick={() => setWho(o)}>{o === 'family' ? 'Family' : entName(doc.entities, o)}</button>)}
            </div>
          ) : <p className="vg-sec" style={{ margin: 0 }}>My budget</p>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {k !== monthKey() && <button className="vg-btn" onClick={() => setK(monthKey())}><CalendarDays className="h-4 w-4" /> This month</button>}
          {dirty && <>
            <button className="vg-btn" onClick={() => setDraft(structuredClone(stored))}>Discard</button>
            <button className="vg-btn vg-btn-primary" onClick={() => onSaveBudget(who, draft)}><Check className="h-4 w-4" /> Save budget</button>
          </>}
        </div>
      </div>

      <div className="vg-kpis" style={{ marginBottom: '1.1rem' }}>
        <div className="vg-kpi"><div className="k">Monthly budget</div><div className="v">
          <input className="vg-input vg-num" style={{ maxWidth: 130 }} inputMode="numeric" value={String(draft.monthly)} onChange={e => setDraft(d => ({ ...d, monthly: num(e.target.value) }))} />
        </div></div>
        <Kpi label="Spent" value={INR(spent)} cls={overBudget ? 'vg-neg' : undefined} info={who === 'family' ? 'Everything the household spent this month.' : 'This person’s share of what people paid from their own accounts. Bills paid from the common account sit with the pool, not with a person.'} />
        <Kpi label={draft.monthly - spent >= 0 ? 'Left to spend' : 'Over by'} value={draft.monthly ? INR(Math.abs(draft.monthly - spent)) : '—'} cls={draft.monthly - spent >= 0 ? 'vg-pos' : 'vg-neg'} info="Your monthly budget minus what has been spent so far this month." />
        {isMine
          ? <Kpi label={monthlySaving >= 0 ? 'Saving this month' : 'Overspending by'} value={INR(Math.abs(monthlySaving))} cls={monthlySaving >= 0 ? 'vg-pos' : 'vg-neg'} info="Your income for the month minus your share of the spending." />
          : <Kpi label="Limits set" small value={`${INR(limitsTotal)}${draft.monthly > 0 ? ` of ${INR(draft.monthly)}` : ''}`} cls={draft.monthly > 0 && limitsTotal > draft.monthly ? 'vg-neg' : undefined} info="Your category limits added up, against the monthly budget. Over the budget means the limits promise more than there is." />}
      </div>

      {draft.monthly > 0 && (
        <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--vg-ink-soft)', marginBottom: 4 }}>
            <span>{INR(spent)} spent</span><span>budget {INR(draft.monthly)}</span>
          </div>
          <div className="vg-emi-bar" style={{ height: 12 }}><i style={{ width: `${Math.min(100, (spent / draft.monthly) * 100)}%`, background: overBudget ? 'linear-gradient(90deg,#e2445c,#b0479a)' : 'linear-gradient(90deg,var(--vg-accent-2),var(--vg-accent))' }} /></div>
        </div>
      )}

      <div className="vg-grid2">
        {/* Category budgets */}
        <div className="vg-card vg-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <p className="vg-sec" style={{ margin: 0 }}>Category limits</p>
            <span className="vg-muted" style={{ fontSize: '0.78rem' }}>
              limits {INR(limitsTotal)}{draft.monthly > 0 && <> of {INR(draft.monthly)}{limitsTotal > draft.monthly && <b className="vg-neg"> · over the budget</b>}</>}
            </span>
          </div>
          <div className="vg-tablewrap" style={{ marginTop: '0.6rem' }}>
            <table className="vg-table" style={{ minWidth: 420 }}>
              <thead><tr><th>Category</th><th className="num" style={{ width: 104 }}>Limit</th><th className="num">Spent</th><th style={{ width: '26%' }}>Used</th></tr></thead>
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
                      <td>
                        {lim > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ flex: 1, height: 8, borderRadius: 999, background: 'color-mix(in srgb, var(--vg-ink-faint) 12%, transparent)', overflow: 'hidden' }}>
                              <span style={{ display: 'block', height: '100%', width: `${Math.min(100, (a / lim) * 100)}%`, borderRadius: 999, background: over ? 'var(--vg-neg)' : c.color }} />
                            </span>
                            <b style={{ fontSize: '0.76rem', fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'right', color: over ? 'var(--vg-neg)' : 'var(--vg-ink-soft)' }}>{Math.round((a / lim) * 100)}%</b>
                          </div>
                        ) : <span className="vg-muted" style={{ fontSize: '0.76rem' }}>no limit</span>}
                      </td>
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
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="vg-muted">Wishlist total</span><b>{INR(plannedTotal)}</b></div>
            {isMine ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="vg-muted">Savings now</span><b>{INR(savingsTotal)}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="vg-muted">After buying it all</span><b className={savingsTotal - plannedTotal >= 0 ? 'vg-pos' : 'vg-neg'}>{INR(savingsTotal - plannedTotal)}</b></div>
                {plannedTotal > 0 && (
                  <p style={{ marginTop: '0.6rem', fontSize: '0.88rem' }}>
                    {savingsTotal >= plannedTotal
                      ? <span className="vg-pos"><b>Your savings already cover this.</b></span>
                      : monthlySaving > 0
                        ? <>At <b>{INR(monthlySaving)}</b> saved this month, the shortfall of <b>{INR(plannedTotal - savingsTotal)}</b> is about <b>{Math.max(0, Math.ceil((plannedTotal - savingsTotal) / monthlySaving))} months</b> away.</>
                        : <span className="vg-neg">You&rsquo;re not saving this month, so this can&rsquo;t be funded from savings yet.</span>}
                  </p>
                )}
              </>
            ) : (
              null
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

// Editable, private per-profile income for a single month. On My Dashboard
// this is where the calculation lands: personal spend is deducted from My
// income right here, so you see what's left over.
function MemberIncomeCard({ rows, monthKey: mk, onSave, personalSpend, locked }: {
  rows: IncomeItem[]; monthKey: string
  onSave: (rows: { id: string; source: string; amount: number }[]) => void
  personalSpend?: number
  locked?: boolean          // a closed month: shown, never changed
}) {
  const [draft, setDraft] = useState<{ id: string; source: string; amount: number }[]>(() => rows.map(r => ({ id: r.id, source: r.source, amount: r.amount })))
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setDraft(rows.map(r => ({ id: r.id, source: r.source, amount: r.amount }))); setDirty(false) /* eslint-disable-next-line */ }, [mk])
  const set = (id: string, patch: Partial<{ source: string; amount: number }>) => { setDraft(d => d.map(r => r.id === id ? { ...r, ...patch } : r)); setDirty(true) }
  const add = () => { setDraft(d => [...d, { id: uid('inc'), source: 'Salary', amount: 0 }]); setDirty(true) }
  const del = (id: string) => { setDraft(d => d.filter(r => r.id !== id)); setDirty(true) }
  const total = draft.reduce((a, b) => a + (Number(b.amount) || 0), 0)
  const left = personalSpend != null ? total - personalSpend : null
  return (
    <div className="vg-card vg-pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <p className="vg-sec" style={{ margin: 0 }}><ShieldCheck className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-pos)', verticalAlign: '-3px' }} /> My income · {INR(total)}</p>
        {!locked && <div style={{ display: 'flex', gap: 6 }}>
          <button className="vg-btn" onClick={add}><Plus className="h-4 w-4" /> Add</button>
          <button className="vg-btn vg-btn-primary" disabled={!dirty} onClick={() => { onSave(draft.map(r => ({ ...r, amount: Number(r.amount) || 0 }))); setDirty(false) }}><Check className="h-4 w-4" /> Save</button>
        </div>}
      </div>
      <div className="vg-tablewrap">
        <table className="vg-table" style={{ minWidth: 320 }}>
          <thead><tr><th>Source</th><th className="num">Amount / mo</th><th style={{ width: 36 }}></th></tr></thead>
          <tbody>
            {draft.map(r => (
              <tr key={r.id}>
                <td><input className="vg-input" readOnly={locked} value={r.source} onChange={e => set(r.id, { source: e.target.value })} placeholder="Salary, rent received…" /></td>
                <td className="num"><input className="vg-input" type="number" readOnly={locked} value={r.amount} onChange={e => set(r.id, { amount: Number(e.target.value) })} style={{ textAlign: 'right', maxWidth: 130 }} /></td>
                <td>{!locked && <button className="vg-icobtn" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></button>}</td>
              </tr>
            ))}
            {draft.length === 0 && <tr><td colSpan={3} className="vg-muted" style={{ textAlign: 'center', padding: '1rem' }}>No income yet. Add your salary or other earnings.</td></tr>}
          </tbody>
        </table>
      </div>
      {left != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.7rem', paddingTop: '0.6rem', borderTop: '1px solid var(--vg-line)' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--vg-ink-soft)' }}>− Personal expenses ({INR(personalSpend ?? 0)}) ={' '}<b>{left >= 0 ? 'Left after your own spending' : 'Over your own spending by'}</b></span>
          <b style={{ fontVariantNumeric: 'tabular-nums' }} className={left >= 0 ? 'vg-pos' : 'vg-neg'}>{INR(Math.abs(left))}</b>
        </div>
      )}
    </div>
  )
}

// ---------- My Dashboard: where the income actually goes --------
// Income for the month, then every envelope that charges against it. Pick an
// envelope along the top to see exactly what it costs you, what you fronted,
// and how it has moved over the last six months.
//
// An expense paid from the common account is funded by that account's own
// earnings, so it never reaches a salary; only a shortfall it could not cover
// does, as its own line under the household. Each expense is charged under
// exactly ONE envelope, so the parts add up to the whole.
interface ImpactLine {
  id: string
  name: string
  full: number          // the whole expense
  frac: number          // the part of it you bear
  mine: number          // full × frac
  paidBy: string        // '' for the common-account top-up, which nobody "paid"
}
interface ImpactGroup {
  id: string
  name: string
  color: string
  lines: ImpactLine[]
  charged: number       // total charged to you
  full: number          // what those expenses cost in total, all bearers together
  youPaid: number       // what actually left your account
}
interface Impact {
  income: number
  incomeRows: IncomeItem[]
  groups: ImpactGroup[]
  charged: number
  left: number
  commonIncome: number
  commonExpenses: number
  shortfall: number
}

function computeImpact(doc: FinanceDoc, entityId: string, k: string, envs: Envelope[]): Impact {
  const entities = doc.entities
  const m = monthView(doc, k)
  const s = computeSettlement(doc, k)
  const incomeRows = m.income.filter(i => i.entity === entityId)
  const income = incomeRows.reduce((a, b) => a + (b.amount || 0), 0)
  const householdEnv = envs.find(e => e.system)
  const householdId = householdEnv?.id ?? HOUSEHOLD

  const myFrac = (it: Item) => shares(it)[entityId] ?? 0
  // The envelope an expense is charged under: the one it is filed in, or — for
  // anything left sitting in the household — the envelope whose members are
  // exactly the people bearing it, so a 50/50 EMI is charged under "Brothers"
  // rather than the household it happens to be filed in.
  const homeOf = (it: Item): Envelope | undefined => {
    const filed = envs.find(e => e.id === (it.envelope ?? HOUSEHOLD))
    if (filed && !filed.system) return filed
    const bearers = bearersOf(it).sort()
    const exact = envs.find(e => !e.system && e.members.length === bearers.length && [...e.members].sort().every((x, i) => x === bearers[i]))
    return exact ?? filed
  }
  const colorOf = (env?: Envelope) => {
    if (env?.personalOf) return entColor(entities, env.personalOf)
    if (!env || env.system) return '#6d4bd8'
    const i = envs.filter(e => !e.system && !e.personalOf).findIndex(e => e.id === env.id)
    return PALETTE[(i + 1) % PALETTE.length]
  }

  const groups = new Map<string, ImpactGroup>()
  const groupFor = (env: Envelope | undefined): ImpactGroup => {
    const id = env?.id ?? householdId
    const found = groups.get(id)
    if (found) return found
    const g: ImpactGroup = { id, name: env?.name ?? 'Lamba Household', color: colorOf(env), lines: [], charged: 0, full: 0, youPaid: 0 }
    groups.set(id, g)
    return g
  }

  for (const it of m.items) {
    if (it.paidBy === 'common') continue              // the common account's own money
    const frac = myFrac(it)
    const mine = (it.amount || 0) * frac
    if (mine < 0.5) continue
    const g = groupFor(homeOf(it))
    g.lines.push({ id: it.id, name: it.name || 'Expense', full: it.amount || 0, frac, mine, paidBy: it.paidBy })
    g.charged += mine
    g.full += it.amount || 0
    if (it.paidBy === entityId) g.youPaid += it.amount || 0
  }

  const topUp = s.contributors.includes(entityId) ? s.perContributor : 0
  if (topUp > 0.5) {
    const g = groupFor(householdEnv)
    g.lines.push({ id: 'topup', name: 'Common account top-up — your equal share of what it fell short', full: s.shortfall, frac: s.contributors.length ? 1 / s.contributors.length : 1, mine: topUp, paidBy: '' })
    g.charged += topUp
    g.full += s.shortfall
  }

  for (const g of groups.values()) g.lines.sort((a, b) => b.mine - a.mine)
  const rank = (g: ImpactGroup) => (envs.find(e => e.id === g.id)?.personalOf ? 0 : g.id === householdId ? 2 : 1)
  const ordered = [...groups.values()].sort((a, b) => rank(a) - rank(b) || b.charged - a.charged)
  const charged = ordered.reduce((a, g) => a + g.charged, 0)
  return { income, incomeRows, groups: ordered, charged, left: income - charged, commonIncome: s.commonIncome, commonExpenses: s.commonExpenses, shortfall: s.shortfall }
}

const IMPACT_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function IncomeImpactCard({ doc, entityId, k, envs, onPickMonth }: {
  doc: FinanceDoc; entityId: string; k: string; envs: Envelope[]
  onPickMonth?: (k: string) => void
}) {
  const [sel, setSel] = useState<string>('all')
  const entities = doc.entities
  const imp = computeImpact(doc, entityId, k, envs)
  const cur = sel === 'all' ? undefined : imp.groups.find(g => g.id === sel)
  const pctOf = (v: number) => (imp.income > 0 ? (v / imp.income) * 100 : 0)
  const fmtPct = (v: number) => `${pctOf(v) >= 10 ? Math.round(pctOf(v)) : pctOf(v).toFixed(1)}%`

  // The same working for the last six months, so a month can be read in context
  // rather than in isolation. Derived from the doc, so it is cheap to redo.
  const trend = useMemo(() => {
    const [y, mo] = k.split('-').map(Number)
    return Array.from({ length: 6 }, (_, i) => {
      const key = monthKey(new Date(y, mo - 1 - (5 - i), 1))
      const past = computeImpact(doc, entityId, key, visibleEnvelopes(doc, entityId))
      const g = sel === 'all' ? null : past.groups.find(x => x.id === sel)
      return { k: key, charged: sel === 'all' ? past.charged : (g?.charged ?? 0), income: past.income }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, entityId, k, sel])
  const trendMax = Math.max(1, ...trend.map(t => t.charged))
  const trendAvg = trend.reduce((a, t) => a + t.charged, 0) / (trend.length || 1)
  const thisMonth = trend[trend.length - 1]?.charged ?? 0
  const vsAvg = trendAvg > 0.5 ? ((thisMonth - trendAvg) / trendAvg) * 100 : 0

  const net = cur ? cur.youPaid - cur.charged : 0
  const nm = (id: string) => entName(entities, id)

  const bar = (value: number, of: number, color: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ flex: 1, height: 8, borderRadius: 999, background: 'color-mix(in srgb, var(--vg-ink-faint) 12%, transparent)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${of > 0 ? Math.min(100, (value / of) * 100) : 0}%`, background: color, borderRadius: 999 }} />
      </span>
      <b style={{ fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums', minWidth: 46, textAlign: 'right', color: 'var(--vg-ink-soft)' }}>
        {of > 0 ? `${Math.round((value / of) * 100)}%` : '—'}
      </b>
    </div>
  )

  return (
    <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <p className="vg-sec" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Scale className="h-4 w-4" /> What each envelope does to your income
        </p>
        <span className="vg-muted" style={{ fontSize: '0.8rem' }}>{monthLabel(k)}</span>
      </div>

      {/* Pick an envelope — each tab carries its own headline figure, so the
          comparison is there before you click anything. */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', margin: '0.9rem 0 1.2rem' }}>
        <button className="vg-envtab" data-on={!cur} onClick={() => setSel('all')}>
          <span className="t">Everything</span>
          <span className="v">{INR(imp.charged)}</span>
          <span className="s">{fmtPct(imp.charged)} of income</span>
        </button>
        {imp.groups.map(g => (
          <button key={g.id} className="vg-envtab" data-on={cur?.id === g.id} onClick={() => setSel(g.id)}>
            <span className="t"><i className="vg-dot" style={{ background: g.color }} /> {g.name}</span>
            <span className="v">{INR(g.charged)}</span>
            <span className="s">{fmtPct(g.charged)} of income</span>
          </button>
        ))}
      </div>

      {!cur ? (
        <>
          <div className="vg-kpis" style={{ marginBottom: '1.1rem' }}>
            <Kpi label="My income" value={INR(imp.income)} cls="vg-pos" info="Everything recorded as yours this month — salary and anything else, including a payout from the common account." />
            <Kpi label="Charged to me" value={INR(imp.charged)} info="Your share of every expense that reaches your own money, across all envelopes." />
            <Kpi label={imp.left >= 0 ? 'Left over' : 'Short by'} value={INR(Math.abs(imp.left))} cls={imp.left >= 0 ? 'vg-pos' : 'vg-neg'} info="Your income minus everything charged to you this month." />
            <Kpi label="Income kept" small value={`${imp.income > 0 ? Math.max(0, Math.round((imp.left / imp.income) * 100)) : 0}%`} cls={imp.left >= 0 ? 'vg-pos' : 'vg-neg'} info="How much of this month's income is still yours after every envelope has taken its share." />
          </div>

          <p className="vg-sec" style={{ marginBottom: '0.5rem' }}>Where your income went</p>
          <StackBar parts={[
            ...imp.groups.map(g => ({ label: g.name, value: g.charged, color: g.color })),
            ...(imp.left > 0.5 ? [{ label: 'Left with you', value: imp.left, color: 'var(--vg-pos)' }] : []),
          ]} />

          <div className="vg-tablewrap" style={{ marginTop: '1.2rem' }}>
            <table className="vg-table" style={{ minWidth: 640 }}>
              <thead><tr>
                <th>Envelope</th>
                <th className="num" style={{ width: 70 }}>Items</th>
                <th className="num">Full cost</th>
                <th className="num">Charged to you</th>
                <th style={{ width: '30%' }}>Share of your income</th>
              </tr></thead>
              <tbody>
                {imp.groups.map(g => (
                  <tr key={g.id}>
                    <td>
                      <button className="vg-btn-ghost" style={{ padding: 0, fontWeight: 600 }} onClick={() => setSel(g.id)}>
                        <span className="vg-dot" style={{ background: g.color, marginRight: 6 }} />{g.name}
                      </button>
                    </td>
                    <td className="num vg-muted">{g.lines.length}</td>
                    <td className="num vg-muted">{INR(g.full)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{INR(g.charged)}</td>
                    <td>{bar(g.charged, imp.income, g.color)}</td>
                  </tr>
                ))}
                {imp.groups.length === 0 && <tr><td colSpan={5} className="vg-muted" style={{ textAlign: 'center', padding: '1.2rem' }}>Nothing is charged to you this month — your whole income stays with you.</td></tr>}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid color-mix(in srgb, var(--vg-accent) 25%, transparent)' }}>
                  <td style={{ fontWeight: 700, paddingTop: '0.6rem' }}>{imp.left >= 0 ? 'Left with you' : 'Short by'}</td>
                  <td colSpan={2}></td>
                  <td className="num" style={{ paddingTop: '0.6rem' }}><b className={imp.left >= 0 ? 'vg-pos' : 'vg-neg'}>{INR(Math.abs(imp.left))}</b></td>
                  <td style={{ paddingTop: '0.6rem' }}>{bar(Math.max(0, imp.left), imp.income, '#1f9d6b')}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {imp.incomeRows.length > 0 && (
            <div style={{ marginTop: '1.1rem' }}>
              <p className="vg-sec" style={{ marginBottom: '0.45rem' }}>Money in</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {imp.incomeRows.map(i => (
                  <span key={i.id} className="vg-chip" style={{ background: 'rgba(31,157,107,0.12)', color: 'var(--vg-pos)', fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}>
                    {i.source} <b style={{ marginLeft: 4 }}>{INR(i.amount)}</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="vg-kpis" style={{ marginBottom: '1.1rem' }}>
            <Kpi label="Charged to you" value={INR(cur.charged)} cls="vg-neg" info="Your share of this envelope's expenses this month." />
            <Kpi label="Share of your income" value={fmtPct(cur.charged)} info="What this one envelope takes out of everything you earned this month." />
            <Kpi label="Full cost of these bills" value={INR(cur.full)} info="What these expenses cost in total, before they are split between the people sharing them." />
            <Kpi label="You paid out" value={INR(cur.youPaid)} info="How much of this actually left your own account — which is not the same as your share of it." />
            <Kpi label={net >= 0.5 ? 'Others owe you' : net <= -0.5 ? 'You owe' : 'Settled'} small
              value={Math.abs(net) < 0.5 ? 'All square' : INR(Math.abs(net))}
              cls={net >= 0.5 ? 'vg-pos' : net <= -0.5 ? 'vg-neg' : undefined}
              info="You paid out, minus your share. Positive means you fronted more than your part and the rest is owed back to you." />
          </div>

          <div className="vg-tablewrap">
            <table className="vg-table" style={{ minWidth: 680 }}>
              <thead><tr>
                <th>Expense</th>
                <th>Paid by</th>
                <th className="num">Full amount</th>
                <th className="num" style={{ width: 80 }}>Your part</th>
                <th className="num">Charged to you</th>
                <th style={{ width: '22%' }}>Weight</th>
              </tr></thead>
              <tbody>
                {cur.lines.map(ln => (
                  <tr key={ln.id}>
                    <td className="vg-nm" style={{ fontWeight: 600 }}>{ln.name}</td>
                    <td>{ln.paidBy
                      ? <span className="vg-chip" style={{ background: entColor(entities, ln.paidBy) + '22', color: inkOf(entColor(entities, ln.paidBy)) }}>{ln.paidBy === entityId ? 'You' : nm(ln.paidBy)}</span>
                      : <span className="vg-muted">—</span>}</td>
                    <td className="num vg-muted">{INR(ln.full)}</td>
                    <td className="num vg-muted">{Math.round(ln.frac * 100)}%</td>
                    <td className="num vg-neg" style={{ fontWeight: 700 }}>−{INR(ln.mine)}</td>
                    <td>{bar(ln.mine, cur.charged, cur.color)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid color-mix(in srgb, var(--vg-accent) 25%, transparent)' }}>
                  <td colSpan={4} style={{ fontWeight: 700, paddingTop: '0.6rem' }}>Charged to you from {cur.name}</td>
                  <td className="num" style={{ paddingTop: '0.6rem' }}><b className="vg-neg">−{INR(cur.charged)}</b></td>
                  <td style={{ paddingTop: '0.6rem' }}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* Six months of the same figure — one month on its own says very little. */}
      <div style={{ marginTop: '1.4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          <p className="vg-sec" style={{ margin: 0 }}>{cur ? `${cur.name} — last six months` : 'Charged to you — last six months'}</p>
          <span className="vg-muted" style={{ fontSize: '0.78rem' }}>
            averages {INR(trendAvg)}
            {Math.abs(vsAvg) >= 1 && <> · this month is <b className={vsAvg > 0 ? 'vg-neg' : 'vg-pos'}>{vsAvg > 0 ? 'up' : 'down'} {Math.abs(Math.round(vsAvg))}%</b> on that</>}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 150, paddingTop: 6 }}>
          {trend.map(t => {
            const isNow = t.k === k
            const share = t.income > 0 ? Math.round((t.charged / t.income) * 100) : null
            const mi = Number(t.k.slice(5, 7)) - 1
            return (
              <button key={t.k} onClick={() => onPickMonth?.(t.k)} title={`${monthLabel(t.k)} · ${INR(t.charged)}${share != null ? ` · ${share}% of income` : ''}`}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, border: 0, background: 'transparent', cursor: onPickMonth ? 'pointer' : 'default', minWidth: 0, padding: 0 }}>
                <span style={{ fontSize: 10, color: 'var(--vg-ink-soft)', fontVariantNumeric: 'tabular-nums' }}>{t.charged > 0 ? Math.round(t.charged / 1000) + 'k' : ''}</span>
                <span style={{ width: '100%', display: 'flex', alignItems: 'flex-end', height: 96 }}>
                  <span style={{
                    width: '100%', height: `${(t.charged / trendMax) * 100}%`, minHeight: t.charged > 0 ? 3 : 0, borderRadius: '7px 7px 3px 3px',
                    background: isNow ? (cur?.color ?? '#6d4bd8') : 'color-mix(in srgb, var(--vg-ink-faint) 28%, transparent)',
                  }} />
                </span>
                <span style={{ fontSize: 10, color: isNow ? 'var(--vg-accent)' : 'var(--vg-ink-faint)', fontWeight: isNow ? 700 : 500 }}>{IMPACT_MON[mi]}</span>
                <span style={{ fontSize: 9, color: 'var(--vg-ink-faint)', fontVariantNumeric: 'tabular-nums' }}>{share != null ? `${share}%` : ''}</span>
              </button>
            )
          })}
        </div>
      </div>

    </div>
  )
}

function MemberMonth({ doc, entityId, k, setKey, action, openEditor, actingAs }: {
  doc: FinanceDoc; entityId: string; k: string; setKey: (k: string) => void
  actingAs?: string | null
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
  const closed = !!doc.settlements?.[k]?.closed
  const t = totals(m, entities)
  const step = (d: number) => { const [y, mo] = k.split('-').map(Number); setKey(monthKey(new Date(y, mo - 1 + d, 1))) }
  const bal = t.netBalance[entityId] ?? 0
  const envs = visibleEnvelopes(doc, entityId)             // only the envelopes this member belongs to
  const isDash = env === DASH
  // "My Dashboard" IS this profile's Personal envelope — selecting it resolves
  // straight to that envelope, so everything below (the item list, the income
  // card, the envelope-impact math) is driven by the same envelope engine as
  // any other envelope, just scoped to items this person alone bears.
  const myPersonalEnv = envs.find(e => e.personalOf === entityId)
  const curEnv = isDash ? myPersonalEnv : (envs.find(e => e.id === env) ?? envs[0])
  const isHousehold = !isDash && (!curEnv || curEnv.system)

  const household = envs.find(e => e.system)
  const hhItems = m.items.filter(it => itemInEnvelope(it, household ?? ({ id: HOUSEHOLD, name: 'Lamba Household', members: [], system: true } as Envelope)))
  const hhRows = hhItems.filter(it => classify(it, entities) === bucket)
  const envItems = curEnv ? m.items.filter(it => itemInEnvelope(it, curEnv)) : m.items
  // On My Dashboard, envItems IS the personal-envelope set — split by kind for
  // the Regular expense / EMIs sub-tabs (a personal EMI now lives here, not
  // under the household EMI list).
  const personalItems = envItems
  const personalTotal = personalItems.reduce((s, it) => s + (it.amount || 0), 0)
  const pRows = personalItems.filter(it => (pbucket === 'emi' ? it.kind === 'emi' : it.kind !== 'emi'))
  const rows = isDash ? pRows : isHousehold ? hhRows : envItems
  const counts = { common: 0, emi: 0 }
  hhItems.forEach(it => { const c = classify(it, entities); if (c === 'common') counts.common++; else if (c === 'emi') counts.emi++ })
  const pCounts = { regular: personalItems.filter(it => it.kind !== 'emi').length, emi: personalItems.filter(it => it.kind === 'emi').length }
  const commonIncome = m.income.filter(i => i.entity === 'common').reduce((s, i) => s + (i.amount || 0), 0)
  const commonExpenses = m.items.filter(it => it.paidBy === 'common').reduce((s, it) => s + (it.amount || 0), 0)
  // On My Dashboard the breakdown is YOUR share of each category; on a shared
  // envelope or the household it is the whole picture.
  const cats = byCategory(m, isDash ? entityId : undefined).map((c, i) => ({ ...c, color: catColor(c.name, doc.categories, i) }))
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
          <EnvelopeSelect envelopes={envs.filter(e => e.personalOf !== entityId)} value={env} onChange={setEnv} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <SheetButton k={k} actingAs={actingAs} />
          <button className="vg-btn" onClick={() => setKey(monthKey())}><CalendarDays className="h-4 w-4" /> This month</button>
        </div>
      </div>

      {closed && <ClosedBanner k={k} closedAt={doc.settlements?.[k]?.closedAt} closedBy={doc.settlements?.[k]?.closedBy} actingAs={actingAs} />}

      <div className="vg-kpis" style={{ marginBottom: '1.1rem' }}>
        <Kpi label="My income" value={INR(m.income.filter(i => i.entity === entityId).reduce((a, b) => a + b.amount, 0))} cls="vg-pos" info="Income recorded for you this month." />
        <Kpi label="My spend" value={INR(t.byEntity[entityId] ?? 0)} info="Your share of what people paid from their own accounts — your own expenses plus your part of anything shared. Bills paid from the common account are not counted here: they are funded by that account, and only a shortfall reaches you (see the Settlement tab)." />
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
          {!closed && <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button className="vg-btn" onClick={() => fileRef.current?.click()} disabled={reading}>{reading ? <Loader2 className="h-4 w-4 vg-spin" /> : <Camera className="h-4 w-4" />} Receipt</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onReceipt(e.target.files)} />
            <button className="vg-btn vg-btn-primary" onClick={() => openAdd(isDash ? (pbucket === 'emi' ? 'emi' : 'personal') : isHousehold ? bucket : 'common')}><Plus className="h-4 w-4" /> Add</button>
          </div>}
        </div>
        {receiptWarn && <p className="vg-neg" style={{ fontSize: '0.8rem', margin: '0 0 0.7rem', display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{receiptWarn}</span><button className="vg-icobtn" onClick={() => setReceiptWarn(null)}><X className="h-4 w-4" /></button></p>}
        <ExpenseTable rows={rows} entities={entities} shareCols={shareColumns(rows, entities)} readOnly={closed}
          member={{ entityId, lockedIds: underReview }}
          onEdit={openEdit} onDelete={del} onTogglePaid={togglePaid}
          emptyLabel={`Nothing in ${isDash ? (pbucket === 'emi' ? 'personal EMIs' : 'personal expenses') : isHousehold ? bucket : (curEnv?.name ?? 'this envelope')}. Use Add or snap a Receipt.`} />
      </div>

      {isHousehold && !closed && <CommonReconcile doc={doc} k={k} entities={entities} me={{ role: 'member', entityId }} action={action} />}

      {/* On My Dashboard the income card and the envelope-by-envelope working
          below it each get the full width — they are the point of the page. */}
      {isDash && <div style={{ marginBottom: '1.1rem' }}>
        <MemberIncomeCard rows={m.income.filter(i => i.entity === entityId)} monthKey={k} personalSpend={personalTotal} locked={closed}
          onSave={rows => action({ action: 'setMonthIncome', monthKey: k, income: rows })} />
      </div>}
      {isDash && <IncomeImpactCard doc={doc} entityId={entityId} k={k} envs={envs} onPickMonth={setKey} />}

      <div className="vg-grid2">
        {isHousehold && <CommonIncomeCard doc={doc} k={k} entities={entities} me={{ role: 'member', entityId }} action={action} locked={closed} />}
        <div className="vg-card vg-pad">
          <p className="vg-sec">{isDash ? 'Where your share goes' : 'Where it goes'}</p>
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
/** Grants this member can use right now: active and not past their end date. */
function liveGrants(list: FinanceDoc['delegations'] = [], entityId: string) {
  const today = new Date().toISOString().slice(0, 10)
  return list.filter(d => d.status === 'active' && d.grantee === entityId && (!d.expiresOn || d.expiresOn >= today))
}

/**
 * A member's app: their own finance, plus any profile they have been granted
 * access to. Switching loads that person's finance through the server, which
 * returns only what the grant allows — "My Finance | Mehak’s Finance".
 */
function MemberApp({ initialDoc, entityId, profile }: { initialDoc: FinanceDoc; entityId: string; profile?: MeLite & { email?: string } }) {
  const [view, setView] = useState<{ doc: FinanceDoc; acting: ActingInfo | null; n: number }>({ doc: initialDoc, acting: null, n: 0 })
  const live = useCallback((list: FinanceDoc['delegations'] = []) => liveGrants(list, entityId), [entityId])
  const [grants, setGrants] = useState(() => liveGrants(initialDoc.delegations, entityId))
  const [note, setNote] = useState<string | null>(null)
  const nameOf = (id: string) => entName(view.doc.entities, id)

  const switchTo = useCallback(async function load(owner: string | null, why?: string): Promise<void> {
    const r = await fetch(owner ? `/api/vault/finance?as=${encodeURIComponent(owner)}` : '/api/vault/finance').catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (!r || !r.ok || !d.doc) {
      setNote(d?.error ?? 'Could not open that profile.')
      if (owner) { setGrants(g => g.filter(x => x.owner !== owner)); return load(null) }
      return
    }
    setNote(why ?? null)
    setView(v => ({ doc: d.doc as FinanceDoc, acting: (d.me?.acting as ActingInfo) ?? null, n: v.n + 1 }))
    if (!owner) setGrants(live((d.doc as FinanceDoc).delegations))
  }, [live])

  const options = [{ id: null, label: 'My Finance' }, ...grants.map(g => ({ id: g.owner, label: `${nameOf(g.owner)}’s Finance` }))]
  return (
    <MemberDashboard key={`${view.acting?.owner ?? 'me'}:${view.n}`}
      initialDoc={view.doc} entityId={view.acting?.owner ?? entityId} profile={profile} acting={view.acting}
      onDoc={d => { if (!view.acting) setGrants(live(d.delegations)) }}
      onSwitch={switchTo}
      header={
        <>
          <ProfileSwitcher options={options} active={view.acting?.owner ?? null} onSwitch={id => switchTo(id)} />
          {view.acting && <ActingBanner acting={view.acting} onExit={() => switchTo(null)} />}
          {note && <p className="vg-card" role="status" style={{ padding: '0.55rem 0.8rem', marginBottom: '0.9rem', fontSize: '0.86rem' }}>{note} <button className="vg-btn-ghost vg-btn" style={{ padding: '0 0.4rem' }} onClick={() => setNote(null)}>×</button></p>}
        </>
      } />
  )
}

type MemberTab = 'month' | 'settle' | 'year' | 'loans' | 'tags' | 'savings' | 'import' | 'setup' | 'approvals' | 'access' | 'profile'

function MemberDashboard({ initialDoc, entityId, profile, acting = null, onDoc, onSwitch, header }: {
  initialDoc: FinanceDoc; entityId: string; profile?: MeLite & { email?: string }
  acting?: ActingInfo | null; onDoc?: (d: FinanceDoc) => void; onSwitch?: (owner: string | null, why?: string) => void; header?: React.ReactNode
}) {
  const [doc, setDoc] = useState<FinanceDoc>(initialDoc)
  const [tab, setTab] = useState<MemberTab>('month')
  const [budgetView, setBudgetView] = useState<BudgetView>('recurring')
  const [key, setKey] = useState(monthKey())
  const [year, setYear] = useState(new Date().getFullYear())
  const [busy, setBusy] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [editing, setEditing] = useState<{ item: Item; onSave: (it: Item) => void } | null>(null)
  const [meState, setMeState] = useState<(MeLite & { email?: string }) | undefined>(profile)
  const [actErr, setActErr] = useState<string | null>(null)
  const me = { role: 'member' as const, entityId }
  const perm = permFrom(acting)

  // Tell the app shell about grants that change here (approved, revoked) —
  // through a ref, so a new callback identity never re-fires this.
  const onDocRef = useRef(onDoc)
  useEffect(() => { onDocRef.current = onDoc })
  useEffect(() => { onDocRef.current?.(doc) }, [doc])

  async function action(payload: Record<string, unknown>) {
    setBusy('saving')
    try {
      // Acting for someone else: the server checks this against their grant.
      const body = acting ? { ...payload, actingAs: acting.owner } : payload
      const r = await fetch('/api/vault/finance/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (d.revoked && acting) { onSwitch?.(null, `${acting.ownerName} has revoked your access.`); return d }
      if (d.doc) setDoc(d.doc as FinanceDoc)
      if (d.error || !r.ok) { setActErr(String(d.error ?? 'That did not go through. Please try again.')); setBusy('idle'); return d }
      setActErr(null)
      setBusy('saved'); setTimeout(() => setBusy('idle'), 1400)
      return d
    } catch { setActErr('Could not reach the server — check your connection.'); setBusy('idle'); return null }
  }

  // Acting as someone, "waiting on you" means waiting on them.
  const pending = (doc.proposals ?? []).filter(p => p.approvers.includes(entityId))
  const accessWaiting = acting ? 0 : (doc.delegations ?? []).filter(d => d.status === 'pending' && d.owner === entityId).length
  const allTabs: (ShellTab & { show: boolean })[] = [
    { id: 'month', label: 'This month', icon: CalendarDays, show: perm('expenses', 'view') },
    { id: 'settle', label: 'Settlement', icon: Scale, show: perm('approvals', 'view') },
    { id: 'year', label: 'Year', icon: Wallet, show: perm('expenses', 'view') },
    { id: 'loans', label: 'Loans', icon: Landmark, show: perm('loans', 'view') },
    { id: 'tags', label: 'Tags', icon: TagIcon, show: perm('expenses', 'view') },
    { id: 'savings', label: acting ? 'Savings' : 'My Savings', icon: PiggyBank, show: perm('savings', 'view') || perm('investments', 'view') },
    { id: 'import', label: 'Import', icon: FileSpreadsheet, show: perm('expenses', 'add') },
    { id: 'setup', label: 'Budget', icon: Target, show: perm('budgets', 'view') || perm('expenses', 'view') },
    { id: 'approvals', label: `Approvals${pending.length ? ` (${pending.length})` : ''}`, icon: BellRing, show: perm('approvals', 'view') },
    { id: 'access', label: `Access${accessWaiting ? ` (${accessWaiting})` : ''}`, icon: UserCheck, show: !acting },
  ]
  const TABS = allTabs.filter(t => t.show) as ShellTab[]

  const shellMe: MeLite = { role: 'member', username: meState?.username, firstName: meState?.firstName, name: meState?.name, avatar: meState?.avatar }

  return (
    <Shell saveState={busy} me={shellMe} tabs={TABS} activeTab={tab} onTab={id => setTab(id as MemberTab)}>
      {header}
      {tab === 'access' && <AccessTab doc={doc} me={me} action={action} onSwitch={owner => onSwitch?.(owner)} />}
      {tab === 'month' && <MemberMonth doc={doc} entityId={entityId} k={key} setKey={setKey} action={action} openEditor={setEditing} actingAs={acting?.owner} />}
      {tab === 'settle' && <SettlementTab doc={doc} me={me} k={key} setKey={setKey} action={action} />}
      {tab === 'year' && <YearTab doc={doc} year={year} setYear={setYear} openMonth={k => { setKey(k); setTab('month') }} />}
      {tab === 'tags' && <TagsTab doc={doc} />}
      {tab === 'loans' && <LoansTab doc={doc} me={me} />}
      {tab === 'savings' && <MemberSavings doc={doc} entityId={entityId} onSave={rows => action({ action: 'setSavings', savings: rows })} />}
      {tab === 'setup' && (
        <>
          <BudgetSwitch view={budgetView} onView={setBudgetView} />
          {budgetView === 'recurring'
            ? <MemberSetup doc={doc} entityId={entityId} envelopes={doc.envelopes ?? []}
                openTemplate={(item, section, op) => setEditing({ item, onSave: it => action({ action: 'proposeTemplate', item: it, section, op }) })}
                onRemove={(item, section) => action({ action: 'proposeTemplate', item, section, op: 'delete' })}
                onSaveIncome={rows => action({ action: 'setTemplateIncome', income: rows })} />
            : budgetView === 'ahead'
              ? <AheadTab doc={doc} me={me} />
              : <BudgetTab doc={doc} me={me} onSaveBudget={(_who, b) => action({ action: 'setBudget', budget: b })} />}
        </>
      )}
      {tab === 'import' && <ImportTab doc={doc} me={me} onImport={(rows, owner) => action({ action: 'importRows', rows, owner })} />}
      {tab === 'approvals' && <ApprovalsTab doc={doc} me={me} onDecide={(id, kind) => action({ action: kind, id })} onRevoke={id => action({ action: 'revoke', id })} onRevert={(auditId, reason) => action({ action: 'revertChange', auditId, reason })} />}
      {tab === 'profile' && <ProfileTab me={meState} onSaved={p => setMeState(m => ({ ...(m ?? { role: 'member' }), ...p }))} />}
      <ErrorToast text={actErr} onClose={() => setActErr(null)} />

      {editing && (
        <ExpenseEditor item={editing.item} entities={doc.entities} envelopes={doc.envelopes ?? []} categories={doc.categories} onAddCategory={() => {}} allowNewCategory={false}
          onSave={it => { editing.onSave(it); setEditing(null) }} onClose={() => setEditing(null)} />
      )}
    </Shell>
  )
}

// What the statement says against what was expected. The useful part is not
// the matches — it is the three things that would otherwise pass unnoticed: a
// bill that never went out, one that went out twice, and one whose amount has
// moved because the rate was revised.
function ReconPanel({ recon, ownerName, onClose, onSkipMatched }: {
  recon: Recon & { months: string[] }
  ownerName: string
  onClose: () => void
  onSkipMatched: () => void
}) {
  const { matched, missing, duplicates, drift } = recon
  const clean = missing.length === 0 && duplicates.length === 0 && drift.length === 0
  const span = recon.months.map(m => monthLabel(m)).join(', ')
  return (
    <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem', borderLeft: `3px solid ${clean ? 'var(--vg-pos)' : 'var(--vg-neg)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <p className="vg-sec" style={{ margin: 0 }}>
          <Scale className="h-4 w-4" style={{ display: 'inline', verticalAlign: '-3px' }} /> Against what was expected · {span}
        </p>
        <button className="vg-icobtn" onClick={onClose} aria-label="Hide"><X className="h-4 w-4" /></button>
      </div>

      <p className="vg-muted" style={{ fontSize: '0.82rem', margin: '0.5rem 0 0' }}>
        {matched.length} of {matched.length + missing.length} payments {ownerName} was due to make {matched.length === 1 ? 'is' : 'are'} in this statement.
        {clean && ' Nothing missing, nothing doubled, no amount has moved.'}
      </p>

      {missing.length > 0 && (
        <div style={{ marginTop: '0.8rem' }}>
          <p style={{ margin: '0 0 0.3rem', fontWeight: 700, fontSize: '0.88rem' }} className="vg-neg">Expected, but not in this statement</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {missing.map(it => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.82rem' }}>
                <span>{it.name}{it.kind === 'emi' && <span className="vg-chip" style={{ marginLeft: 6 }}>EMI</span>}</span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{INR(it.amount)}</b>
              </div>
            ))}
          </div>
          <p className="vg-muted" style={{ fontSize: '0.74rem', marginTop: '0.4rem' }}>Either it did not go out — worth checking, an EMI that bounces costs a penalty — or it was paid from a different account than this statement.</p>
        </div>
      )}

      {duplicates.length > 0 && (
        <div style={{ marginTop: '0.8rem' }}>
          <p style={{ margin: '0 0 0.3rem', fontWeight: 700, fontSize: '0.88rem' }} className="vg-neg">Paid more than once</p>
          {duplicates.map(d => (
            <div key={d.item.id} style={{ fontSize: '0.82rem' }}>
              {d.item.name} — {d.rows.length} debits of {d.rows.map(r => INR(r.amount)).join(', ')} on {d.rows.map(r => fmtDay(r.date)).join(' and ')}
            </div>
          ))}
        </div>
      )}

      {drift.length > 0 && (
        <div style={{ marginTop: '0.8rem' }}>
          <p style={{ margin: '0 0 0.3rem', fontWeight: 700, fontSize: '0.88rem' }}>Amounts that have moved</p>
          {drift.map(m => (
            <div key={m.item.id} style={{ fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{m.item.name}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                expected <b>{INR(m.item.amount)}</b> · paid <b className={m.amountDiff > 0 ? 'vg-neg' : 'vg-pos'}>{INR(m.row.amount)}</b>
              </span>
            </div>
          ))}
          <p className="vg-muted" style={{ fontSize: '0.74rem', marginTop: '0.4rem' }}>On a floating-rate loan this is usually a rate revision. Update the amount under Budget, or the interest worked out on the Loans page will drift from what you are actually paying.</p>
        </div>
      )}

      {matched.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: '0.9rem', paddingTop: '0.7rem', borderTop: '1px solid var(--vg-line)' }}>
          <span className="vg-muted" style={{ fontSize: '0.78rem' }}>{matched.length} row{matched.length === 1 ? '' : 's'} already tracked as recurring — importing them again would double them up.</span>
          <button className="vg-btn" onClick={onSkipMatched}>Untick those {matched.length}</button>
        </div>
      )}
    </div>
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
  const [owner, setOwner] = useState(me.role === 'super' ? firstPerson(doc.entities) : (me.entityId ?? ''))
  const [done, setDone] = useState(0)
  const [proposedN, setProposedN] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [reconOpen, setReconOpen] = useState(true)
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
      setReconOpen(true)
    } catch { setRows([]) }
  }
  const upd = (id: string, patch: Partial<ImpRow>) => setRows(r => r.map(x => x.id === id ? { ...x, ...patch } : x))
  const setAll = (v: boolean) => setRows(r => r.map(x => ({ ...x, include: v })))

  // The statement is checked against what the recurring commitments say should
  // have gone out of THIS account that month, so a missed, doubled or revised
  // instalment is visible — and a bill already tracked is not imported twice.
  const recon = useMemo(() => {
    if (rows.length === 0 || !owner) return null
    const months = [...new Set(rows.map(r => r.date.slice(0, 7)))].filter(Boolean).sort()
    if (months.length === 0) return null
    const expected = months.flatMap(mk => monthView(doc, mk).items)
    return { months, ...reconcile(expected, rows.map(r => ({ id: r.id, date: r.date, payee: r.payee, desc: r.desc, amount: r.amount, type: r.type })), owner) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, owner, doc])
  const matchedIds = useMemo(() => new Set((recon?.matched ?? []).map(m => m.row.id)), [recon])

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
          <p style={{ margin: 0, color: 'var(--vg-ink)' }}>
            <FileSpreadsheet className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} /> Upload a <b>bank statement CSV</b>. It reads every credit and debit, guesses a category, and lets you tick which to bring in — you can fix the payee, category and add a remark first.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="vg-btn vg-btn-primary" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> {fileName ? 'Choose another' : 'Upload CSV'}</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={e => onFile(e.target.files)} />
          </div>
        </div>
        {(done > 0 || proposedN > 0 || skipped > 0) && <p className="vg-pos" style={{ marginTop: '0.6rem', marginBottom: 0 }}><Check className="h-4 w-4" style={{ display: 'inline' }} /> Added {done}{proposedN > 0 ? ` · sent ${proposedN} for approval` : ''}{skipped > 0 ? ` · skipped ${skipped} already imported` : ''}. Personal ones land in their month; shared ones wait on a yes.</p>}
      </div>

      {recon && reconOpen && (
        <ReconPanel recon={recon} ownerName={ownerName} onClose={() => setReconOpen(false)}
          onSkipMatched={() => setRows(r => r.map(x => matchedIds.has(x.id) ? { ...x, include: false } : x))} />
      )}

      {rows.length > 0 && (
        <>
          <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="vg-muted" style={{ fontSize: '0.85rem' }}><b style={{ color: 'var(--vg-ink)' }}>{selected.length}</b> of {rows.length} selected</span>
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
          </div>
        </>
      )}
    </>
  )
}

// ---------- Member: Setup (edits route through approval) --------
// Same tables and columns as the super's Budget (Setup) page, including the
// Envelope column and the Recurring income table — the difference is purely
// who can write: an item that's only yours applies straight away, anything
// common or shared is sent to the tagged person to approve first.
function MemberSetup({ doc, entityId, envelopes, openTemplate, onRemove, onSaveIncome }: {
  doc: FinanceDoc; entityId: string; envelopes: Envelope[]
  openTemplate: (item: Item, section: 'monthly' | 'emis' | 'annual', op: 'add' | 'update') => void
  onRemove: (item: Item, section: 'monthly' | 'emis' | 'annual') => void
  onSaveIncome: (rows: { id: string; source: string; amount: number }[]) => void
}) {
  const envName = (id?: string) => envelopes.find(e => e.id === (id ?? HOUSEHOLD))?.name ?? 'Lamba Household'
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
            <th>Item</th><th>Envelope</th><th>Paid by</th><th>Shared</th>
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
                  <td><span className="vg-chip" style={{ fontSize: '0.72rem' }}>{envName(it.envelope)}</span></td>
                  <td><span className="vg-chip" style={{ background: entColor(doc.entities, it.paidBy) + '22', color: inkOf(entColor(doc.entities, it.paidBy)) }}>{entName(doc.entities, it.paidBy)}</span></td>
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
            {doc.template[section].length === 0 && <tr><td colSpan={section === 'emis' ? 8 : section === 'annual' ? 7 : 6} className="vg-muted" style={{ textAlign: 'center', padding: '1rem' }}>Nothing yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <>
      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        <p style={{ margin: 0, color: 'var(--vg-ink)' }}>
          <SlidersHorizontal className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} /> Your household&rsquo;s <b>recurring</b> items. Add or change anything here — items that are <b>only yours</b> apply straight away, while anything <b>common or shared</b> is sent to the tagged person to approve first. You only see common items and ones that involve you.
        </p>
      </div>
      <div className="vg-grid2">
        <Section title="Monthly recurring" section="monthly" />
        <Section title="EMIs & loans" section="emis" />
        <Section title="Yearly items" section="annual" />
        <MemberRecurringIncome doc={doc} entityId={entityId} onSave={onSaveIncome} />
      </div>
    </>
  )
}

// Recurring income, same table as the super's Budget page: your own rows are
// private and apply straight away; the common baseline is a household
// decision, so it's shown but only the family admin can change it here.
function MemberRecurringIncome({ doc, entityId, onSave }: {
  doc: FinanceDoc; entityId: string
  onSave: (rows: { id: string; source: string; amount: number }[]) => void
}) {
  const mine = () => doc.template.income.filter(i => i.entity === entityId).map(r => ({ id: r.id, source: r.source, amount: r.amount }))
  const common = doc.template.income.filter(i => i.entity === 'common')
  const [draft, setDraft] = useState(mine)
  useEffect(() => { setDraft(mine()) /* eslint-disable-next-line */ }, [doc])
  const dirty = JSON.stringify(draft) !== JSON.stringify(mine())
  const set = (id: string, patch: Partial<{ source: string; amount: number }>) => setDraft(d => d.map(r => r.id === id ? { ...r, ...patch } : r))
  const add = () => setDraft(d => [...d, { id: uid('inc'), source: 'Salary', amount: 0 }])
  const del = (id: string) => setDraft(d => d.filter(r => r.id !== id))

  return (
    <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
        <p className="vg-sec" style={{ margin: 0 }}>Recurring income</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="vg-btn" onClick={add}><Plus className="h-4 w-4" /> Add</button>
          <button className="vg-btn vg-btn-primary" disabled={!dirty} onClick={() => onSave(draft.map(r => ({ ...r, amount: Number(r.amount) || 0 })))}><Check className="h-4 w-4" /> Save</button>
        </div>
      </div>
      <div className="vg-tablewrap">
        <table className="vg-table" style={{ minWidth: 360 }}>
          <thead><tr><th>Source</th><th>Who</th><th className="num">Amount</th><th style={{ width: 40 }}></th></tr></thead>
          <tbody>
            {common.map(i => (
              <tr key={i.id}>
                <td>{i.source}</td>
                <td><span className="vg-chip">Common</span></td>
                <td className="num">{INR(i.amount)}</td>
                <td></td>
              </tr>
            ))}
            {draft.map(r => (
              <tr key={r.id}>
                <td><input className="vg-input" value={r.source} onChange={e => set(r.id, { source: e.target.value })} /></td>
                <td><span className="vg-chip" style={{ background: entColor(doc.entities, entityId) + '22', color: inkOf(entColor(doc.entities, entityId)) }}>{entName(doc.entities, entityId)}</span></td>
                <td className="num"><input className="vg-input vg-num" inputMode="numeric" value={String(r.amount)} onChange={e => set(r.id, { amount: num(e.target.value) })} /></td>
                <td><button className="vg-icobtn" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
            {common.length === 0 && draft.length === 0 && <tr><td colSpan={4} className="vg-muted" style={{ textAlign: 'center', padding: '1rem' }}>No recurring income.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// The debt curve. Every future balance is already fixed by the schedules, so
// this is a statement rather than a projection — the only uncertainty is
// whether anything is paid off early.
function DebtCurve({ points, today }: { points: DebtPoint[]; today: string }) {
  const max = Math.max(1, ...points.map(p => p.owed))
  const n = Math.max(1, points.length - 1)
  const x = (i: number) => (i / n) * 100
  const y = (v: number) => 38 - (v / max) * 34
  const line = points.map((p, i) => `${x(i).toFixed(2)},${y(p.owed).toFixed(2)}`).join(' ')
  const area = `0,38 ${line} 100,38`
  const nowIdx = Math.max(0, points.findIndex(p => p.key === today))
  return (
    <div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: '100%', height: 150, display: 'block' }} role="img" aria-label="What is owed, month by month">
        <defs>
          <linearGradient id="debtFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--vg-accent)', stopOpacity: 0.32 }} />
            <stop offset="100%" style={{ stopColor: 'var(--vg-accent)', stopOpacity: 0.02 }} />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#debtFade)" />
        <polyline points={line} fill="none" style={{ stroke: 'var(--vg-accent)' }} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <line x1={x(nowIdx)} y1="0" x2={x(nowIdx)} y2="38" style={{ stroke: 'var(--vg-g)' }} strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--vg-ink-faint)' }}>
        <span>{fmtMon(`${points[0]?.key}-01`)}</span>
        <span style={{ color: 'var(--vg-g)', fontWeight: 700 }}>now</span>
        <span>{fmtMon(`${points[points.length - 1]?.key}-01`)}</span>
      </div>
    </div>
  )
}

// What paying extra would do. The EMI stays the same and the loan ends
// sooner, which is where the interest saving comes from.
function PrepayCard({ loans, asOf }: { loans: LoanView[]; asOf: string }) {
  const usable = loans.filter(v => !v.estimated && (v.monthsLeft ?? 0) > 0)
  const [id, setId] = useState(usable[0]?.item.id ?? '')
  const [lump, setLump] = useState('')
  const [monthly, setMonthly] = useState('')
  const chosen = usable.find(v => v.item.id === id) ?? usable[0]
  const result = chosen ? simulatePrepay(chosen.item, { lump: num(lump), monthly: num(monthly), from: asOf }) : null
  const nothing = num(lump) <= 0 && num(monthly) <= 0

  if (usable.length === 0) return null
  return (
    <div className="vg-card vg-pad" style={{ marginTop: '1.1rem' }}>
      <p className="vg-sec" style={{ marginTop: 0 }}>What if you paid extra?</p>
      <div style={{ display: 'grid', gap: '0.7rem', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
        <div>
          <label className="vg-lbl">Loan</label>
          <select className="vg-select" value={chosen?.item.id ?? ''} onChange={e => setId(e.target.value)}>
            {usable.map(v => <option key={v.item.id} value={v.item.id}>{v.item.name}</option>)}
          </select>
        </div>
        <div>
          <label className="vg-lbl">A lump sum now</label>
          <input className="vg-input vg-num" inputMode="numeric" value={lump} placeholder="0" onChange={e => setLump(e.target.value)} />
          <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
            {[100000, 500000, 1000000].map(v => <button key={v} className="vg-btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.76rem' }} onClick={() => setLump(String(v))}>{INR(v)}</button>)}
          </div>
        </div>
        <div>
          <label className="vg-lbl">Extra every month</label>
          <input className="vg-input vg-num" inputMode="numeric" value={monthly} placeholder="0" onChange={e => setMonthly(e.target.value)} />
          <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
            {[2000, 5000, 10000].map(v => <button key={v} className="vg-btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.76rem' }} onClick={() => setMonthly(String(v))}>{INR(v)}</button>)}
          </div>
        </div>
      </div>

      {chosen && result && (
        <div style={{ marginTop: '1rem' }}>
          {nothing ? (
            <p className="vg-muted" style={{ fontSize: '0.85rem', margin: 0 }}>
              <b>{chosen.item.name}</b> runs to {chosen.endsOn ? fmtMon(`${chosen.endsOn}-01`) : '—'} with {INR(chosen.remainingInterest)} of interest still to pay. Put a figure in above to see what paying extra would do.
            </p>
          ) : !result.clears ? (
            <p className="vg-neg" style={{ fontSize: '0.85rem', margin: 0 }}>That instalment would not even cover the interest, so the loan would never clear.</p>
          ) : (
            <>
              <div className="vg-kpis">
                <Kpi label="Interest saved" value={INR(result.interestSaved)} cls="vg-pos" info="What you would not pay in interest, because the loan ends sooner." />
                <Kpi label="Finishes earlier by" value={`${result.monthsSaved} months`} cls="vg-pos" info={`${Math.floor(result.monthsSaved / 12)} years and ${result.monthsSaved % 12} months.`} />
                <Kpi label="Cleared by" value={result.endsOn ? fmtMon(`${result.endsOn}-01`) : '—'} info={`Instead of ${chosen.endsOn ? fmtMon(`${chosen.endsOn}-01`) : '—'}.`} />
                <Kpi label="Interest left to pay" small value={`${INR(result.interest)} of ${INR(result.baseInterest)}`} info="What the rest of this loan would cost in interest under the new plan, against what it costs now." />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Loans: amortisation and the tax year ----------------
// What the loans really cost. Outstanding here is the amortised balance, not
// EMI × instalments left — early instalments are mostly interest, so the two
// differ enormously on a long loan. The financial-year table is the figure
// needed at tax time, split the way the loan itself is split.
function LoansTab({ doc, me }: {
  doc: FinanceDoc; me: { role: 'super' | 'member'; entityId: string | null }
}) {
  const asOf = monthKey()
  const entities = doc.entities
  const loans = doc.template.emis
  const views = useMemo(() => loans.map(it => loanView(it, asOf)).sort((a, b) => (b.outstanding ?? 0) - (a.outstanding ?? 0)), [loans, asOf])
  const years = useMemo(() => {
    const set = new Set<string>([fyOf(asOf)])
    for (const v of views) for (const r of v.schedule) set.add(fyOf(r.month))
    return [...set].sort()
  }, [views, asOf])
  const [fy, setFy] = useState(fyOf(asOf))

  // A member sees the loans through their own share; super sees the whole.
  const viewer = me.role === 'member' ? me.entityId : null
  const frac = (it: Item) => (viewer ? (shares(it)[viewer] ?? 0) : 1)
  const persons = entities.filter(e => e.kind === 'person')
  const sharers = persons.filter(p => loans.some(it => (shares(it)[p.id] ?? 0) > 0.001))

  const live = views.filter(v => (v.monthsLeft ?? 1) > 0)
  const settled = views.filter(v => (v.monthsLeft ?? 1) <= 0)

  const outstanding = live.reduce((a, v) => a + (v.outstanding ?? 0) * frac(v.item), 0)
  const perMonth = live.reduce((a, v) => a + (v.item.amount || 0) * frac(v.item), 0)
  const toPay = live.reduce((a, v) => a + v.remainingInterest * frac(v.item), 0)
  const yearRows = loans.map(it => ({ it, y: loanYear(it, fy) })).filter(r => r.y.interest > 0.5 || r.y.principal > 0.5)
  const fyInterest = yearRows.reduce((a, r) => a + r.y.interest * frac(r.it), 0)
  const fyPrincipal = yearRows.reduce((a, r) => a + r.y.principal * frac(r.it), 0)
  // Two different gaps, with two different fixes — and neither is worth
  // raising about a loan that is already paid off.
  const needRate = live.filter(v => v.derivedZero)
  const needPrincipal = live.filter(v => v.estimated)

  // Savings are private to each profile, so only the person themselves has
  // both halves of a net worth. Super sees the debt side alone.
  const assets = viewer ? doc.savings.filter(sv => sv.entity === viewer).reduce((a, sv) => a + (sv.balance || 0), 0) : null
  const curve = useMemo(() => debtOverTime(doc, viewer, 6, 36, asOf), [doc, viewer, asOf])
  const freeBy = debtFreeBy(doc, viewer)

  return (
    <>
      <div className="vg-kpis" style={{ marginBottom: '1.1rem' }}>
        <Kpi label={viewer ? 'Your outstanding' : 'Outstanding'} value={INR(outstanding)} cls="vg-neg"
          info="What is still owed on the principal today, worked out instalment by instalment — not the EMI multiplied by the instalments left, which is much larger because it includes all the future interest." />
        <Kpi label={viewer ? 'Your EMIs a month' : 'EMIs a month'} value={INR(perMonth)} info="Everything going out on loan instalments each month." />
        <Kpi label="Interest this year" value={INR(fyInterest)} cls="vg-neg" info={`Interest falling in FY ${fy} — the figure that matters for a home-loan deduction.`} />
        <Kpi label="Principal this year" value={INR(fyPrincipal)} info={`How much of FY ${fy}'s instalments actually reduce what you owe.`} />
        <Kpi label="Interest still to come" small value={INR(toPay)} info="Interest remaining across the rest of every running loan, if each is paid to term." />
      </div>

      {(needRate.length > 0 || needPrincipal.length > 0) && (
        <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem', borderLeft: '3px solid var(--vg-accent)' }}>
          {needRate.length > 0 && (
            <p style={{ margin: 0, color: 'var(--vg-ink)', fontSize: '0.9rem' }}>
              <SlidersHorizontal className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} />{' '}
              <b>{needRate.map(v => v.item.name).join(', ')}</b> {needRate.length === 1 ? 'shows' : 'show'} no interest, because the recorded amount borrowed is exactly the instalments added up — so it looks like the <b>total payable</b> rather than the sum actually borrowed. Open the loan on the Budget page and correct the amount, or set the <b>rate</b> directly.
            </p>
          )}
          {needPrincipal.length > 0 && (
            <p style={{ margin: needRate.length > 0 ? '0.6rem 0 0' : 0, color: 'var(--vg-ink)', fontSize: '0.9rem' }}>
              <SlidersHorizontal className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} />{' '}
              <b>{needPrincipal.map(v => v.item.name).join(', ')}</b> {needPrincipal.length === 1 ? 'has' : 'have'} no amount borrowed or tenure recorded, so only EMI × instalments left can be shown — which overstates what is owed. Add those on the Budget page to get the real balance.
            </p>
          )}
        </div>
      )}

      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <p className="vg-sec" style={{ margin: 0 }}>{assets != null ? 'Where you stand' : 'What is owed, over time'}</p>
          {freeBy && <span className="vg-muted" style={{ fontSize: '0.8rem' }}>debt-free by <b>{fmtMon(`${freeBy}-01`)}</b></span>}
        </div>
        {assets != null && (
          <div className="vg-kpis" style={{ margin: '0.8rem 0' }}>
            <Kpi label="Savings" value={INR(assets)} cls="vg-pos" info="Everything in your savings pots. Private to you." />
            <Kpi label="Owed" value={INR(outstanding)} cls="vg-neg" info="Your share of the amortised balance across every running loan." />
            <Kpi label={assets - outstanding >= 0 ? 'Net worth' : 'Net position'} value={INR(Math.abs(assets - outstanding))} cls={assets - outstanding >= 0 ? 'vg-pos' : 'vg-neg'}
              info="Savings minus what you owe. Negative is ordinary while a home loan is young — the house it bought is not counted here." />
          </div>
        )}
        <div style={{ marginTop: assets != null ? 0 : '0.8rem' }}><DebtCurve points={curve} today={asOf} /></div>
      </div>

      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        <p className="vg-sec" style={{ marginTop: 0 }}>Running loans</p>
        <div className="vg-tablewrap">
          <table className="vg-table" style={{ minWidth: 820 }}>
            <thead><tr>
              <th>Loan</th>
              <th className="num" style={{ width: 92 }}>EMI</th>
              <th className="num" style={{ width: 70 }}>Rate</th>
              <th className="num">Outstanding</th>
              <th className="num">Interest paid</th>
              <th style={{ width: '22%' }}>Principal repaid</th>
              <th style={{ width: 96 }}>Ends</th>
            </tr></thead>
            <tbody>
              {live.map(v => {
                const f = frac(v.item)
                const borrowed = v.item.principal ?? 0
                const repaid = borrowed > 0 ? v.paidPrincipal / borrowed : 0
                return (
                  <tr key={v.item.id}>
                    <td>
                      <span className="vg-nm" style={{ fontWeight: 600 }}>{v.item.name}</span>
                      {f > 0 && f < 0.999 && <span className="vg-chip" style={{ marginLeft: 6 }}>your {Math.round(f * 100)}%</span>}
                      {v.estimated && <span className="vg-chip" style={{ marginLeft: 6, background: 'rgba(224,112,60,0.14)', color: 'var(--vg-warn)' }}>estimate</span>}
                    </td>
                    <td className="num">{INR((v.item.amount || 0) * f)}</td>
                    <td className="num vg-muted">{v.annualRate != null ? `${v.annualRate.toFixed(2)}%` : '—'}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{v.outstanding != null ? INR(v.outstanding * f) : '—'}</td>
                    <td className="num vg-neg">{v.paidInterest > 0 ? INR(v.paidInterest * f) : '—'}</td>
                    <td>
                      {borrowed > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ flex: 1, height: 8, borderRadius: 999, background: 'color-mix(in srgb, var(--vg-ink-faint) 12%, transparent)', overflow: 'hidden' }}>
                            <span style={{ display: 'block', height: '100%', width: `${Math.min(100, repaid * 100)}%`, borderRadius: 999, background: 'linear-gradient(90deg,var(--vg-accent-2),var(--vg-accent))' }} />
                          </span>
                          <b style={{ fontSize: '0.76rem', fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'right', color: 'var(--vg-ink-soft)' }}>{Math.round(repaid * 100)}%</b>
                        </div>
                      ) : <span className="vg-muted" style={{ fontSize: '0.76rem' }}>no principal recorded</span>}
                    </td>
                    <td className="vg-muted" style={{ fontSize: '0.8rem' }}>
                      {v.endsOn ? fmtMon(`${v.endsOn}-01`) : 'Open'}
                      {v.monthsLeft != null && <span style={{ display: 'block', fontSize: '0.72rem' }}>{v.monthsLeft} left</span>}
                    </td>
                  </tr>
                )
              })}
              {live.length === 0 && <tr><td colSpan={7} className="vg-muted" style={{ textAlign: 'center', padding: '1.2rem' }}>No running loans.</td></tr>}
            </tbody>
          </table>
        </div>
        {settled.length > 0 && (
          <p className="vg-muted" style={{ fontSize: '0.78rem', marginTop: '0.7rem' }}>
            Paid off: {settled.map(v => v.item.name).join(', ')}.
          </p>
        )}
      </div>

      <div className="vg-card vg-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: '0.7rem' }}>
          <p className="vg-sec" style={{ margin: 0 }}>Interest by financial year</p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="vg-muted" style={{ fontSize: '0.78rem' }}>April to March</span>
            <select className="vg-select" value={fy} onChange={e => setFy(e.target.value)} style={{ maxWidth: 140, fontWeight: 600 }} aria-label="Financial year">
              {years.map(y => <option key={y} value={y}>FY {y}</option>)}
            </select>
          </div>
        </div>
        <div className="vg-tablewrap">
          <table className="vg-table" style={{ minWidth: 640 }}>
            <thead><tr>
              <th>Loan</th>
              <th className="num">Paid in the year</th>
              <th className="num">Interest</th>
              <th className="num">Principal</th>
              {!viewer && sharers.map(p => <th key={p.id} className="num" style={{ color: inkOf(p.color) }}>{p.name}&rsquo;s interest</th>)}
            </tr></thead>
            <tbody>
              {yearRows.map(({ it, y }) => (
                <tr key={it.id}>
                  <td className="vg-nm" style={{ fontWeight: 600 }}>{it.name}</td>
                  <td className="num vg-muted">{INR(y.paid * frac(it))}</td>
                  <td className="num vg-neg" style={{ fontWeight: 600 }}>{INR(y.interest * frac(it))}</td>
                  <td className="num">{INR(y.principal * frac(it))}</td>
                  {!viewer && sharers.map(p => <td key={p.id} className="num vg-muted">{y.byEntity[p.id] ? INR(y.byEntity[p.id].interest) : '—'}</td>)}
                </tr>
              ))}
              {yearRows.length === 0 && <tr><td colSpan={4 + (viewer ? 0 : sharers.length)} className="vg-muted" style={{ textAlign: 'center', padding: '1.2rem' }}>Nothing falls in this year.</td></tr>}
            </tbody>
            {yearRows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid color-mix(in srgb, var(--vg-accent) 25%, transparent)' }}>
                  <td style={{ fontWeight: 700, paddingTop: '0.6rem' }}>Total</td>
                  <td className="num" style={{ paddingTop: '0.6rem' }}>{INR(yearRows.reduce((a, r) => a + r.y.paid * frac(r.it), 0))}</td>
                  <td className="num vg-neg" style={{ fontWeight: 800, paddingTop: '0.6rem' }}>{INR(fyInterest)}</td>
                  <td className="num" style={{ fontWeight: 700, paddingTop: '0.6rem' }}>{INR(fyPrincipal)}</td>
                  {!viewer && sharers.map(p => (
                    <td key={p.id} className="num" style={{ fontWeight: 700, color: inkOf(p.color), paddingTop: '0.6rem' }}>
                      {INR(yearRows.reduce((a, r) => a + (r.y.byEntity[p.id]?.interest ?? 0), 0))}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <PrepayCard loans={live} asOf={asOf} />
    </>
  )
}

// ---------- The year ahead: forecast and set-asides --------------
// Yearly bills are what turn an ordinary month into a difficult one, so this
// shows the months coming and what quietly putting money aside each month
// would do to them. The months are projected by materialising the template
// exactly as each month would be when it arrives, and charged by the same
// rule My Dashboard uses, so the figures agree with the rest of the app.
function AheadTab({ doc, me }: {
  doc: FinanceDoc; me: { role: 'super' | 'member'; entityId: string | null }
}) {
  const viewer = me.role === 'member' ? me.entityId : null
  const from = monthKey()
  const [span, setSpan] = useState(6)
  const months = useMemo(() => forecast(doc, viewer, span, from), [doc, viewer, span, from])
  const sinking = useMemo(() => sinkingFund(doc, viewer, from), [doc, viewer, from])

  const setAside = sinking.reduce((a, r) => a + (viewer ? r.yours : r.perMonth), 0)
  const nextBill = sinking[0]
  const tightest = months.reduce<ForecastMonth | null>((worst, m) => (!worst || m.net < worst.net ? m : worst), null)
  const yearlyTotal = sinking.reduce((a, r) => a + (viewer ? r.yours * 12 : r.annual), 0)
  const maxScale = Math.max(1, ...months.map(m => Math.max(m.income, m.outflow)))
  const mine = (r: SinkingRow) => (viewer ? r.yours : r.perMonth)

  return (
    <>
      <div className="vg-kpis" style={{ marginBottom: '1.1rem' }}>
        <Kpi label={viewer ? 'Your set-aside a month' : 'Set aside a month'} value={INR(setAside)} cls="vg-accent"
          info="Put this away every month and every yearly bill is already paid for when it lands. It is the bills for the year, spread evenly." />
        <Kpi label="Yearly bills" value={INR(yearlyTotal)} info="What those bills come to across a whole year." />
        <Kpi label="Next one due" small
          value={nextBill ? `${nextBill.item.name} · ${INR(nextBill.annual)}` : '—'}
          info={nextBill ? `Lands in ${monthLabel(nextBill.nextDue)}, ${nextBill.monthsToGo === 0 ? 'this month' : `${nextBill.monthsToGo} month${nextBill.monthsToGo === 1 ? '' : 's'} away`}.` : 'No yearly bills recorded.'} />
        {tightest && <Kpi label="Tightest month ahead" small value={`${monthLabel(tightest.key)} · ${tightest.net >= 0 ? INR(tightest.net) + ' spare' : INR(Math.abs(tightest.net)) + ' short'}`}
          cls={tightest.net >= 0 ? undefined : 'vg-neg'} info="The month with the least left over, on today's commitments." />}
      </div>

      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: '0.7rem' }}>
          <p className="vg-sec" style={{ margin: 0 }}>{viewer ? 'What the next months cost you' : 'What the next months cost the household'}</p>
          <div className="vg-subtabs">
            {[3, 6, 12].map(n => <button key={n} className="vg-subtab" data-on={span === n} onClick={() => setSpan(n)}>{n} months</button>)}
          </div>
        </div>
        <div className="vg-tablewrap">
          <table className="vg-table" style={{ minWidth: 680 }}>
            <thead><tr>
              <th>Month</th>
              <th className="num">Coming in</th>
              <th className="num">Going out</th>
              <th className="num">Left over</th>
              <th style={{ width: '32%' }}>Out against in</th>
            </tr></thead>
            <tbody>
              {months.map(f => {
                const over = f.net < 0
                return (
                  <tr key={f.key} className={f.key === from ? 'vg-row-paid' : ''}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{monthLabel(f.key)}</span>
                      {f.spikes.length > 0 && (
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {f.spikes.map((s, i) => (
                            <span key={i} className="vg-chip" style={{ background: 'rgba(224,112,60,0.14)', color: 'var(--vg-warn)', fontSize: '0.68rem' }}>{s.name} {INR(s.amount)}</span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="num vg-pos">{INR(f.income)}</td>
                    <td className="num">{INR(f.outflow)}</td>
                    <td className="num" style={{ fontWeight: 700 }}><b className={over ? 'vg-neg' : 'vg-pos'}>{over ? '−' : ''}{INR(Math.abs(f.net))}</b></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ position: 'relative', flex: 1, height: 10, borderRadius: 999, background: 'rgba(31,157,107,0.16)', overflow: 'hidden' }}>
                          <span style={{ display: 'block', height: '100%', width: `${Math.min(100, (f.outflow / maxScale) * 100)}%`, borderRadius: 999, background: over ? 'var(--vg-neg)' : 'linear-gradient(90deg,var(--vg-accent-2),var(--vg-accent))' }} />
                        </span>
                        <b style={{ fontSize: '0.76rem', fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'right', color: over ? 'var(--vg-neg)' : 'var(--vg-ink-soft)' }}>
                          {f.income > 0 ? `${Math.round((f.outflow / f.income) * 100)}%` : '—'}
                        </b>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="vg-card vg-pad">
        <p className="vg-sec" style={{ marginTop: 0 }}>Yearly bills — the monthly set-aside</p>
        <div className="vg-tablewrap">
          <table className="vg-table" style={{ minWidth: 680 }}>
            <thead><tr>
              <th>Bill</th>
              <th>Next due</th>
              <th className="num">Once a year</th>
              <th className="num">{viewer ? 'Your set-aside' : 'Set aside'} / month</th>
              <th className="num">If you start now</th>
            </tr></thead>
            <tbody>
              {sinking.map(r => (
                <tr key={r.item.id}>
                  <td>
                    <span className="vg-nm" style={{ fontWeight: 600 }}>{r.item.name}</span>
                    {r.commonPaid && <span className="vg-chip" style={{ marginLeft: 6 }}>common</span>}
                  </td>
                  <td className="vg-muted" style={{ fontSize: '0.82rem' }}>
                    {monthLabel(r.nextDue)}
                    <span style={{ display: 'block', fontSize: '0.72rem' }}>{r.monthsToGo === 0 ? 'this month' : `${r.monthsToGo} month${r.monthsToGo === 1 ? '' : 's'} away`}</span>
                  </td>
                  <td className="num vg-muted">{INR(r.annual)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{INR(mine(r))}</td>
                  <td className="num vg-muted">{INR(viewer ? r.catchUp * (r.perMonth > 0 ? r.yours / r.perMonth : 0) : r.catchUp)}</td>
                </tr>
              ))}
              {sinking.length === 0 && <tr><td colSpan={5} className="vg-muted" style={{ textAlign: 'center', padding: '1.2rem' }}>No yearly bills recorded yet. Add them under Recurring commitments and they will be planned for here.</td></tr>}
            </tbody>
            {sinking.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid color-mix(in srgb, var(--vg-accent) 25%, transparent)' }}>
                  <td colSpan={3} style={{ fontWeight: 700, paddingTop: '0.6rem' }}>Every month, to stay ahead of all of them</td>
                  <td className="num" style={{ fontWeight: 800, paddingTop: '0.6rem' }}>{INR(setAside)}</td>
                  <td style={{ paddingTop: '0.6rem' }}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </>
  )
}
