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
  Equal,
} from 'lucide-react'
import {
  type FinanceDoc, type MonthData, type Item, type IncomeItem, type Entity,
  type SavingItem, type Alloc, type Bucket, type Template, type Category,
  seedDoc, uid, monthKey, materialise, monthView, totals, byCategory, shares, applyTemplateToMonth,
  classify, INR, monthLabel, entName, entColor, ENTITY_COLORS,
} from '@/lib/finance-data'

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

function ExpenseEditor({ item, entities, categories, onAddCategory, onSave, onClose, onDelete }: {
  item: Item; entities: Entity[]; categories: Category[]; onAddCategory: (name: string, color: string) => void
  onSave: (it: Item) => void; onClose: () => void; onDelete?: () => void
}) {
  const [d, setD] = useState<Item>(() => structuredClone(item))
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
              <option value="__new">＋ New category…</option>
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
  if (bucket === 'emi') return { id: uid('emi'), name: '', amount: 0, kind: 'emi', paidBy: firstPerson(entities), alloc: equal, startDate: monthKey() + '-01', endDate: null, src: 'manual' }
  if (bucket === 'personal') { const p = firstPerson(entities); return { id: uid('one'), name: '', amount: 0, kind: 'oneoff', paidBy: p, alloc: { mode: 'single', who: p }, src: 'manual' } }
  return { id: uid('one'), name: '', amount: 0, kind: 'oneoff', paidBy: entities.find(e => e.kind === 'common')?.id ?? 'common', alloc: equal, src: 'manual' }
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
type Tab = 'month' | 'year' | 'savings' | 'entities' | 'setup'
interface Editing { item: Item; commit: (it: Item) => void; remove?: () => void }

export default function FinanceDashboard() {
  const [doc, setDoc] = useState<FinanceDoc | null>(null)
  const [tab, setTab] = useState<Tab>('month')
  const [key, setKey] = useState<string>(monthKey())
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [setupDraft, setSetupDraft] = useState<Template | null>(null)
  const firstLoad = useRef(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/vault/finance')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then(d => { if (live) setDoc(d.doc as FinanceDoc) })
      .catch(() => { if (live) setDoc(seedDoc()) })
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
    setDoc(d => { if (!d) return d; const nd = structuredClone(d) as FinanceDoc; nd.months[k] = fn(nd.months[k] ?? materialise(nd.template, k)); return nd })
  }, [])

  const addCategory = useCallback((name: string, color: string) => patchDoc(d => { if (!d.categories.find(c => c.name === name)) d.categories = [...d.categories, { name, color }]; return d }), [patchDoc])

  if (!doc) return <Shell><p className="vg-empty"><Loader2 className="h-5 w-5 vg-spin" style={{ display: 'inline' }} /> Loading…</p></Shell>

  const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
    { id: 'month', label: 'This month', icon: CalendarDays },
    { id: 'year', label: 'Year', icon: Wallet },
    { id: 'savings', label: 'Savings', icon: PiggyBank },
    { id: 'entities', label: 'Entities', icon: Users },
    { id: 'setup', label: 'Setup', icon: SlidersHorizontal },
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
    <Shell saveState={saveState}>
      <div style={{ overflowX: 'auto', marginBottom: '1.1rem' }}>
        <div className="vg-tabs">
          {TABS.map(t => { const I = t.icon; return (
            <button key={t.id} className="vg-tab" data-on={tab === t.id} onClick={() => setTab(t.id)}>
              <I className="h-3.5 w-3.5" style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />{t.label}
            </button>) })}
        </div>
      </div>

      {tab === 'month' && <MonthTab doc={doc} k={key} setKey={setKey} patchMonth={patchMonth} openEditor={setEditing} />}
      {tab === 'year' && <YearTab doc={doc} year={year} setYear={setYear} openMonth={k => { setKey(k); setTab('month') }} />}
      {tab === 'savings' && <SavingsTab doc={doc} patchDoc={patchDoc} />}
      {tab === 'entities' && <EntitiesTab doc={doc} patchDoc={patchDoc} />}
      {tab === 'setup' && <SetupTab entities={doc.entities} draft={setupTemplate} setDraft={setSetupTemplate} dirty={setupDirty} onSave={saveSetup} onDiscard={() => setSetupDraft(null)} currentMonth={monthKey()} openEditor={setEditing} />}

      {editing && (
        <ExpenseEditor
          item={editing.item} entities={doc.entities}
          categories={doc.categories} onAddCategory={addCategory}
          onSave={it => { editing.commit(it); setEditing(null) }}
          onClose={() => setEditing(null)}
          onDelete={editing.remove ? () => { editing.remove!(); setEditing(null) } : undefined}
        />
      )}
    </Shell>
  )
}

