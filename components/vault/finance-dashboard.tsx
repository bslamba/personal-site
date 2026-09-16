'use client'

// ============================================================
// components/vault/finance-dashboard.tsx
//
// The household money dashboard. Loads one JSON doc from
// /api/vault/finance, lets you edit the current month, the whole
// year, and the recurring template, and saves back automatically
// (debounced). Charts are hand-drawn SVG so there are no extra
// dependencies. Frosted-glass theme.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2, Loader2,
  Check, RefreshCw, CalendarDays,
} from 'lucide-react'
import {
  type FinanceDoc, type MonthData, type Item, type IncomeItem, type Account,
  seedDoc, monthKey, materialise, monthView, totals, byCategory, emiActive,
  INR, monthLabel, clamp01,
} from '@/lib/finance-data'

const ACCOUNTS: Account[] = [
  'Common Bank Account', "Bhawneet's Bank Account", "Gurneet's Bank Account", "Papa's Bank Account",
]
const CAT_COLORS: Record<string, string> = {
  'Loans & EMIs': '#6d4bd8',
  'Home & Utilities': '#4b7bec',
  'Food & Groceries': '#1f9d6b',
  'Vehicles & Travel': '#e8963a',
  'Insurance & Taxes': '#b0479a',
  'Subscriptions': '#5bc0d0',
  'Other': '#9b93b8',
}
const PALETTE = ['#6d4bd8', '#4b7bec', '#1f9d6b', '#e8963a', '#b0479a', '#5bc0d0', '#9b93b8', '#e2445c']

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

