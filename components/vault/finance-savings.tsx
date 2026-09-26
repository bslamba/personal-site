'use client'

// ============================================================
// components/vault/finance-savings.tsx
//
// The Savings tab. Each pot has a type:
//   RD    monthly instalment, rate, start date and tenure (or end date).
//         Its value today and at maturity are worked out, and the
//         instalment shows on My Dashboard under EMIs, because it comes
//         out of salary every month.
//   FD    amount, rate, start and maturity date (or a period), and how the
//         interest is paid. Value today, maturity amount and the interest
//         are worked out. It never touches My Dashboard — the money came
//         from somewhere else.
//   Other anything already kept here (MF, gold, cash…) with a balance.
// The maths is lib/deposits.ts; the server re-checks and re-works it.
// ============================================================

import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, X, Check, ShieldCheck, Repeat, Landmark, Wallet } from 'lucide-react'
import { type FinanceDoc, type SavingItem, INR, uid } from '@/lib/finance-data'
import { rdView, fdView, addMonthsIso, monthsBetweenIso, type FdPayout } from '@/lib/deposits'

type Kind = 'RD' | 'FD' | 'Other'
const kindOf = (s: SavingItem): Kind => (s.kind === 'RD' && s.rd ? 'RD' : s.kind === 'FD' && s.fd ? 'FD' : 'Other')
// Today and date sums in local time — UTC would be yesterday for the first
// hours of an Indian morning.
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fmtDate = (iso?: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const num = (v: string) => { const n = parseFloat(v.replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : 0 }
const PAYOUT: [FdPayout, string][] = [['cumulative', 'At maturity (cumulative)'], ['monthly', 'Paid out monthly'], ['quarterly', 'Paid out quarterly'], ['yearly', 'Paid out yearly']]

/** What a row shows, whatever its type. */
function figures(s: SavingItem) {
  const k = kindOf(s)
  if (k === 'RD') {
    const v = rdView(s.rd!)
    return { invested: v.deposited, current: v.currentValue, maturity: v.maturityValue, matures: v.maturityDate, rate: s.rd!.rate, extra: `${INR(s.rd!.monthly)}/month · ${v.installmentsPaid} of ${s.rd!.months} paid`, matured: v.matured }
  }
  if (k === 'FD') {
    const v = fdView(s.fd!)
    return { invested: s.fd!.principal, current: v.currentValue, maturity: v.maturityValue, matures: s.fd!.maturity, rate: s.fd!.rate,
      extra: s.fd!.payout === 'cumulative' ? `${INR(v.interest)} interest at maturity` : `${INR(v.payoutEach)} interest ${v.payoutLabel}`, matured: v.matured }
  }
  return { invested: s.balance || 0, current: s.balance || 0, maturity: null as number | null, matures: '', rate: null as number | null, extra: s.kind || '', matured: false }
}

export function SavingsTab({ doc, entityId, onSave }: { doc: FinanceDoc; entityId: string; onSave: (rows: SavingItem[]) => void }) {
  const rows = doc.savings.filter(s => s.entity === entityId)
  const [edit, setEdit] = useState<SavingItem | null>(null)
  const [confirmDel, setConfirmDel] = useState<SavingItem | null>(null)
  const f = useMemo(() => rows.map(s => ({ s, ...figures(s) })), [rows])
  const total = f.reduce((a, x) => a + x.current, 0)
  const atMaturity = f.reduce((a, x) => a + (x.maturity ?? x.current), 0)
  const monthlyRd = rows.filter(s => kindOf(s) === 'RD' && !rdView(s.rd!).matured).reduce((a, s) => a + s.rd!.monthly, 0)

  const save = (row: SavingItem) => {
    const exists = rows.some(r => r.id === row.id)
    onSave(exists ? rows.map(r => (r.id === row.id ? row : r)) : [...rows, row])
    setEdit(null)
  }

  return (
    <>
      <div className="vg-kpis" style={{ marginBottom: '1rem' }}>
        <div className="vg-kpi"><div className="k">Worth today</div><div className="v vg-pos">{INR(total)}</div></div>
        <div className="vg-kpi"><div className="k">At maturity</div><div className="v">{INR(atMaturity)}</div></div>
        <div className="vg-kpi"><div className="k">RD from salary</div><div className="v">{INR(monthlyRd)}<span className="vg-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>/mo</span></div></div>
        <div className="vg-kpi"><div className="k">Pots</div><div className="v">{rows.length}</div></div>
      </div>

      <div className="vg-card vg-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', gap: 8, flexWrap: 'wrap' }}>
          <p className="vg-sec" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><ShieldCheck className="h-4 w-4" style={{ color: 'var(--vg-pos)' }} /> My savings · private to you</p>
          <button className="vg-btn vg-btn-primary" onClick={() => setEdit({ id: uid('sav'), label: '', entity: entityId, balance: 0, kind: 'RD', rd: { monthly: 0, rate: 7, start: today(), months: 12 } })}><Plus className="h-4 w-4" /> Add</button>
        </div>
        <div className="vg-tablewrap">
          <table className="vg-table" style={{ minWidth: 760 }}>
            <thead><tr>
              <th>Name</th><th>Type</th><th className="num">Put in</th><th className="num">Rate</th>
              <th className="num">Worth today</th><th className="num">At maturity</th><th>Matures</th><th style={{ width: 64 }}></th>
            </tr></thead>
            <tbody>
              {f.map(({ s, invested, current, maturity, matures, rate, extra, matured }) => (
                <tr key={s.id}>
                  <td><b>{s.label || 'Untitled'}</b><span className="vg-muted" style={{ display: 'block', fontSize: '0.74rem' }}>{extra}</span></td>
                  <td>{kindOf(s) === 'Other'
                    ? <span className="vg-chip" style={{ background: 'color-mix(in srgb, var(--vg-ink) 8%, transparent)', color: 'var(--vg-ink-soft)' }}>{s.kind || 'Other'}</span>
                    : <span className="vg-chip">{kindOf(s)}</span>}
                    {kindOf(s) === 'RD' && !matured && <span className="vg-muted" style={{ display: 'block', fontSize: '0.7rem', marginTop: 2 }}>on My Dashboard · EMIs</span>}
                  </td>
                  <td className="num">{INR(invested)}</td>
                  <td className="num">{rate != null ? `${rate}%` : '—'}</td>
                  <td className="num vg-pos" style={{ fontWeight: 700 }}>{INR(current)}</td>
                  <td className="num">{maturity != null ? INR(maturity) : '—'}</td>
                  <td style={{ fontSize: '0.8rem' }}>{matures ? <>{fmtDate(matures)}{matured && <span className="vg-chip" style={{ marginLeft: 6 }}>matured</span>}</> : '—'}</td>
                  <td><div style={{ display: 'flex', gap: 4 }}>
                    <button className="vg-icobtn" onClick={() => setEdit(structuredClone(s))} aria-label={`Edit ${s.label}`}><Pencil className="h-4 w-4" /></button>
                    <button className="vg-icobtn" onClick={() => setConfirmDel(s)} aria-label={`Remove ${s.label}`}><Trash2 className="h-4 w-4" /></button>
                  </div></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="vg-muted" style={{ textAlign: 'center', padding: '1.2rem' }}>No savings yet. Add an RD or an FD.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {edit && <SavingEditor initial={edit} onClose={() => setEdit(null)} onSave={save} />}
      {confirmDel && (
        <div className="vg-lb" onClick={() => setConfirmDel(null)}>
          <div className="vg-card vg-pad" onClick={e => e.stopPropagation()} style={{ width: 'min(400px, 94vw)' }}>
            <p style={{ marginTop: 0, fontWeight: 700 }}>Remove {confirmDel.label || 'this saving'}?</p>
            {kindOf(confirmDel) === 'RD' && <p className="vg-muted" style={{ fontSize: '0.84rem' }}>Its monthly instalment is taken off My Dashboard too, from every month that is not closed.</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '0.8rem' }}>
              <button className="vg-btn" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="vg-btn" style={{ color: 'var(--vg-neg)' }} onClick={() => { onSave(rows.filter(r => r.id !== confirmDel.id)); setConfirmDel(null) }}><Trash2 className="h-4 w-4" /> Remove</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ padding: '0.5rem 0.6rem', borderRadius: 10, background: 'color-mix(in srgb, var(--vg-accent) 6%, transparent)' }}>
      <div className="vg-lbl" style={{ marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: strong ? 800 : 650, fontVariantNumeric: 'tabular-nums', color: strong ? 'var(--vg-pos)' : 'var(--vg-ink)' }}>{value}</div>
    </div>
  )
}

function SavingEditor({ initial, onSave, onClose }: { initial: SavingItem; onSave: (s: SavingItem) => void; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>(kindOf(initial) === 'Other' && !initial.kind ? 'RD' : kindOf(initial))
  const [label, setLabel] = useState(initial.label)
  const [note, setNote] = useState(initial.note ?? '')
  // RD
  const [rdMonthly, setRdMonthly] = useState(String(initial.rd?.monthly || ''))
  const [rdRate, setRdRate] = useState(String(initial.rd?.rate ?? 7))
  const [rdStart, setRdStart] = useState(initial.rd?.start ?? today())
  const [rdBy, setRdBy] = useState<'months' | 'end'>('months')
  const [rdMonths, setRdMonths] = useState(String(initial.rd?.months ?? 12))
  const [rdEnd, setRdEnd] = useState(initial.rd ? addMonthsIso(initial.rd.start, initial.rd.months) : addMonthsIso(today(), 12))
  // FD
  const [fdAmount, setFdAmount] = useState(String(initial.fd?.principal || ''))
  const [fdRate, setFdRate] = useState(String(initial.fd?.rate ?? 7))
  const [fdStart, setFdStart] = useState(initial.fd?.start ?? today())
  const [fdBy, setFdBy] = useState<'date' | 'period'>('date')
  const [fdMaturity, setFdMaturity] = useState(initial.fd?.maturity ?? addMonthsIso(today(), 12))
  const [fdYears, setFdYears] = useState('1')
  const [fdMonths, setFdMonths] = useState('0')
  const [fdDays, setFdDays] = useState('0')
  const [fdPayout, setFdPayout] = useState<FdPayout>(initial.fd?.payout ?? 'cumulative')
  // Other
  const [otherKind, setOtherKind] = useState(kindOf(initial) === 'Other' ? (initial.kind ?? '') : '')
  const [balance, setBalance] = useState(String(initial.balance || ''))

  const months = rdBy === 'months' ? Math.round(num(rdMonths)) : monthsBetweenIso(rdStart, rdEnd)
  const maturity = fdBy === 'date' ? fdMaturity : (() => {
    const base = addMonthsIso(fdStart, Math.round(num(fdYears)) * 12 + Math.round(num(fdMonths)))
    const d = new Date(`${base}T00:00:00`); d.setDate(d.getDate() + Math.round(num(fdDays)))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const rd = kind === 'RD' && num(rdMonthly) > 0 && months > 0 ? rdView({ monthly: num(rdMonthly), rate: num(rdRate), start: rdStart, months }) : null
  const fd = kind === 'FD' && num(fdAmount) > 0 && maturity > fdStart ? fdView({ principal: num(fdAmount), rate: num(fdRate), start: fdStart, maturity, payout: fdPayout }) : null
  const ok = label.trim() && (kind === 'RD' ? !!rd : kind === 'FD' ? !!fd : true)

  const build = (): SavingItem => {
    const base: SavingItem = { id: initial.id, entity: initial.entity, label: label.trim(), note: note || undefined, balance: 0 }
    if (kind === 'RD') return { ...base, kind: 'RD', rd: { monthly: num(rdMonthly), rate: num(rdRate), start: rdStart, months }, balance: Math.round(rd!.currentValue), liquid: false }
    if (kind === 'FD') return { ...base, kind: 'FD', fd: { principal: num(fdAmount), rate: num(fdRate), start: fdStart, maturity, payout: fdPayout }, balance: Math.round(fd!.currentValue) }
    return { ...base, kind: otherKind || undefined, balance: num(balance) }
  }

  const field = (label: string, el: React.ReactNode, hint?: string) => (
    <div style={{ marginTop: '0.6rem' }}><label className="vg-lbl">{label}</label>{el}{hint && <p className="vg-muted" style={{ fontSize: '0.74rem', margin: '0.2rem 0 0' }}>{hint}</p>}</div>
  )
  const money = (v: string, set: (s: string) => void, ph = '0') => <input className="vg-input vg-num" inputMode="decimal" value={v} placeholder={ph} onChange={e => set(e.target.value)} />
  const date = (v: string, set: (s: string) => void, min?: string) => <input type="date" className="vg-input" value={v} min={min} onChange={e => e.target.value && set(e.target.value)} />

  return (
    <div className="vg-lb" onClick={onClose}>
      <div className="vg-card vg-pad" onClick={e => e.stopPropagation()} style={{ width: 'min(500px, 96vw)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
          <p className="vg-sec" style={{ margin: 0 }}>Saving</p>
          <button className="vg-icobtn" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        {field('Type of saving', (
          <select className="vg-select" value={kind} onChange={e => setKind(e.target.value as Kind)}>
            <option value="RD">RD — Recurring deposit</option>
            <option value="FD">FD — Fixed deposit</option>
            <option value="Other">Other (mutual fund, gold, cash…)</option>
          </select>
        ))}
        {field('Name', <input className="vg-input" value={label} onChange={e => setLabel(e.target.value)} placeholder={kind === 'RD' ? 'e.g. SBI RD' : kind === 'FD' ? 'e.g. HDFC FD' : 'e.g. Index fund'} autoFocus />)}

        {kind === 'RD' && <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            {field('Monthly instalment', money(rdMonthly, setRdMonthly))}
            {field('Interest rate % a year', money(rdRate, setRdRate, '7'))}
          </div>
          {field('Start date', date(rdStart, setRdStart))}
          {field('Tenure', (
            <>
              <div className="vg-tabs" style={{ marginBottom: 6 }}>
                <button className="vg-tab" data-on={rdBy === 'months'} onClick={() => setRdBy('months')}>In months</button>
                <button className="vg-tab" data-on={rdBy === 'end'} onClick={() => setRdBy('end')}>Maturity date</button>
              </div>
              {rdBy === 'months' ? money(rdMonths, setRdMonths, '12') : date(rdEnd, setRdEnd, rdStart)}
            </>
          ))}
          {rd && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: '0.9rem' }}>
              <Stat label="Worth today" value={INR(rd.currentValue)} strong />
              <Stat label="At maturity" value={INR(rd.maturityValue)} strong />
              <Stat label="Put in so far" value={`${INR(rd.deposited)} · ${rd.installmentsPaid} of ${months}`} />
              <Stat label="Interest earned by maturity" value={INR(rd.interest)} />
              <Stat label="Matures on" value={fmtDate(rd.maturityDate)} />
              <Stat label="Last instalment" value={fmtDate(rd.lastInstalment)} />
            </div>
          )}
          <p className="vg-muted" style={{ fontSize: '0.76rem', margin: '0.7rem 0 0', display: 'flex', gap: 6 }}><Repeat className="h-4 w-4" style={{ flex: '0 0 auto' }} /> The monthly instalment comes out of your salary: it shows on My Dashboard under EMIs, as a personal expense, until the last instalment.</p>
        </>}

        {kind === 'FD' && <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            {field('Amount deposited', money(fdAmount, setFdAmount))}
            {field('Interest rate % a year', money(fdRate, setFdRate, '7'))}
          </div>
          {field('Start date', date(fdStart, setFdStart))}
          {field('Maturity', (
            <>
              <div className="vg-tabs" style={{ marginBottom: 6 }}>
                <button className="vg-tab" data-on={fdBy === 'date'} onClick={() => setFdBy('date')}>Maturity date</button>
                <button className="vg-tab" data-on={fdBy === 'period'} onClick={() => setFdBy('period')}>Period</button>
              </div>
              {fdBy === 'date' ? date(fdMaturity, setFdMaturity, fdStart) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  <label style={{ fontSize: '0.78rem' }}>Years{money(fdYears, setFdYears)}</label>
                  <label style={{ fontSize: '0.78rem' }}>Months{money(fdMonths, setFdMonths)}</label>
                  <label style={{ fontSize: '0.78rem' }}>Days{money(fdDays, setFdDays)}</label>
                </div>
              )}
            </>
          ))}
          {field('Interest paid', (
            <select className="vg-select" value={fdPayout} onChange={e => setFdPayout(e.target.value as FdPayout)}>
              {PAYOUT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
          {fd && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: '0.9rem' }}>
              <Stat label="Worth today" value={INR(fd.currentValue)} strong />
              <Stat label="At maturity" value={INR(fd.maturityValue)} strong />
              <Stat label={fdPayout === 'cumulative' ? 'Interest at maturity' : `Interest paid ${fd.payoutLabel}`} value={INR(fdPayout === 'cumulative' ? fd.interest : fd.payoutEach)} />
              <Stat label="Total interest" value={INR(fd.interest)} />
              <Stat label="Matures on" value={fmtDate(maturity)} />
              <Stat label="Period" value={`${fd.days} days${fd.simple ? ' · simple interest' : ''}`} />
            </div>
          )}
          <p className="vg-muted" style={{ fontSize: '0.76rem', margin: '0.7rem 0 0', display: 'flex', gap: 6 }}><Landmark className="h-4 w-4" style={{ flex: '0 0 auto' }} /> An FD is kept here only — it does not change My Dashboard or your monthly figures.</p>
        </>}

        {kind === 'Other' && <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            {field('What kind', <input className="vg-input" value={otherKind} onChange={e => setOtherKind(e.target.value)} placeholder="MF, gold, PPF…" />)}
            {field('Balance', money(balance, setBalance))}
          </div>
          <p className="vg-muted" style={{ fontSize: '0.76rem', margin: '0.7rem 0 0', display: 'flex', gap: 6 }}><Wallet className="h-4 w-4" style={{ flex: '0 0 auto' }} /> Kept as a balance you update yourself.</p>
        </>}

        {field('Note (optional)', <input className="vg-input" value={note} onChange={e => setNote(e.target.value)} />)}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1rem' }}>
          <button className="vg-btn" onClick={onClose}>Cancel</button>
          <button className="vg-btn vg-btn-primary" disabled={!ok} onClick={() => onSave(build())}><Check className="h-4 w-4" /> Save</button>
        </div>
      </div>
    </div>
  )
}