function Shell({ children, saveState }: { children: React.ReactNode; saveState?: 'idle' | 'saving' | 'saved' }) {
  return (
    <div className="vg">
      <div className="vg-wrap">
        <div className="vg-top">
          <div>
            <Link href="/vault" className="vg-back"><ArrowLeft className="h-4 w-4" /> Vault</Link>
            <h1 className="vg-h1">Finance</h1>
          </div>
          <div style={{ minWidth: 90, textAlign: 'right' }}>
            {saveState === 'saving' && <span className="vg-muted" style={{ fontSize: '0.8rem' }}><Loader2 className="h-3.5 w-3.5 vg-spin" style={{ display: 'inline' }} /> Saving…</span>}
            {saveState === 'saved' && <span className="vg-pos" style={{ fontSize: '0.8rem' }}><Check className="h-3.5 w-3.5" style={{ display: 'inline' }} /> Saved</span>}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---------- Month tab -------------------------------------------
function MonthTab({ doc, k, setKey, patchMonth, openEditor }: {
  doc: FinanceDoc; k: string; setKey: (k: string) => void
  patchMonth: (k: string, fn: (m: MonthData) => MonthData) => void
  openEditor: (e: Editing) => void
}) {
  const [bucket, setBucket] = useState<Bucket>('common')
  const [reading, setReading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const entities = doc.entities

  useEffect(() => { if (!doc.months[k]) patchMonth(k, m => m) /* eslint-disable-next-line */ }, [k])

  const m = doc.months[k] ?? materialise(doc.template, k)
  const t = totals(m, entities)
  const step = (delta: number) => { const [y, mo] = k.split('-').map(Number); setKey(monthKey(new Date(y, mo - 1 + delta, 1))) }

  const addToMonth = (it: Item) => patchMonth(k, mm => ({ ...mm, items: [...mm.items, it] }))
  const updItem = (it: Item) => patchMonth(k, mm => ({ ...mm, items: mm.items.map(x => x.id === it.id ? it : x) }))
  const delItem = (id: string) => patchMonth(k, mm => ({ ...mm, items: mm.items.filter(x => x.id !== id) }))
  const togglePaid = (id: string, v: boolean) => patchMonth(k, mm => ({ ...mm, items: mm.items.map(x => x.id === id ? { ...x, paid: v } : x) }))

  const openNew = (b: Bucket) => openEditor({ item: newItem(b, entities), commit: addToMonth })
  const openEdit = (it: Item) => openEditor({ item: it, commit: updItem, remove: () => delItem(it.id) })

  async function onReceipt(files: FileList | null) {
    if (!files || !files[0]) return
    const file = files[0]
    setReading(true)
    const it = newItem('common', entities)
    try {
      const b64 = await fileToB64(file)
      const res = await fetch('/api/vault/receipt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: b64, mediaType: file.type }) })
      const info = await res.json().catch(() => ({}))
      if (info.amount) it.amount = Number(info.amount) || 0
      if (info.merchant) it.name = String(info.merchant)
      if (info.note && !it.name) it.name = String(info.note)
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

  const rows = m.items.filter(it => classify(it, entities) === bucket)
  const counts = { common: 0, emi: 0, personal: 0 } as Record<Bucket, number>
  m.items.forEach(it => { counts[classify(it, entities)]++ })

  const setInc = (id: string, patch: Partial<IncomeItem>) => patchMonth(k, mm => ({ ...mm, income: mm.income.map(i => i.id === id ? { ...i, ...patch } : i) }))
  const delInc = (id: string) => patchMonth(k, mm => ({ ...mm, income: mm.income.filter(i => i.id !== id) }))
  const addInc = () => patchMonth(k, mm => ({ ...mm, income: [...mm.income, { id: uid('inc'), source: 'Income', entity: firstPerson(entities), amount: 0, src: 'manual' as const }] }))

  const cats = byCategory(m).map((c, i) => ({ ...c, color: catColor(c.name, doc.categories, i) }))
  const bears = entities.map(e => ({ label: e.name, value: t.byEntity[e.id] ?? 0, color: e.color })).filter(p => p.value > 0)
  const settleTxt = t.transfers.length === 0 ? 'All settled — nobody owes anyone.' : ''

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.1rem' }}>
        <div className="vg-nav">
          <button className="vg-icobtn" onClick={() => step(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
          <span className="lbl">{monthLabel(k)}</span>
          <button className="vg-icobtn" onClick={() => step(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <button className="vg-btn" onClick={() => setKey(monthKey())}><CalendarDays className="h-4 w-4" /> This month</button>
      </div>

      <div className="vg-kpis" style={{ marginBottom: '1.1rem' }}>
        <Kpi label="Income" value={INR(t.income)} cls="vg-pos" info="All the money that came in this month — salary, rental and anything you list under Income." />
        <Kpi label="Expenses" value={INR(t.expense)} info="Everything spent this month, added up across the Common, EMI and Personal tabs." />
        <Kpi label={t.net >= 0 ? 'Saved' : 'Overspent'} value={INR(Math.abs(t.net))} cls={t.net >= 0 ? 'vg-pos' : 'vg-neg'} info="Income minus Expenses. Green means you kept money this month; red means you spent more than came in." />
        <Kpi label="Settle up" small value={t.transfers.length ? `${t.transfers.length} transfer${t.transfers.length > 1 ? 's' : ''}` : 'All square'} info="Because one person often pays for shared things, this works out who should pay whom so everyone ends up even. The exact payments are in the Settle-up card below." />
      </div>

      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
          <div className="vg-subtabs">
            <button className="vg-subtab" data-on={bucket === 'common'} onClick={() => setBucket('common')}>Common<span className="vg-count">{counts.common}</span></button>
            <button className="vg-subtab" data-on={bucket === 'emi'} onClick={() => setBucket('emi')}>EMI<span className="vg-count">{counts.emi}</span></button>
            <button className="vg-subtab" data-on={bucket === 'personal'} onClick={() => setBucket('personal')}>Personal<span className="vg-count">{counts.personal}</span></button>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button className="vg-btn" onClick={() => fileRef.current?.click()} disabled={reading}>{reading ? <Loader2 className="h-4 w-4 vg-spin" /> : <Camera className="h-4 w-4" />} Receipt</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onReceipt(e.target.files)} />
            <button className="vg-btn vg-btn-primary" onClick={() => openNew(bucket)}><Plus className="h-4 w-4" /> Add</button>
          </div>
        </div>
        <div className="vg-tablewrap">
          <table className="vg-table" style={{ minWidth: 560 }}>
            <thead><tr><th>Item</th><th>Paid by</th><th>Shared</th><th className="num">Amount</th><th style={{ width: 42 }}>Paid</th><th style={{ width: 76 }}></th></tr></thead>
            <tbody>
              {rows.map(it => (
                <tr key={it.id} className={it.paid ? 'vg-row-paid' : ''}>
                  <td><span className="vg-nm" style={{ fontWeight: 600 }}>{it.name || <span className="vg-muted">Untitled</span>}</span>{it.receiptKey && <span className="vg-chip" style={{ marginLeft: 6 }}>receipt</span>}</td>
                  <td><span className="vg-chip" style={{ background: entColor(entities, it.paidBy) + '22', color: entColor(entities, it.paidBy) }}>{entName(entities, it.paidBy)}</span></td>
                  <td className="vg-muted" style={{ fontSize: '0.8rem' }}>{shareSummary(it, entities)}</td>
                  <td className="num">{INR(it.amount)}</td>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!it.paid} onChange={e => togglePaid(it.id, e.target.checked)} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="vg-icobtn" onClick={() => openEdit(it)} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                      <button className="vg-icobtn" onClick={() => delItem(it.id)} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="vg-muted" style={{ textAlign: 'center', padding: '1.2rem' }}>Nothing in {bucket} this month. Use <b>Add</b> or snap a <b>Receipt</b>.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="vg-grid2">
        <div className="vg-card vg-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <p className="vg-sec" style={{ margin: 0 }}>Income</p>
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
function EntitiesTab({ doc, patchDoc }: { doc: FinanceDoc; patchDoc: (fn: (d: FinanceDoc) => FinanceDoc) => void }) {
  const upd = (id: string, patch: Partial<Entity>) => patchDoc(d => ({ ...d, entities: d.entities.map(e => e.id === id ? { ...e, ...patch } : e) }))
  const del = (id: string) => patchDoc(d => ({ ...d, entities: d.entities.filter(e => e.id !== id) }))
  const add = () => patchDoc(d => ({ ...d, entities: [...d.entities, { id: uid('ent'), name: 'New member', kind: 'person', canPay: false, earning: false, isLiability: true, color: ENTITY_COLORS[d.entities.length % ENTITY_COLORS.length] }] }))

  return (
    <>
      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        <p style={{ margin: 0, color: '#241b40' }}><Users className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)', verticalAlign: '-3px' }} /> These are the people (and the shared <b>Common</b> pool) you split and tag money against. Onboard a family member here — mark whether they <b>earn</b>, are a <b>dependant</b>, and whether they can <b>pay</b> (have an account money comes from).</p>
      </div>

      <div className="vg-card vg-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
          <p className="vg-sec" style={{ margin: 0 }}>Entities</p>
          <button className="vg-btn vg-btn-primary" onClick={add}><Plus className="h-4 w-4" /> Add member</button>
        </div>
        <div className="vg-tablewrap">
          <table className="vg-table" style={{ minWidth: 720 }}>
            <thead><tr><th style={{ width: 34 }}></th><th>Name</th><th style={{ width: 110 }}>Type</th><th style={{ width: 70 }}>Can pay</th><th style={{ width: 70 }}>Earns</th><th style={{ width: 90 }}>Dependant</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {doc.entities.map(e => (
                <tr key={e.id}>
                  <td><input type="color" value={e.color} onChange={ev => upd(e.id, { color: ev.target.value })} style={{ width: 26, height: 26, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} /></td>
                  <td><input className="vg-input" value={e.name} onChange={ev => upd(e.id, { name: ev.target.value })} /></td>
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
        <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.6rem' }}>Removing a member leaves any past expense tagged to them intact. “Common” is the shared pool — money paid from it is never counted as a debt between people.</p>
      </div>
    </>
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

function SetupTab({ entities, draft, setDraft, dirty, onSave, onDiscard, currentMonth, openEditor }: {
  entities: Entity[]
  draft: Template
  setDraft: (fn: (t: Template) => Template) => void
  dirty: boolean
  onSave: (scope: ApplyScope) => void
  onDiscard: () => void
  currentMonth: string
  openEditor: (e: Editing) => void
}) {
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
    if (sec === 'emis') return { id: uid('emi'), name: '', amount: 0, kind: 'emi', paidBy: firstPerson(entities), alloc: equal, startDate: monthKey() + '-01', endDate: null }
    if (sec === 'annual') return { id: uid('yr'), name: '', amount: 0, kind: 'annual', paidBy: common, alloc: equal, dueDate: monthKey() + '-01' }
    return { id: uid('mon'), name: '', amount: 0, kind: 'monthly', paidBy: common, alloc: equal }
  }

  const Section = ({ title, sec }: { title: string; sec: Sec }) => (
    <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
        <p className="vg-sec" style={{ margin: 0 }}>{title}</p>
        <button className="vg-btn vg-btn-primary" onClick={() => openEditor({ item: templateNew(sec), commit: it => addT(sec, it) })}><Plus className="h-4 w-4" /> Add</button>
      </div>
      <div className="vg-tablewrap">
        <table className="vg-table" style={{ minWidth: 560 }}>
          <thead><tr><th>Item</th><th>Paid by</th><th>Shared</th><th className="num">{sec === 'annual' ? 'Amount/yr' : 'Amount'}</th>{sec !== 'monthly' && <th style={{ width: 120 }}>{sec === 'emis' ? 'Ends' : 'Due'}</th>}<th style={{ width: 76 }}></th></tr></thead>
          <tbody>
            {draft[sec].map(it => (
              <tr key={it.id}>
                <td className="vg-nm" style={{ fontWeight: 600 }}>{it.name || <span className="vg-muted">Untitled</span>}</td>
                <td><span className="vg-chip" style={{ background: entColor(entities, it.paidBy) + '22', color: entColor(entities, it.paidBy) }}>{entName(entities, it.paidBy)}</span></td>
                <td className="vg-muted" style={{ fontSize: '0.8rem' }}>{shareSummary(it, entities)}</td>
                <td className="num">{INR(it.amount)}</td>
                {sec !== 'monthly' && <td className="vg-muted" style={{ fontSize: '0.8rem' }}>{sec === 'emis' ? (it.endDate ?? 'open') : (it.dueDate ?? '—')}</td>}
                <td><div style={{ display: 'flex', gap: 4 }}>
                  <button className="vg-icobtn" onClick={() => openEditor({ item: it, commit: x => updT(sec, x), remove: () => delT(sec, it.id) })}><Pencil className="h-4 w-4" /></button>
                  <button className="vg-icobtn" onClick={() => delT(sec, it.id)}><Trash2 className="h-4 w-4" /></button>
                </div></td>
              </tr>
            ))}
            {draft[sec].length === 0 && <tr><td colSpan={sec === 'monthly' ? 5 : 6} className="vg-muted" style={{ textAlign: 'center', padding: '1rem' }}>Nothing yet.</td></tr>}
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

function fmtMon(iso: string): string {
  const [y, m] = iso.slice(0, 7).split('-').map(Number)
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