function num(v: string): number {
  const n = parseFloat(v.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

// ---------- tiny SVG charts ------------------------------------
function Donut({ data, size = 168 }: { data: { name: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = size / 2, cx = r, cy = r, stroke = size * 0.16, rad = r - stroke / 2
  let a = -Math.PI / 2
  const arcs = data.map(d => {
    const frac = total > 0 ? d.value / total : 0
    const a2 = a + frac * Math.PI * 2
    const large = frac > 0.5 ? 1 : 0
    const x1 = cx + rad * Math.cos(a), y1 = cy + rad * Math.sin(a)
    const x2 = cx + rad * Math.cos(a2), y2 = cy + rad * Math.sin(a2)
    a = a2
    return { d: `M ${x1} ${y1} A ${rad} ${rad} 0 ${large} 1 ${x2} ${y2}`, color: d.color, frac }
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
      <circle cx={cx} cy={cy} r={rad} fill="none" stroke="rgba(120,99,190,0.12)" strokeWidth={stroke} />
      {arcs.map((arc, i) =>
        arc.frac > 0 ? (
          <path key={i} d={arc.d} fill="none" stroke={arc.color} strokeWidth={stroke} strokeLinecap="round" />
        ) : null
      )}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={size * 0.11} fontWeight={800} fill="#241b40">
        {INR(total).replace('₹', '₹')}
      </text>
      <text x={cx} y={cy + size * 0.11} textAnchor="middle" fontSize={size * 0.07} fill="#8b81ad">total</text>
    </svg>
  )
}

function Bars({ data, height = 150 }: { data: { label: string; value: number; color?: string }[]; height?: number }) {
  const max = Math.max(1, ...data.map(d => Math.abs(d.value)))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height, paddingTop: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: '#5b5080', fontVariantNumeric: 'tabular-nums' }}>{Math.round(d.value / 1000)}k</div>
          <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', height: height - 34 }}>
            <div style={{
              width: '100%', height: `${(Math.abs(d.value) / max) * 100}%`, minHeight: 3,
              background: d.color ?? 'linear-gradient(180deg,#a06be0,#6d4bd8)', borderRadius: '6px 6px 3px 3px',
            }} />
          </div>
          <div style={{ fontSize: 10, color: '#8b81ad', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{d.label}</div>
        </div>
      ))}
    </div>
  )
}

function SplitBar({ b, g }: { b: number; g: number }) {
  const t = b + g || 1
  return (
    <div>
      <div style={{ display: 'flex', height: 26, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.6)' }}>
        <div style={{ width: `${(b / t) * 100}%`, background: 'var(--vg-b)' }} />
        <div style={{ width: `${(g / t) * 100}%`, background: 'var(--vg-g)' }} />
      </div>
      <div className="vg-legend">
        <span><i className="vg-dot" style={{ background: 'var(--vg-b)' }} /> Bhawneet {INR(b)}</span>
        <span><i className="vg-dot" style={{ background: 'var(--vg-g)' }} /> Gurneet {INR(g)}</span>
      </div>
    </div>
  )
}

function Legend({ items }: { items: { name: string; color: string; value: number }[] }) {
  return (
    <div className="vg-legend" style={{ flexDirection: 'column', gap: '0.4rem' }}>
      {items.map(it => (
        <span key={it.name} style={{ justifyContent: 'space-between', width: '100%' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <i className="vg-dot" style={{ background: it.color }} /> {it.name}
          </span>
          <b style={{ fontVariantNumeric: 'tabular-nums', color: '#241b40' }}>{INR(it.value)}</b>
        </span>
      ))}
    </div>
  )
}

// ---------- main ------------------------------------------------
type Tab = 'month' | 'year' | 'setup'

export default function FinanceDashboard() {
  const [doc, setDoc] = useState<FinanceDoc | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('month')
  const [key, setKey] = useState<string>(monthKey())
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const firstLoad = useRef(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // load
  useEffect(() => {
    let live = true
    fetch('/api/vault/finance')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Could not load'))))
      .then(d => { if (live) setDoc(d.doc as FinanceDoc) })
      .catch(() => { if (live) { setErr('Could not load your data. It will still work — starting a fresh copy.'); setDoc(seedDoc()) } })
    return () => { live = false }
  }, [])

  // debounced autosave
  useEffect(() => {
    if (!doc) return
    if (firstLoad.current) { firstLoad.current = false; return }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch('/api/vault/finance', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc }),
        })
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 1400)
      } catch { setSaveState('idle') }
    }, 700)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [doc])

  const patchMonth = useCallback((k: string, fn: (m: MonthData) => MonthData) => {
    setDoc(d => {
      if (!d) return d
      const nd = structuredClone(d) as FinanceDoc
      nd.months[k] = fn(nd.months[k] ?? materialise(nd.template, k))
      return nd
    })
  }, [])

  const patchTemplate = useCallback((fn: (t: FinanceDoc['template']) => FinanceDoc['template']) => {
    setDoc(d => {
      if (!d) return d
      const nd = structuredClone(d) as FinanceDoc
      nd.template = fn(nd.template)
      return nd
    })
  }, [])

  if (err && !doc) {
    return <Shell><p className="vg-empty">{err}</p></Shell>
  }
  if (!doc) {
    return <Shell><p className="vg-empty"><Loader2 className="h-5 w-5 vg-spin" style={{ display: 'inline' }} /> Loading…</p></Shell>
  }

  return (
    <Shell saveState={saveState}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div className="vg-tabs">
          {(['month', 'year', 'setup'] as Tab[]).map(t => (
            <button key={t} className="vg-tab" data-on={tab === t} onClick={() => setTab(t)}>
              {t === 'month' ? 'This month' : t === 'year' ? 'Year' : 'Setup'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'month' && (
        <MonthTab doc={doc} k={key} setKey={setKey} patchMonth={patchMonth} />
      )}
      {tab === 'year' && (
        <YearTab doc={doc} year={year} setYear={setYear} openMonth={(k) => { setKey(k); setTab('month') }} />
      )}
      {tab === 'setup' && (
        <SetupTab doc={doc} patchTemplate={patchTemplate} />
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
            <h1 className="vg-h1">Money</h1>
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
function MonthTab({ doc, k, setKey, patchMonth }: {
  doc: FinanceDoc; k: string; setKey: (k: string) => void
  patchMonth: (k: string, fn: (m: MonthData) => MonthData) => void
}) {
  // Make sure this month is real (materialised) before anyone edits a row.
  useEffect(() => {
    if (!doc.months[k]) patchMonth(k, m => m)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k])

  const m = doc.months[k] ?? materialise(doc.template, k)
  const t = totals(m)

  const step = (delta: number) => {
    const [y, mo] = k.split('-').map(Number)
    const d = new Date(y, mo - 1 + delta, 1)
    setKey(monthKey(d))
  }

  const setItem = (id: string, patch: Partial<Item>) =>
    patchMonth(k, mm => ({ ...mm, items: mm.items.map(it => (it.id === id ? { ...it, ...patch } : it)) }))
  const delItem = (id: string) =>
    patchMonth(k, mm => ({ ...mm, items: mm.items.filter(it => it.id !== id) }))
  const addItem = () =>
    patchMonth(k, mm => ({ ...mm, items: [...mm.items, { id: uid('one'), name: 'New expense', owner: 'Bhawneet', account: 'Common Bank Account', amount: 0, shareB: 0.5, kind: 'monthly' }] }))

  const setInc = (id: string, patch: Partial<IncomeItem>) =>
    patchMonth(k, mm => ({ ...mm, income: mm.income.map(i => (i.id === id ? { ...i, ...patch } : i)) }))
  const delInc = (id: string) =>
    patchMonth(k, mm => ({ ...mm, income: mm.income.filter(i => i.id !== id) }))
  const addInc = () =>
    patchMonth(k, mm => ({ ...mm, income: [...mm.income, { id: uid('inc'), source: 'Income', person: 'Bhawneet', amount: 0 }] }))

  const cats = byCategory(m).map((c, i) => ({ ...c, color: CAT_COLORS[c.name] ?? PALETTE[i % PALETTE.length] }))
  const settleTxt = t.settle > 0
    ? `Gurneet owes Bhawneet ${INR(t.settle)}`
    : t.settle < 0
      ? `Bhawneet owes Gurneet ${INR(-t.settle)}`
      : 'All square'

  return (
    <>
      {/* month nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.1rem' }}>
        <div className="vg-nav">
          <button className="vg-icobtn" onClick={() => step(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
          <span className="lbl">{monthLabel(k)}</span>
          <button className="vg-icobtn" onClick={() => step(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <button className="vg-btn" onClick={() => setKey(monthKey())}><CalendarDays className="h-4 w-4" /> This month</button>
      </div>

      {/* KPIs */}
      <div className="vg-kpis" style={{ marginBottom: '1.1rem' }}>
        <div className="vg-kpi"><div className="k">Income</div><div className="v vg-pos">{INR(t.income)}</div></div>
        <div className="vg-kpi"><div className="k">Expenses</div><div className="v">{INR(t.expense)}</div></div>
        <div className="vg-kpi"><div className="k">{t.net >= 0 ? 'Saved' : 'Overspent'}</div><div className={`v ${t.net >= 0 ? 'vg-pos' : 'vg-neg'}`}>{INR(Math.abs(t.net))}</div></div>
        <div className="vg-kpi"><div className="k">Settle up</div><div className="v" style={{ fontSize: '1rem', lineHeight: 1.3 }}>{settleTxt}</div></div>
      </div>

      <div className="vg-grid2">
        {/* Expenses */}
        <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <p className="vg-sec" style={{ margin: 0 }}>Expenses</p>
            <button className="vg-btn vg-btn-primary" onClick={addItem}><Plus className="h-4 w-4" /> Add</button>
          </div>
          <div className="vg-tablewrap">
            <table className="vg-table">
              <thead>
                <tr>
                  <th>Item</th><th>Pays from</th><th className="num">Amount</th>
                  <th style={{ width: 92 }}>B share %</th><th style={{ width: 46 }}>Paid</th><th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {m.items.map(it => (
                  <tr key={it.id} className={it.paid ? 'vg-row-paid' : ''}>
                    <td>
                      <input className="vg-input vg-nm" value={it.name} onChange={e => setItem(it.id, { name: e.target.value })} />
                      <span className="vg-chip" style={{ marginTop: 4 }}>{it.kind === 'emi' ? 'EMI' : it.kind === 'annual' ? 'Yearly' : 'Monthly'}</span>
                    </td>
                    <td>
                      <select className="vg-select" value={it.account} onChange={e => setItem(it.id, { account: e.target.value as Account })}>
                        {ACCOUNTS.map(a => <option key={a} value={a}>{a.replace(' Bank Account', '')}</option>)}
                      </select>
                    </td>
                    <td className="num">
                      <input className="vg-input vg-num" inputMode="numeric" value={String(it.amount)} onChange={e => setItem(it.id, { amount: num(e.target.value) })} />
                    </td>
                    <td>
                      <input className="vg-input vg-num" inputMode="numeric" value={Math.round(clamp01(it.shareB) * 100)} onChange={e => setItem(it.id, { shareB: clamp01(num(e.target.value) / 100) })} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={!!it.paid} onChange={e => setItem(it.id, { paid: e.target.checked })} />
                    </td>
                    <td><button className="vg-icobtn" onClick={() => delItem(it.id)} aria-label="Delete"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
                {m.items.length === 0 && <tr><td colSpan={6} className="vg-muted" style={{ textAlign: 'center', padding: '1rem' }}>No expenses yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Income */}
        <div className="vg-card vg-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
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
                    <td>
                      <select className="vg-select" value={i.person} onChange={e => setInc(i.id, { person: e.target.value as IncomeItem['person'] })}>
                        <option value="Common">Common</option><option value="Bhawneet">Bhawneet</option><option value="Gurneet">Gurneet</option>
                      </select>
                    </td>
                    <td className="num"><input className="vg-input vg-num" inputMode="numeric" value={String(i.amount)} onChange={e => setInc(i.id, { amount: num(e.target.value) })} /></td>
                    <td><button className="vg-icobtn" onClick={() => delInc(i.id)} aria-label="Delete"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
                {m.income.length === 0 && <tr><td colSpan={4} className="vg-muted" style={{ textAlign: 'center', padding: '1rem' }}>No income yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Where it goes */}
        <div className="vg-card vg-pad">
          <p className="vg-sec">Where it goes</p>
          {cats.length ? (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <Donut data={cats} />
              <div style={{ flex: 1, minWidth: 170 }}><Legend items={cats} /></div>
            </div>
          ) : <p className="vg-muted">Add expenses to see the breakdown.</p>}
        </div>

        {/* Split */}
        <div className="vg-card vg-pad">
          <p className="vg-sec">The split this month</p>
          <SplitBar b={t.bShare} g={t.gShare} />
          <p style={{ marginTop: '1rem', fontSize: '0.92rem', color: '#241b40' }}>
            <b>{settleTxt}.</b>{' '}
            <span className="vg-muted">Only money moving through a personal account creates a debt; anything from the common account is already shared.</span>
          </p>
        </div>

        {/* Note */}
        <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
          <p className="vg-sec">Note</p>
          <textarea className="vg-input" rows={2} placeholder="Anything to remember about this month…"
            value={m.note ?? ''} onChange={e => patchMonth(k, mm => ({ ...mm, note: e.target.value }))} />
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
  const per = months.map(k => ({ k, t: totals(monthView(doc, k)) }))
  const totInc = per.reduce((s, p) => s + p.t.income, 0)
  const totExp = per.reduce((s, p) => s + p.t.expense, 0)
  const active = per.filter(p => p.t.expense > 0).length || 1

  const catMap = new Map<string, number>()
  months.forEach(k => byCategory(monthView(doc, k)).forEach(c => catMap.set(c.name, (catMap.get(c.name) ?? 0) + c.value)))
  const cats = [...catMap.entries()].map(([name, value], i) => ({ name, value, color: CAT_COLORS[name] ?? PALETTE[i % PALETTE.length] })).sort((a, b) => b.value - a.value)

  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  // EMI payoff outlook (rough: monthly × months remaining from this month)
  const now = monthKey()
  const emiRows = doc.template.emis
    .filter(e => !e.endDate || e.endDate >= `${now}-01`)
    .map(e => {
      let remaining = 0
      if (e.endDate) {
        const [ey, em] = e.endDate.slice(0, 7).split('-').map(Number)
        const [ny, nm] = now.split('-').map(Number)
        remaining = Math.max(0, (ey - ny) * 12 + (em - nm) + 1)
      }
      return { name: e.name, monthly: e.amount, remaining, outstanding: e.endDate ? e.amount * remaining : null, end: e.endDate }
    })

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.1rem' }}>
        <div className="vg-nav">
          <button className="vg-icobtn" onClick={() => setYear(year - 1)} aria-label="Previous year"><ChevronLeft className="h-4 w-4" /></button>
          <span className="lbl">{year}</span>
          <button className="vg-icobtn" onClick={() => setYear(year + 1)} aria-label="Next year"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="vg-kpis" style={{ marginBottom: '1.1rem' }}>
        <div className="vg-kpi"><div className="k">Income (year)</div><div className="v vg-pos">{INR(totInc)}</div></div>
        <div className="vg-kpi"><div className="k">Expenses (year)</div><div className="v">{INR(totExp)}</div></div>
        <div className="vg-kpi"><div className="k">{totInc - totExp >= 0 ? 'Saved' : 'Overspent'}</div><div className={`v ${totInc - totExp >= 0 ? 'vg-pos' : 'vg-neg'}`}>{INR(Math.abs(totInc - totExp))}</div></div>
        <div className="vg-kpi"><div className="k">Avg / active month</div><div className="v">{INR(totExp / active)}</div></div>
      </div>

      <div className="vg-grid2">
        <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
          <p className="vg-sec">Expenses by month — tap a bar to open it</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 190, paddingTop: 8 }}>
            {per.map((p, i) => {
              const max = Math.max(1, ...per.map(x => x.t.expense))
              return (
                <button key={p.k} onClick={() => openMonth(p.k)} title={`${MON[i]} · ${INR(p.t.expense)}`}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: 0, background: 'transparent', cursor: 'pointer', minWidth: 0 }}>
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
          {cats.length ? (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <Donut data={cats} />
              <div style={{ flex: 1, minWidth: 170 }}><Legend items={cats} /></div>
            </div>
          ) : <p className="vg-muted">No expenses recorded this year yet.</p>}
        </div>

        <div className="vg-card vg-pad">
          <p className="vg-sec">Loan & EMI outlook</p>
          <div className="vg-tablewrap">
            <table className="vg-table" style={{ minWidth: 380 }}>
              <thead><tr><th>Loan</th><th className="num">Monthly</th><th className="num">Months left</th><th className="num">Left to pay</th></tr></thead>
              <tbody>
                {emiRows.map(r => (
                  <tr key={r.name}>
                    <td className="vg-nm">{r.name}<span className="vg-muted" style={{ display: 'block', fontSize: '0.72rem' }}>{r.end ? `ends ${r.end}` : 'open-ended'}</span></td>
                    <td className="num">{INR(r.monthly)}</td>
                    <td className="num">{r.end ? r.remaining : '—'}</td>
                    <td className="num">{r.outstanding != null ? INR(r.outstanding) : '—'}</td>
                  </tr>
                ))}
                {emiRows.length === 0 && <tr><td colSpan={4} className="vg-muted" style={{ textAlign: 'center', padding: '1rem' }}>No active EMIs.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="vg-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>“Left to pay” is monthly × months remaining — a simple runway, not an amortised balance.</p>
        </div>
      </div>
    </>
  )
}

// ---------- Setup tab -------------------------------------------
function SetupTab({ doc, patchTemplate }: {
  doc: FinanceDoc; patchTemplate: (fn: (t: FinanceDoc['template']) => FinanceDoc['template']) => void
}) {
  const T = doc.template

  const upd = <K extends 'monthly' | 'emis' | 'annual'>(bucket: K, id: string, patch: Partial<Item>) =>
    patchTemplate(t => ({ ...t, [bucket]: t[bucket].map(x => (x.id === id ? { ...x, ...patch } : x)) }))
  const del = (bucket: 'monthly' | 'emis' | 'annual', id: string) =>
    patchTemplate(t => ({ ...t, [bucket]: t[bucket].filter(x => x.id !== id) }))
  const add = (bucket: 'monthly' | 'emis' | 'annual') =>
    patchTemplate(t => {
      const item: Item =
        bucket === 'emis'
          ? { id: uid('emi'), name: 'New EMI', owner: 'Bhawneet', account: "Bhawneet's Bank Account", amount: 0, shareB: 0.5, kind: 'emi', startDate: monthKey() + '-01', endDate: null }
          : bucket === 'annual'
            ? { id: uid('yr'), name: 'New yearly item', owner: 'Bhawneet', account: 'Common Bank Account', amount: 0, shareB: 0.5, kind: 'annual', dueDate: monthKey() + '-01' }
            : { id: uid('mon'), name: 'New monthly item', owner: 'Bhawneet', account: 'Common Bank Account', amount: 0, shareB: 0.5, kind: 'monthly' }
      return { ...t, [bucket]: [...t[bucket], item] }
    })

  const setInc = (id: string, patch: Partial<IncomeItem>) =>
    patchTemplate(t => ({ ...t, income: t.income.map(i => (i.id === id ? { ...i, ...patch } : i)) }))
  const delInc = (id: string) => patchTemplate(t => ({ ...t, income: t.income.filter(i => i.id !== id) }))
  const addInc = () => patchTemplate(t => ({ ...t, income: [...t.income, { id: uid('inc'), source: 'Income', person: 'Bhawneet', amount: 0 }] }))

  return (
    <>
      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        <p style={{ margin: 0, color: '#241b40' }}><RefreshCw className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-accent)' }} /> These are your <b>recurring</b> items. Changes here flow into <b>future</b> months — months you’ve already opened keep what they had, so your history stays put.</p>
      </div>

      <div className="vg-grid2">
        <TemplateCard title="Monthly recurring" onAdd={() => add('monthly')} minW={520}
          head={<><th>Item</th><th>Pays from</th><th className="num">Amount</th><th style={{ width: 90 }}>B %</th><th style={{ width: 40 }}></th></>}>
          {T.monthly.map(it => (
            <tr key={it.id}>
              <td><input className="vg-input" value={it.name} onChange={e => upd('monthly', it.id, { name: e.target.value })} /></td>
              <td><AccSelect v={it.account} on={a => upd('monthly', it.id, { account: a })} /></td>
              <td className="num"><input className="vg-input vg-num" inputMode="numeric" value={String(it.amount)} onChange={e => upd('monthly', it.id, { amount: num(e.target.value) })} /></td>
              <td><input className="vg-input vg-num" inputMode="numeric" value={Math.round(clamp01(it.shareB) * 100)} onChange={e => upd('monthly', it.id, { shareB: clamp01(num(e.target.value) / 100) })} /></td>
              <td><button className="vg-icobtn" onClick={() => del('monthly', it.id)}><Trash2 className="h-4 w-4" /></button></td>
            </tr>
          ))}
        </TemplateCard>

        <TemplateCard title="EMIs & loans" onAdd={() => add('emis')} minW={640}
          head={<><th>Loan</th><th>Pays from</th><th className="num">Monthly</th><th style={{ width: 130 }}>Start</th><th style={{ width: 130 }}>End</th><th style={{ width: 40 }}></th></>}>
          {T.emis.map(it => (
            <tr key={it.id}>
              <td><input className="vg-input" value={it.name} onChange={e => upd('emis', it.id, { name: e.target.value })} /></td>
              <td><AccSelect v={it.account} on={a => upd('emis', it.id, { account: a })} /></td>
              <td className="num"><input className="vg-input vg-num" inputMode="numeric" value={String(it.amount)} onChange={e => upd('emis', it.id, { amount: num(e.target.value) })} /></td>
              <td><input className="vg-input" type="date" value={it.startDate ?? ''} onChange={e => upd('emis', it.id, { startDate: e.target.value || null })} /></td>
              <td><input className="vg-input" type="date" value={it.endDate ?? ''} onChange={e => upd('emis', it.id, { endDate: e.target.value || null })} /></td>
              <td><button className="vg-icobtn" onClick={() => del('emis', it.id)}><Trash2 className="h-4 w-4" /></button></td>
            </tr>
          ))}
        </TemplateCard>

        <TemplateCard title="Yearly items" onAdd={() => add('annual')} minW={560}
          head={<><th>Item</th><th>Pays from</th><th className="num">Amount / yr</th><th style={{ width: 140 }}>Due</th><th style={{ width: 40 }}></th></>}>
          {T.annual.map(it => (
            <tr key={it.id}>
              <td><input className="vg-input" value={it.name} onChange={e => upd('annual', it.id, { name: e.target.value })} /></td>
              <td><AccSelect v={it.account} on={a => upd('annual', it.id, { account: a })} /></td>
              <td className="num"><input className="vg-input vg-num" inputMode="numeric" value={String(it.amount)} onChange={e => upd('annual', it.id, { amount: num(e.target.value) })} /></td>
              <td><input className="vg-input" type="date" value={it.dueDate ?? ''} onChange={e => upd('annual', it.id, { dueDate: e.target.value || null })} /></td>
              <td><button className="vg-icobtn" onClick={() => del('annual', it.id)}><Trash2 className="h-4 w-4" /></button></td>
            </tr>
          ))}
        </TemplateCard>

        <TemplateCard title="Recurring income" onAdd={addInc} minW={360}
          head={<><th>Source</th><th>Who</th><th className="num">Amount</th><th style={{ width: 40 }}></th></>}>
          {T.income.map(i => (
            <tr key={i.id}>
              <td><input className="vg-input" value={i.source} onChange={e => setInc(i.id, { source: e.target.value })} /></td>
              <td>
                <select className="vg-select" value={i.person} onChange={e => setInc(i.id, { person: e.target.value as IncomeItem['person'] })}>
                  <option value="Common">Common</option><option value="Bhawneet">Bhawneet</option><option value="Gurneet">Gurneet</option>
                </select>
              </td>
              <td className="num"><input className="vg-input vg-num" inputMode="numeric" value={String(i.amount)} onChange={e => setInc(i.id, { amount: num(e.target.value) })} /></td>
              <td><button className="vg-icobtn" onClick={() => delInc(i.id)}><Trash2 className="h-4 w-4" /></button></td>
            </tr>
          ))}
        </TemplateCard>
      </div>
    </>
  )
}

function TemplateCard({ title, onAdd, head, children, minW }: {
  title: string; onAdd: () => void; head: React.ReactNode; children: React.ReactNode; minW: number
}) {
  return (
    <div className="vg-card vg-pad" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
        <p className="vg-sec" style={{ margin: 0 }}>{title}</p>
        <button className="vg-btn vg-btn-primary" onClick={onAdd}><Plus className="h-4 w-4" /> Add</button>
      </div>
      <div className="vg-tablewrap">
        <table className="vg-table" style={{ minWidth: minW }}>
          <thead><tr>{head}</tr></thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  )
}

function AccSelect({ v, on }: { v: Account; on: (a: Account) => void }) {
  return (
    <select className="vg-select" value={v} onChange={e => on(e.target.value as Account)}>
      {ACCOUNTS.map(a => <option key={a} value={a}>{a.replace(' Bank Account', '')}</option>)}
    </select>
  )
}
