'use client'

// ============================================================
// components/vault/finance-budget-push.tsx
//
// Two small dialogs around the Budget:
//   · PushDialog   — on saving a Budget change: which months should it
//                    apply to? This month, this month onwards, this month
//                    until…, or a range of its own.
//   · FetchDialog  — on a month: bring it back in line with the Budget,
//                    for everything or just one part of it.
// The work itself is lib/finance-data.ts pushBudget / resetMonthFromBudget.
// ============================================================

import { useState } from 'react'
import { X, Check, CalendarRange, RefreshCw, TriangleAlert } from 'lucide-react'
import { monthKey, monthLabel, addMonths, type PushRange, type ResetScope } from '@/lib/finance-data'

type Choice = 'this' | 'onward' | 'until' | 'between'

function Shell({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="vg-lb" onClick={onClose}>
      <div className="vg-card vg-pad" onClick={e => e.stopPropagation()} style={{ width: 'min(460px, 96vw)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
          <p className="vg-sec" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>{icon} {title}</p>
          <button className="vg-icobtn" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Option({ on, onPick, title, sub, children }: { on: boolean; onPick: () => void; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <label style={{ display: 'block', padding: '0.6rem 0.75rem', borderRadius: 12, cursor: 'pointer', marginBottom: 6,
      border: `1px solid ${on ? 'var(--vg-accent)' : 'var(--vg-line)'}`, background: on ? 'color-mix(in srgb, var(--vg-accent) 8%, transparent)' : 'transparent' }}>
      <span style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        <input type="radio" checked={on} onChange={onPick} style={{ marginTop: 3, accentColor: 'var(--vg-accent)' }} />
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 650, fontSize: '0.9rem' }}>{title}</span>
          {sub && <span className="vg-muted" style={{ display: 'block', fontSize: '0.78rem', marginTop: 2 }}>{sub}</span>}
          {on && children}
        </span>
      </span>
    </label>
  )
}

/** "Which months should this apply to?" — asked every time the Budget is saved. */
export function PushDialog({ what, onConfirm, onClose }: { what?: string; onConfirm: (r: PushRange) => void; onClose: () => void }) {
  const cur = monthKey()
  const [choice, setChoice] = useState<Choice>('onward')
  const [until, setUntil] = useState(addMonths(cur, 2))
  const [from, setFrom] = useState(cur)
  const [to, setTo] = useState(addMonths(cur, 2))
  const range: PushRange = choice === 'this' ? { from: cur, to: cur }
    : choice === 'onward' ? { from: cur, to: null }
    : choice === 'until' ? { from: cur, to: until }
    : { from, to }
  const bad = range.to !== null && range.to < range.from
  const picker = (v: string, set: (s: string) => void, min?: string) => (
    <input type="month" className="vg-input" style={{ marginTop: 6, maxWidth: 190 }} value={v} min={min} onChange={e => e.target.value && set(e.target.value)} onClick={e => e.stopPropagation()} />
  )
  return (
    <Shell title="Apply to which months?" icon={<CalendarRange className="h-4 w-4" />} onClose={onClose}>
      {what && <p style={{ margin: '0 0 0.7rem', fontSize: '0.88rem' }}>{what}</p>}
      <Option on={choice === 'this'} onPick={() => setChoice('this')} title={`This month only — ${monthLabel(cur)}`} sub="Just this month. The Budget and every other month stay as they are." />
      <Option on={choice === 'onward'} onPick={() => setChoice('onward')} title="This month and every month after" sub="Updates the Budget itself. Earlier months keep the figures they had." />
      <Option on={choice === 'until'} onPick={() => setChoice('until')} title="This month until…" sub="From this month up to the month you pick; after that it goes back to the Budget.">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>{monthLabel(cur)} → {picker(until, setUntil, cur)}</span>
      </Option>
      <Option on={choice === 'between'} onPick={() => setChoice('between')} title="From one month to another" sub="Any range you choose — past or future.">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '0.82rem' }}>{picker(from, setFrom)} → {picker(to, setTo, from)}</span>
      </Option>
      {bad && <p className="vg-neg" style={{ fontSize: '0.82rem', margin: '0.3rem 0 0' }}>The end month cannot come before the start.</p>}
      <p className="vg-muted" style={{ fontSize: '0.76rem', margin: '0.5rem 0 0' }}>Closed months are never changed.</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '0.9rem' }}>
        <button className="vg-btn" onClick={onClose}>Cancel</button>
        <button className="vg-btn vg-btn-primary" disabled={bad} onClick={() => onConfirm(range)}><Check className="h-4 w-4" /> Apply</button>
      </div>
    </Shell>
  )
}

/** A month's "Fetch from Budget". */
export function FetchButton({ k, isSuper, onFetch }: { k: string; isSuper: boolean; onFetch: (scope: ResetScope, includeOneOffs: boolean) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="vg-btn" onClick={() => setOpen(true)} title="Bring this month back in line with the Budget"><RefreshCw className="h-4 w-4" /> Fetch from Budget</button>
      {open && <FetchDialog k={k} isSuper={isSuper} onClose={() => setOpen(false)} onConfirm={(s, o) => { onFetch(s, o); setOpen(false) }} />}
    </>
  )
}

function FetchDialog({ k, isSuper, onConfirm, onClose }: { k: string; isSuper: boolean; onConfirm: (s: ResetScope, oneOffs: boolean) => void; onClose: () => void }) {
  const options: [ResetScope, string, string][] = isSuper
    ? [['all', 'Everything', 'Every recurring expense and the common income, across all envelopes.'],
       ['household', 'Lamba Household', 'The common and shared expenses in the household envelope.'],
       ['income', 'Common income', 'The household account’s income.']]
    : [['personal', 'My Dashboard', 'Your personal expenses and EMIs.'],
       ['income', 'My income', 'Your salary and other recurring income.']]
  const [scope, setScope] = useState<ResetScope>(options[0][0])
  const [oneOffs, setOneOffs] = useState(false)
  return (
    <Shell title={`Fetch ${monthLabel(k)} from the Budget`} icon={<RefreshCw className="h-4 w-4" />} onClose={onClose}>
      <p style={{ margin: '0 0 0.7rem', fontSize: '0.88rem' }}>Anything this month changed on its own — edited amounts, removed items, copies pushed in — goes back to what the Budget says.</p>
      {options.map(([v, t, sub]) => <Option key={v} on={scope === v} onPick={() => setScope(v)} title={t} sub={sub} />)}
      {scope !== 'income' && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: '0.4rem', fontSize: '0.84rem' }}>
          <input type="checkbox" checked={oneOffs} onChange={e => setOneOffs(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--vg-neg)' }} />
          <span>Also remove one-off expenses added this month
            {oneOffs && <span className="vg-neg" style={{ display: 'block', fontSize: '0.78rem', marginTop: 2 }}><TriangleAlert className="h-3.5 w-3.5" style={{ display: 'inline', verticalAlign: '-2px' }} /> They are real spending — they will be removed from {monthLabel(k)}.</span>}
          </span>
        </label>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '0.9rem' }}>
        <button className="vg-btn" onClick={onClose}>Cancel</button>
        <button className="vg-btn vg-btn-primary" onClick={() => onConfirm(scope, oneOffs && scope !== 'income')}><RefreshCw className="h-4 w-4" /> Fetch</button>
      </div>
    </Shell>
  )
}
