'use client'

// ============================================================
// components/vault/finance-plus.tsx
//
// The money side of the finance dashboard, built on lib/finance-plan.ts:
//
//   Money   — Available Money (the one number), Safe-to-Spend, the
//             Financial Inbox, accounts with their monthly rollover and
//             transfers, the month-end close, and who paid vs who owns
//   Goals   — goals as buckets, month-end surplus allocation, allowances
//   Plan    — the health timeline, "Can I afford it?", the what-if engine,
//             and financial memory
//   Access  — delegated access: request, approve with granular
//             permissions, revoke, and switch into "acting as" mode
//
// Everything here reads the one document; writes go through the action API,
// which re-checks every permission on the server.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus, Check, X, Pencil, Trash2, ArrowRight, ArrowLeftRight, TriangleAlert, Inbox, ShieldCheck,
  Undo2, Sparkles, Lightbulb, Eye, LogOut, Baby, Target,
} from 'lucide-react'
import {
  type FinanceDoc, type Account, type Goal, type Allowance, type AccessPerms, type AccessArea, type AccessOp,
  type Item, type Entity, type AllocRule,
  ACCESS_AREAS, ACCESS_OPS, ACCESS_LABEL, INR, monthKey, monthLabel, addMonths, entName, entColor, monthView,
  shares, computeSettlement, can,
} from '@/lib/finance-data'
import {
  availableMoney, safeToSpend, accountsOf, accountLedgers, ACCOUNT_TYPE_LABEL, goalStatus,
  healthTimeline, affordCheck, runScenario, type ScenarioChange, detectAnomalies, financialMemory,
  monthSurplus, proposeAllocation, allocRulesFor, allowanceStatus, paidVsOwned, loansFor, isPending,
} from '@/lib/finance-plan'

// ---------- shared bits -----------------------------------------

export type Act = (payload: Record<string, unknown>) => Promise<{ ok?: boolean; error?: string } | null>
export interface ActingInfo { grantId: string; owner: string; ownerName: string; grantee: string; granteeName: string; perms: AccessPerms }
type Perm = (area: AccessArea, op: AccessOp) => boolean
const ALL: Perm = () => true

const num = (v: string) => { const n = parseFloat(v.replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0 }
const signed = (n: number) => `${n < 0 ? '−' : ''}${INR(Math.abs(n))}`
const BASE_C = '#4b7bec', SCEN_C = '#c2410c'     // validated pair: current plan vs scenario

/** Runs an action, and shows what the server said. */
function useRunner(action: Act) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const run = async (payload: Record<string, unknown>, okText?: string) => {
    setBusy(true)
    const d = await action(payload)
    setBusy(false)
    const ok = !!d && !d.error
    const text = d?.error ?? (ok ? okText : 'That did not go through — check your connection.')
    if (text) {
      setMsg({ ok, text })
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setMsg(null), ok ? 2600 : 6000)
    }
    return ok
  }
  const flash = msg ? (
    <div role="status" className="vg-card" style={{ position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 70, padding: '0.6rem 0.9rem', background: msg.ok ? '#123d2c' : '#4a1420', color: '#fff', fontSize: '0.85rem', maxWidth: 'min(520px, 92vw)', boxShadow: '0 16px 40px -14px rgba(0,0,0,0.5)' }}>
      {msg.text}
    </div>
  ) : null
  return { run, busy, flash }
}

function Modal({ title, onClose, children, width = 460 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div className="vg-lb" onClick={onClose}>
      <div className="vg-card vg-pad" onClick={e => e.stopPropagation()} style={{ width: `min(${width}px, 96vw)`, background: 'var(--vg-glass-2)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <p className="vg-sec" style={{ margin: 0 }}>{title}</p>
          <button className="vg-icobtn" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginTop: '0.6rem' }}>
      <label className="vg-lbl">{label}</label>
      {children}
      {hint && <p className="vg-muted" style={{ fontSize: '0.74rem', margin: '0.25rem 0 0' }}>{hint}</p>}
    </div>
  )
}

function Bar({ pct, color = 'linear-gradient(90deg,#a06be0,#6d4bd8)', track = 'rgba(109,75,216,0.12)', h = 8 }: { pct: number; color?: string; track?: string; h?: number }) {
  return (
    <span style={{ display: 'block', height: h, borderRadius: 999, background: track, overflow: 'hidden' }}>
      <span style={{ display: 'block', height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, borderRadius: 999, background: color }} />
    </span>
  )
}

function Sub<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="vg-subtabs" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
      {options.map(([v, l]) => <button key={v} className="vg-subtab" data-on={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  )
}

const cardHead = (title: string, right?: React.ReactNode) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: '0.7rem' }}>
    <p className="vg-sec" style={{ margin: 0 }}>{title}</p>
    {right}
  </div>
)

// ---------- acting-as banner & profile switcher -----------------

export function ProfileSwitcher({ options, active, onSwitch }: { options: { id: string | null; label: string }[]; active: string | null; onSwitch: (id: string | null) => void }) {
  if (options.length < 2) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.9rem' }}>
      <div className="vg-subtabs" role="tablist" aria-label="Whose finances">
        {options.map(o => (
          <button key={o.id ?? 'me'} role="tab" aria-selected={active === o.id} className="vg-subtab" data-on={active === o.id} onClick={() => onSwitch(o.id)}>{o.label}</button>
        ))}
      </div>
    </div>
  )
}

export function ActingBanner({ acting, onExit }: { acting: ActingInfo; onExit: () => void }) {
  const granted = ACCESS_AREAS.filter(a => acting.perms[a]?.length)
  return (
    <div className="vg-card" style={{ padding: '0.75rem 1rem', marginBottom: '1rem', background: 'linear-gradient(90deg, rgba(194,65,12,0.12), rgba(109,75,216,0.10))', border: '1px solid rgba(194,65,12,0.35)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <ShieldCheck className="h-5 w-5" style={{ color: SCEN_C, flex: '0 0 auto' }} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontWeight: 800, fontSize: '0.98rem' }}>Managing: {acting.ownerName}’s Finance</div>
        <div className="vg-muted" style={{ fontSize: '0.8rem' }}>
          Logged in as {acting.granteeName} · every change is logged as done on {acting.ownerName}’s behalf · allowed: {granted.map(a => ACCESS_LABEL[a]).join(', ') || 'nothing'}
        </div>
      </div>
      <button className="vg-btn" onClick={onExit}><LogOut className="h-4 w-4" /> Back to my finance</button>
    </div>
  )
}

// ---------- permission matrix -----------------------------------

export function PermMatrix({ value, onChange, readOnly, highlight }: { value: AccessPerms; onChange?: (p: AccessPerms) => void; readOnly?: boolean; highlight?: AccessPerms }) {
  const toggle = (a: AccessArea, o: AccessOp) => {
    if (readOnly || !onChange) return
    const cur = new Set(value[a] ?? [])
    if (cur.has(o)) {
      cur.delete(o)
      if (o === 'view') cur.clear()                   // no view means nothing else either
    } else {
      cur.add(o)
      cur.add('view')                                 // anything you can change, you can see
    }
    const next = { ...value, [a]: ACCESS_OPS.filter(x => cur.has(x)) }
    if (!next[a]!.length) delete next[a]
    onChange(next)
  }
  return (
    <div className="vg-tablewrap">
      <table className="vg-table" style={{ minWidth: 300 }}>
        <thead><tr><th>Permission</th>{ACCESS_OPS.map(o => <th key={o} style={{ textAlign: 'center', textTransform: 'capitalize' }}>{o}</th>)}</tr></thead>
        <tbody>
          {ACCESS_AREAS.map(a => (
            <tr key={a}>
              <td style={{ fontWeight: 600 }}>{ACCESS_LABEL[a]}</td>
              {ACCESS_OPS.map(o => {
                const on = (value[a] ?? []).includes(o)
                const asked = highlight ? (highlight[a] ?? []).includes(o) : false
                return (
                  <td key={o} style={{ textAlign: 'center' }}>
                    {readOnly
                      ? <span aria-label={on ? 'allowed' : 'not allowed'} style={{ fontWeight: 800, color: on ? 'var(--vg-pos)' : 'var(--vg-ink-faint)' }}>{on ? '✓' : '—'}</span>
                      : <input type="checkbox" checked={on} onChange={() => toggle(a, o)} aria-label={`${ACCESS_LABEL[a]} ${o}`}
                          style={{ width: 17, height: 17, accentColor: '#6d4bd8', outline: asked && !on ? '2px dashed rgba(194,65,12,0.6)' : undefined }} />}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const PRESETS: { label: string; perms: AccessPerms }[] = [
  { label: 'Day-to-day helper', perms: { expenses: ['view', 'add', 'edit'], accounts: ['view'], budgets: ['view', 'add', 'edit'], documents: ['view', 'add'], savings: ['view', 'add', 'edit'] } },
  { label: 'View only', perms: Object.fromEntries(ACCESS_AREAS.map(a => [a, ['view']])) as AccessPerms },
  { label: 'Full management', perms: Object.fromEntries(ACCESS_AREAS.map(a => [a, [...ACCESS_OPS]])) as AccessPerms },
]

const permLines = (p: AccessPerms) => {
  const out: string[] = []
  const has = (a: AccessArea, o: AccessOp) => (p[a] ?? []).includes(o)
  for (const a of ACCESS_AREAS) {
    const ops = (p[a] ?? []).filter(o => o !== 'view')
    if (ops.length) out.push(`${ops.map(o => o[0].toUpperCase() + o.slice(1)).join(' / ')} ${ACCESS_LABEL[a].toLowerCase()}`)
    else if (has(a, 'view')) out.push(`View ${ACCESS_LABEL[a].toLowerCase()}`)
  }
  return out
}

// ============================================================
// MONEY
// ============================================================

export function MoneyTab({ doc, viewer, action, goTo, perm = ALL, me }: {
  doc: FinanceDoc; viewer: string | null; action: Act; goTo: (tab: string) => void; perm?: Perm
  me: { role: 'super' | 'member'; entityId: string | null }
}) {
  const { run, busy, flash } = useRunner(action)
  const k = monthKey()
  const am = useMemo(() => availableMoney(doc, viewer, k), [doc, viewer, k])
  const sts = useMemo(() => safeToSpend(doc, viewer, k), [doc, viewer, k])
  const accs = accountsOf(doc, viewer)
  const [editAcc, setEditAcc] = useState<Partial<Account> | null>(null)
  const [ledgerFor, setLedgerFor] = useState<string | null>(null)
  const [checkFor, setCheckFor] = useState<Account | null>(null)
  const [transfer, setTransfer] = useState(false)
  const canAcc = perm('accounts', 'view')
  const who = viewer ? entName(doc.entities, viewer) : 'Household'

  const breakdown: { label: string; value: number; neg?: boolean; hint?: string }[] = [
    { label: 'Bank', value: am.bank },
    { label: 'Cash', value: am.cash },
    ...(viewer ? [{ label: 'Savings available', value: am.savingsAvailable, hint: 'Savings pots you could draw on this month. Locked investments (PPF, MF, gold…) are left out.' }] : []),
    { label: 'Credit-card payable', value: -am.cardPayable, neg: true },
    { label: 'Reserved for upcoming bills', value: -am.reserved, neg: true, hint: 'This month’s bills not yet marked paid. Tick them off in This month as they go out.' },
    ...(am.owedOut > 0.5 ? [{ label: 'Settlement you still owe', value: -am.owedOut, neg: true }] : []),
  ]

  return (
    <>
      {flash}
      {/* ---- the one number ---- */}
      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        <div style={{ display: 'grid', gap: '1.2rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', alignItems: 'start' }}>
          <div>
            <p className="vg-sec" style={{ marginBottom: 4 }}>{viewer ? `${who}’s money` : 'Common account'} · today</p>
            <div style={{ fontSize: 'clamp(2rem, 6vw, 2.8rem)', fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{INR(am.gross)}</div>
            <div className="vg-muted" style={{ fontSize: '0.85rem', marginTop: -2 }}>Available</div>
            <div style={{ marginTop: '0.9rem' }}>
              {breakdown.map(b => (
                <div key={b.label} title={b.hint} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.32rem 0', borderBottom: '1px dashed var(--vg-line)', fontSize: '0.92rem' }}>
                  <span style={{ color: 'var(--vg-ink-soft)' }}>{b.label}</span>
                  <b style={{ fontVariantNumeric: 'tabular-nums', color: b.neg && b.value < -0.5 ? 'var(--vg-neg)' : undefined }}>{signed(b.value)}</b>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.55rem 0 0', fontSize: '1.02rem' }}>
                <b>Actually available</b>
                <b style={{ fontVariantNumeric: 'tabular-nums', color: am.available < 0 ? 'var(--vg-neg)' : 'var(--vg-pos)' }}>{signed(am.available)}</b>
              </div>
              {am.owedIn > 0.5 && <p className="vg-muted" style={{ fontSize: '0.76rem', margin: '0.3rem 0 0' }}>Others still owe you {INR(am.owedIn)} in the settlement — not counted until it arrives.</p>}
              {am.goalsEarmarked > 0.5 && <p className="vg-muted" style={{ fontSize: '0.76rem', margin: '0.3rem 0 0' }}>{INR(am.goalsEarmarked)} of this is already set aside in goal buckets.</p>}
            </div>
          </div>
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            <div className="vg-kpi">
              <div className="k">Safe to spend</div>
              <div className={`v ${sts.safe < 0 ? 'vg-neg' : 'vg-accent'}`}>{signed(sts.safe)}</div>
              <div className="vg-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                {sts.safe > 0 ? <>About <b>{INR(sts.perDay)}/day</b> for the {sts.daysLeft} day{sts.daysLeft === 1 ? '' : 's'} left in {monthLabel(k).split(' ')[0]}.</> : 'Nothing spare this month once bills and goals are covered.'}
                {sts.goals > 0.5 && <> Goal money still to put aside this month ({INR(sts.goals)}) is kept out.</>}
              </div>
            </div>
            {!am.hasAccounts && canAcc && (
              <div className="vg-kpi" style={{ border: '1px dashed rgba(109,75,216,0.4)' }}>
                <div className="k">Start here</div>
                <p style={{ margin: '0.35rem 0 0.6rem', fontSize: '0.88rem' }}>Add {viewer ? 'your' : 'the common'} bank account, cash and any credit card with today’s balance. From then on every expense and income rolls each balance forward month to month.</p>
                {perm('accounts', 'add') && <button className="vg-btn vg-btn-primary" onClick={() => setEditAcc({ type: 'bank', openingMonth: k, primary: true })}><Plus className="h-4 w-4" /> Add an account</button>}
              </div>
            )}
            {am.pendingItems.length > 0 && (
              <div className="vg-kpi">
                <div className="k">Still to go out this month</div>
                {am.pendingItems.slice(0, 5).map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', marginTop: 4 }}>
                    <span className="vg-nm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{p.name}</span><b>{INR(p.amount)}</b>
                  </div>
                ))}
                {am.pendingItems.length > 5 && <div className="vg-muted" style={{ fontSize: '0.76rem', marginTop: 4 }}>+{am.pendingItems.length - 5} more</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      <FinancialInbox doc={doc} viewer={viewer} me={me} goTo={goTo} />

      {/* ---- accounts ---- */}
      {canAcc && (
        <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
          {cardHead('Accounts & rollover', (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {accs.length >= 1 && perm('accounts', 'add') && <button className="vg-btn" onClick={() => setTransfer(true)}><ArrowLeftRight className="h-4 w-4" /> Transfer</button>}
              {perm('accounts', 'add') && <button className="vg-btn" onClick={() => setEditAcc({ type: 'bank', openingMonth: k, primary: accs.length === 0 })}><Plus className="h-4 w-4" /> Account</button>}
            </div>
          ))}
          {accs.length === 0 && <p className="vg-muted" style={{ fontSize: '0.86rem', margin: 0 }}>No accounts yet.</p>}
          <div style={{ display: 'grid', gap: '0.8rem', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
            {am.byAccount.map(({ account: a, now, pending }) => (
              <div key={a.id} className="vg-kpi" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="k" style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <span>{ACCOUNT_TYPE_LABEL[a.type]}{a.primary ? ' · main' : ''}</span>
                  {perm('accounts', 'edit') && <button className="vg-info" style={{ fontStyle: 'normal' }} onClick={() => setEditAcc(a)} aria-label={`Edit ${a.name}`}>✎</button>}
                </div>
                <div style={{ fontWeight: 700 }}>{a.name}</div>
                <div className={`v ${now < 0 ? 'vg-neg' : ''}`} style={{ fontSize: '1.3rem' }}>{signed(now)}</div>
                {pending > 0.5 && <div className="vg-muted" style={{ fontSize: '0.76rem' }}>{INR(pending)} of bills still to go out → closes near {signed(now - pending)}</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 'auto', flexWrap: 'wrap' }}>
                  <button className="vg-btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }} onClick={() => setLedgerFor(ledgerFor === a.id ? null : a.id)}>{ledgerFor === a.id ? 'Hide' : 'Month by month'}</button>
                  {perm('accounts', 'edit') && <button className="vg-btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }} onClick={() => setCheckFor(a)}>Check balance</button>}
                </div>
              </div>
            ))}
          </div>
          {ledgerFor && <RolloverTable doc={doc} account={accs.find(a => a.id === ledgerFor)!} />}
          <TransfersList doc={doc} accounts={accs} onRemove={perm('accounts', 'delete') ? id => run({ action: 'removeTransfer', id }, 'Transfer removed') : undefined} />
        </div>
      )}

      <MonthClose doc={doc} viewer={viewer} goTo={goTo} onCheck={setCheckFor} perm={perm} />
      <PaidOwnedCard doc={doc} k={k} />

      {editAcc && (
        <AccountEditor acc={editAcc} busy={busy} onClose={() => setEditAcc(null)}
          onRemove={editAcc.id && perm('accounts', 'delete') ? async () => { if (await run({ action: 'removeAccount', id: editAcc.id }, 'Account removed')) setEditAcc(null) } : undefined}
          onSave={async a => { if (await run({ action: 'saveAccount', account: a, isNew: !a.id }, a.id ? 'Account updated' : 'Account added')) setEditAcc(null) }} />
      )}
      {checkFor && (
        <CheckBalance acc={checkFor} doc={doc} busy={busy} onClose={() => setCheckFor(null)}
          onSave={async (month, balance) => { if (await run({ action: 'setCheckpoint', id: checkFor.id, month, balance }, 'Balance recorded')) setCheckFor(null) }} />
      )}
      {transfer && (
        <TransferEditor doc={doc} viewer={viewer} busy={busy} onClose={() => setTransfer(false)}
          onSave={async t => { if (await run({ action: 'addTransfer', transfer: t }, 'Transfer recorded')) setTransfer(false) }} />
      )}
    </>
  )
}

function AccountEditor({ acc, onSave, onClose, onRemove, busy }: { acc: Partial<Account>; onSave: (a: Partial<Account>) => void; onClose: () => void; onRemove?: () => void; busy: boolean }) {
  const [d, setD] = useState<Partial<Account>>({ ...acc })
  const card = d.type === 'card'
  const [openStr, setOpenStr] = useState(acc.opening != null ? String(card ? Math.abs(acc.opening) : acc.opening) : '')
  const save = () => onSave({ ...d, opening: card ? -Math.abs(num(openStr)) : num(openStr) })
  return (
    <Modal title={acc.id ? 'Edit account' : 'Add an account'} onClose={onClose}>
      <Field label="Name"><input className="vg-input" value={d.name ?? ''} onChange={e => setD({ ...d, name: e.target.value })} placeholder="e.g. HDFC Savings" autoFocus /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
        <Field label="Type">
          <select className="vg-select" value={d.type ?? 'bank'} onChange={e => setD({ ...d, type: e.target.value as Account['type'] })}>
            {(Object.keys(ACCOUNT_TYPE_LABEL) as Account['type'][]).map(t => <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="Starts from month"><input type="month" className="vg-input" value={d.openingMonth ?? monthKey()} onChange={e => setD({ ...d, openingMonth: e.target.value })} /></Field>
      </div>
      <Field label={card ? 'Amount owed at the start of that month' : 'Balance at the start of that month'}
        hint={card ? 'What the card statement said you owed. It is tracked as a negative balance; paying the bill is a transfer into the card.' : 'Opening balance. From here: opening + income + transfers in − expenses − transfers out = closing, and each closing becomes next month’s opening.'}>
        <input className="vg-input vg-num" inputMode="numeric" value={openStr} onChange={e => setOpenStr(e.target.value)} placeholder="0" />
      </Field>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: '0.8rem', fontSize: '0.88rem' }}>
        <input type="checkbox" checked={!!d.primary} onChange={e => setD({ ...d, primary: e.target.checked })} style={{ accentColor: '#6d4bd8' }} />
        Main account — expenses and income not tagged to an account land here
      </label>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', gap: 8 }}>
        {onRemove ? <button className="vg-btn" style={{ color: 'var(--vg-neg)' }} onClick={onRemove}><Trash2 className="h-4 w-4" /> Remove</button> : <span />}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="vg-btn" onClick={onClose}>Cancel</button>
          <button className="vg-btn vg-btn-primary" disabled={busy || !(d.name ?? '').trim()} onClick={save}><Check className="h-4 w-4" /> Save</button>
        </div>
      </div>
    </Modal>
  )
}

function CheckBalance({ acc, doc, onSave, onClose, busy }: { acc: Account; doc: FinanceDoc; onSave: (month: string, balance: number | null) => void; onClose: () => void; busy: boolean }) {
  const [month, setMonth] = useState(monthKey())
  const led = accountLedgers(doc, [acc], month)[acc.id] ?? []
  const row = led.find(r => r.key === month)
  const expected = row ? (month === monthKey() ? row.computed + row.pending : row.computed) : null
  const [v, setV] = useState(acc.checkpoints?.[month] != null ? String(acc.checkpoints[month]) : '')
  const diff = v !== '' && expected != null ? num(v) - expected : null
  return (
    <Modal title={`Check balance · ${acc.name}`} onClose={onClose}>
      <p className="vg-muted" style={{ fontSize: '0.84rem', marginTop: 0 }}>Enter what the bank shows. It re-anchors the rollover; any gap against the entries is shown as “not recorded”, so missing expenses are easy to spot.</p>
      <Field label="Month"><input type="month" className="vg-input" value={month} onChange={e => { setMonth(e.target.value); setV(acc.checkpoints?.[e.target.value] != null ? String(acc.checkpoints[e.target.value]) : '') }} /></Field>
      <Field label={month === monthKey() ? 'Balance today' : 'Closing balance that month'}>
        <input className="vg-input vg-num" inputMode="numeric" value={v} onChange={e => setV(e.target.value)} placeholder={expected != null ? String(Math.round(expected)) : ''} autoFocus />
      </Field>
      {expected != null && <p style={{ fontSize: '0.84rem', marginBottom: 0 }}>The entries say <b>{signed(expected)}</b>{diff != null && Math.abs(diff) > 0.5 && <> — a gap of <b className={diff < 0 ? 'vg-neg' : 'vg-pos'}>{signed(diff)}</b> {diff < 0 ? 'spent without an entry' : 'received without an entry'}.</>}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', gap: 8 }}>
        {acc.checkpoints?.[month] != null ? <button className="vg-btn" onClick={() => onSave(month, null)}>Clear</button> : <span />}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="vg-btn" onClick={onClose}>Cancel</button>
          <button className="vg-btn vg-btn-primary" disabled={busy || v.trim() === ''} onClick={() => onSave(month, num(v))}><Check className="h-4 w-4" /> Save</button>
        </div>
      </div>
    </Modal>
  )
}

function TransferEditor({ doc, viewer, onSave, onClose, busy }: { doc: FinanceDoc; viewer: string | null; onSave: (t: Record<string, unknown>) => void; onClose: () => void; busy: boolean }) {
  const mine = accountsOf(doc, viewer)
  const common = viewer ? accountsOf(doc, null) : []
  const all = [...mine, ...common]
  const [from, setFrom] = useState(mine[0]?.id ?? '')
  const [to, setTo] = useState(all.find(a => a.id !== mine[0]?.id)?.id ?? '')
  const [amt, setAmt] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const label = (a: Account) => `${a.name}${a.owner === 'common' && viewer ? ' (common)' : ''} · ${ACCOUNT_TYPE_LABEL[a.type]}`
  return (
    <Modal title="Move money between accounts" onClose={onClose}>
      <p className="vg-muted" style={{ fontSize: '0.82rem', marginTop: 0 }}>A transfer is not spending: it leaves one account and lands in another. Paying a credit-card bill, withdrawing cash and topping up the common account are all transfers.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
        <Field label="From"><select className="vg-select" value={from} onChange={e => setFrom(e.target.value)}>{all.map(a => <option key={a.id} value={a.id}>{label(a)}</option>)}</select></Field>
        <Field label="To"><select className="vg-select" value={to} onChange={e => setTo(e.target.value)}>{all.map(a => <option key={a.id} value={a.id}>{label(a)}</option>)}</select></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
        <Field label="Amount"><input className="vg-input vg-num" inputMode="numeric" value={amt} onChange={e => setAmt(e.target.value)} autoFocus /></Field>
        <Field label="Date"><input type="date" className="vg-input" value={date} onChange={e => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Note (optional)"><input className="vg-input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Card bill, September" /></Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', gap: 8 }}>
        <button className="vg-btn" onClick={onClose}>Cancel</button>
        <button className="vg-btn vg-btn-primary" disabled={busy || !from || !to || from === to || !(num(amt) > 0)}
          onClick={() => onSave({ from, to, amount: num(amt), date, month: date.slice(0, 7), note })}><Check className="h-4 w-4" /> Record transfer</button>
      </div>
    </Modal>
  )
}

function TransfersList({ doc, accounts, onRemove }: { doc: FinanceDoc; accounts: Account[]; onRemove?: (id: string) => void }) {
  const ids = new Set(accounts.map(a => a.id))
  const list = (doc.transfers ?? []).filter(t => ids.has(t.from) || ids.has(t.to)).sort((a, b) => (b.date ?? b.month).localeCompare(a.date ?? a.month)).slice(0, 8)
  if (!list.length) return null
  const nm = (id: string) => (doc.accounts ?? []).find(a => a.id === id)?.name ?? 'Account'
  return (
    <div style={{ marginTop: '1rem' }}>
      <p className="vg-lbl" style={{ marginBottom: 4 }}>Recent transfers</p>
      {list.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.35rem 0', borderBottom: '1px dashed var(--vg-line)', fontSize: '0.86rem' }}>
          <span className="vg-muted" style={{ width: 84, flex: '0 0 auto' }}>{t.date ?? t.month}</span>
          <span style={{ flex: 1, minWidth: 0 }}>{nm(t.from)} <ArrowRight className="h-3 w-3" style={{ display: 'inline' }} /> {nm(t.to)}{t.note && <span className="vg-muted"> · {t.note}</span>}</span>
          <b style={{ fontVariantNumeric: 'tabular-nums' }}>{INR(t.amount)}</b>
          {onRemove && <button className="vg-icobtn" style={{ width: 26, height: 26 }} onClick={() => onRemove(t.id)} aria-label="Remove transfer"><Trash2 className="h-3.5 w-3.5" /></button>}
        </div>
      ))}
    </div>
  )
}

function RolloverTable({ doc, account }: { doc: FinanceDoc; account: Account }) {
  const rows = (accountLedgers(doc, [account], monthKey())[account.id] ?? []).slice(-12).reverse()
  return (
    <div style={{ marginTop: '1rem' }}>
      <p className="vg-lbl" style={{ marginBottom: 4 }}>{account.name} — opening + income + transfers in − expenses − transfers out = closing</p>
      <div className="vg-tablewrap">
        <table className="vg-table" style={{ minWidth: 760 }}>
          <thead><tr>
            <th>Month</th><th className="num">Opening</th><th className="num">+ Income</th><th className="num">+ In</th>
            <th className="num">− Expenses</th><th className="num">− Out</th><th className="num">= Closing</th><th className="num">Bank says</th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} style={r.key === monthKey() ? { background: 'rgba(109,75,216,0.06)' } : undefined}>
                <td style={{ fontWeight: 600 }}>{monthLabel(r.key)}{r.key === monthKey() && <span className="vg-chip" style={{ marginLeft: 6 }}>now</span>}</td>
                <td className="num vg-muted">{signed(r.opening)}</td>
                <td className="num vg-pos">{r.income ? INR(r.income) : '—'}</td>
                <td className="num">{r.transfersIn ? INR(r.transfersIn) : '—'}</td>
                <td className="num">{r.expenses ? INR(r.expenses) : '—'}{r.pending > 0.5 && <span className="vg-muted" style={{ display: 'block', fontSize: '0.7rem' }}>{INR(r.pending)} unpaid</span>}</td>
                <td className="num">{r.transfersOut ? INR(r.transfersOut) : '—'}</td>
                <td className="num" style={{ fontWeight: 700 }}>{signed(r.closing)}</td>
                <td className="num">{r.checkpoint != null
                  ? <>{signed(r.checkpoint)}{Math.abs(r.unrecorded) > 0.5 && <span className={r.unrecorded < 0 ? 'vg-neg' : 'vg-pos'} style={{ display: 'block', fontSize: '0.7rem' }}>{signed(r.unrecorded)} not recorded</span>}</>
                  : <span className="vg-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="vg-muted" style={{ fontSize: '0.72rem', marginTop: '0.4rem' }}>Each month’s closing is the next month’s opening. A “bank says” figure re-anchors the chain from that month on.</p>
    </div>
  )
}

// ---------- the financial inbox ---------------------------------

function FinancialInbox({ doc, viewer, me, goTo }: { doc: FinanceDoc; viewer: string | null; me: { role: 'super' | 'member'; entityId: string | null }; goTo: (tab: string) => void }) {
  const k = monthKey()
  const items = useMemo(() => {
    const out: { id: string; tone: 'act' | 'warn' | 'info'; text: string; sub?: string; tab?: string; cta?: string }[] = []
    const myId = me.entityId
    const approvals = (doc.proposals ?? []).filter(p => (myId ? p.approvers.includes(myId) : true))
    if (approvals.length) out.push({ id: 'appr', tone: 'act', text: `${approvals.length} change${approvals.length === 1 ? '' : 's'} waiting for your approval`, tab: 'approvals', cta: 'Review' })
    for (const d of (doc.delegations ?? []).filter(x => x.status === 'pending' && x.owner === myId)) {
      out.push({ id: `dlg:${d.id}`, tone: 'act', text: `${entName(doc.entities, d.grantee)} is requesting permission to manage your finances`, sub: permLines(d.requested).slice(0, 4).join(' · '), tab: 'access', cta: 'Decide' })
    }
    const m = monthView(doc, k)
    const unpaid = m.items.filter(it => isPending(it, k) && (viewer ? it.paidBy === viewer : it.paidBy === 'common'))
    if (unpaid.length) out.push({ id: 'unpaid', tone: 'info', text: `${unpaid.length} bill${unpaid.length === 1 ? '' : 's'} this month not yet marked paid`, sub: unpaid.slice(0, 3).map(i => `${i.name} ${INR(i.amount)}`).join(' · '), tab: 'month', cta: 'Open month' })
    for (const a of detectAnomalies(doc, viewer, k).slice(0, 4)) out.push({ id: a.id, tone: 'warn', text: a.text, sub: a.detail, tab: 'month', cta: 'Investigate' })
    for (const g of (doc.goals ?? []).filter(x => !x.archived && x.owner === (viewer ?? 'household'))) {
      const st = goalStatus(g, k)
      if (st.shortBy > 0.5 && st.planned > 0) out.push({ id: `goal:${g.id}`, tone: 'warn', text: st.message, tab: 'goals', cta: 'Goals' })
    }
    const prev = addMonths(k, -1)
    if (viewer && monthSurplus(doc, viewer, prev) > 500 && !(doc.allocations ?? []).some(a => a.owner === viewer && a.month === prev && !a.undone)) {
      out.push({ id: 'surplus', tone: 'act', text: `${INR(monthSurplus(doc, viewer, prev))} surplus from ${monthLabel(prev)} is waiting to be allocated`, tab: 'goals', cta: 'Allocate' })
    }
    if (!doc.settlements?.[prev]?.closed && Object.keys(doc.months).includes(prev)) out.push({ id: 'close', tone: 'info', text: `${monthLabel(prev)} is not closed yet`, sub: 'The month-end close below walks through it.', cta: undefined })
    const mem = financialMemory(doc, viewer, k).find(x => x.soon && x.suggest)
    if (mem) out.push({ id: mem.id, tone: 'info', text: mem.text, sub: mem.when ? `Coming up in ${monthLabel(mem.when)}.` : undefined, tab: 'plan', cta: 'Plan for it' })
    for (const al of (doc.allowances ?? []).filter(a => a.active && myId && a.approvers.includes(myId))) {
      const st = allowanceStatus(doc, al, k)
      if (st.remaining < 0) out.push({ id: `alw:${al.id}`, tone: 'warn', text: `${entName(doc.entities, al.entity)} is ${INR(-st.remaining)} over this month’s allowance`, tab: 'goals', cta: 'See allowance' })
    }
    return out
  }, [doc, viewer, me.entityId, k])

  const tone = { act: '#6d4bd8', warn: SCEN_C, info: '#4b7bec' }
  return (
    <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
      {cardHead('Financial inbox', <span className="vg-chip"><Inbox className="h-3 w-3" /> {items.length || 'All clear'}</span>)}
      {items.length === 0 && <p className="vg-muted" style={{ margin: 0, fontSize: '0.88rem' }}>Nothing needs you right now.</p>}
      {items.map(it => (
        <div key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '0.55rem 0', borderBottom: '1px dashed var(--vg-line)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: tone[it.tone], marginTop: 7, flex: '0 0 auto' }} aria-hidden />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{it.tone === 'warn' && <TriangleAlert className="h-3.5 w-3.5" style={{ display: 'inline', color: SCEN_C, marginRight: 4, verticalAlign: '-2px' }} />}{it.text}</div>
            {it.sub && <div className="vg-muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>{it.sub}</div>}
          </div>
          {it.tab && it.cta && <button className="vg-btn" style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', flex: '0 0 auto' }} onClick={() => goTo(it.tab!)}>{it.cta} <ArrowRight className="h-3.5 w-3.5" /></button>}
        </div>
      ))}
    </div>
  )
}

// ---------- month-end close assistant ---------------------------

function MonthClose({ doc, viewer, goTo, onCheck, perm }: { doc: FinanceDoc; viewer: string | null; goTo: (t: string) => void; onCheck: (a: Account) => void; perm: Perm }) {
  const [mk, setMk] = useState(addMonths(monthKey(), -1))
  const accs = accountsOf(doc, viewer)
  const m = monthView(doc, mk)
  const unpaid = m.items.filter(it => it.src === 'template' && !it.paid && (viewer ? it.paidBy === viewer : it.paidBy === 'common'))
  const checked = accs.filter(a => a.checkpoints?.[mk] != null)
  const closed = !!doc.settlements?.[mk]?.closed
  const surplus = viewer ? monthSurplus(doc, viewer, mk) : 0
  const allocated = viewer ? (doc.allocations ?? []).some(a => a.owner === viewer && a.month === mk && !a.undone) : true
  const led = accountLedgers(doc, accs, mk)
  const closing = accs.reduce((s, a) => s + (led[a.id]?.find(r => r.key === mk)?.closing ?? 0), 0)
  const steps: { done: boolean; title: string; body: React.ReactNode; action?: React.ReactNode }[] = [
    { done: unpaid.length === 0, title: 'Recurring bills ticked off', body: unpaid.length ? `${unpaid.length} still unticked: ${unpaid.slice(0, 3).map(i => i.name).join(', ')}${unpaid.length > 3 ? '…' : ''}. Past months count them as paid either way; ticking keeps it honest.` : 'Everything recurring is marked paid.', action: unpaid.length ? <button className="vg-btn" onClick={() => goTo('month')}>Open month</button> : undefined },
    { done: accs.length > 0 && checked.length === accs.length, title: 'Balances checked against the bank', body: accs.length ? `${checked.length} of ${accs.length} account${accs.length === 1 ? '' : 's'} checked for ${monthLabel(mk)}.` : 'Add accounts first to reconcile balances.', action: perm('accounts', 'edit') ? <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{accs.filter(a => a.checkpoints?.[mk] == null).slice(0, 3).map(a => <button key={a.id} className="vg-btn" onClick={() => onCheck(a)}>{a.name}</button>)}</span> : undefined },
    { done: closed, title: 'Settlement closed', body: closed ? 'Closed — anything unpaid was carried into the next month.' : 'Who owes whom for the month is still open.', action: !closed ? <button className="vg-btn" onClick={() => goTo('settle')}>Settlement</button> : undefined },
    ...(viewer ? [{ done: allocated || surplus <= 0, title: 'Surplus allocated', body: surplus > 0 ? (allocated ? `${INR(surplus)} surplus has been allocated.` : `${INR(surplus)} surplus waiting — split it across your goals.`) : 'No surplus this month to allocate.', action: !allocated && surplus > 0 ? <button className="vg-btn" onClick={() => goTo('goals')}>Allocate</button> : undefined }] : []),
    { done: accs.length > 0, title: 'Balances rolled over', body: accs.length ? <>Closing {signed(closing)} across your accounts becomes {monthLabel(addMonths(mk, 1))}’s opening — automatically.</> : 'Rollover starts once accounts exist.' },
  ]
  const doneCount = steps.filter(s => s.done).length
  return (
    <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
      {cardHead(`Month-end close · ${monthLabel(mk)}`, (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="vg-chip">{doneCount}/{steps.length} done</span>
          <input type="month" className="vg-input" style={{ width: 150 }} value={mk} max={monthKey()} onChange={e => setMk(e.target.value || mk)} aria-label="Month to close" />
        </div>
      ))}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {steps.map((s, i) => (
          <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '0.55rem 0', borderBottom: i < steps.length - 1 ? '1px dashed var(--vg-line)' : 0 }}>
            <span aria-label={s.done ? 'done' : 'to do'} style={{ width: 22, height: 22, borderRadius: 999, flex: '0 0 auto', display: 'grid', placeItems: 'center', fontSize: '0.72rem', fontWeight: 800, background: s.done ? 'var(--vg-pos)' : 'rgba(109,75,216,0.12)', color: s.done ? '#fff' : 'var(--vg-accent)' }}>{s.done ? '✓' : i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{s.title}</div>
              <div className="vg-muted" style={{ fontSize: '0.8rem' }}>{s.body}</div>
              {s.action && <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>{s.action}</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---------- who paid vs who owns --------------------------------

function PaidOwnedCard({ doc, k }: { doc: FinanceDoc; k: string }) {
  const rows = useMemo(() => paidVsOwned(doc, k), [doc, k])
  const transfers = computeSettlement(doc, k).transfers.filter(t => t.kind === 'peer' && t.due > 0.5)
  if (!rows.length) return null
  const max = Math.max(1, ...rows.map(r => Math.max(r.paid, r.owns)))
  const nm = (id: string) => (id === 'common' ? 'Household' : entName(doc.entities, id))
  return (
    <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
      {cardHead(`Who paid vs who owns · ${monthLabel(k)}`)}
      <p className="vg-muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>Paid is what left each person’s own account. Owns is their share of the cost. The gap is what the settlement evens out.</p>
      {rows.map(r => (
        <div key={r.entity} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 140px) 1fr auto', gap: 10, alignItems: 'center', padding: '0.45rem 0', borderBottom: '1px dashed var(--vg-line)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}><span className="vg-dot" style={{ background: entColor(doc.entities, r.entity) }} />{nm(r.entity)}</span>
          <div style={{ display: 'grid', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem' }}><span className="vg-muted" style={{ width: 34 }}>Paid</span><span style={{ flex: 1 }}><Bar pct={(r.paid / max) * 100} color={BASE_C} track="transparent" h={7} /></span><span style={{ width: 78, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{INR(r.paid)}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem' }}><span className="vg-muted" style={{ width: 34 }}>Owns</span><span style={{ flex: 1 }}><Bar pct={(r.owns / max) * 100} color={SCEN_C} track="transparent" h={7} /></span><span style={{ width: 78, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{INR(r.owns)}</span></div>
          </div>
          <b style={{ fontSize: '0.84rem', minWidth: 90, textAlign: 'right' }} className={r.net > 0.5 ? 'vg-pos' : r.net < -0.5 ? 'vg-neg' : 'vg-muted'}>
            {r.entity === 'common' ? 'shared' : doc.entities.find(e => e.id === r.entity)?.isLiability ? 'dependent' : r.net > 0.5 ? `is owed ${INR(r.net)}` : r.net < -0.5 ? `owes ${INR(-r.net)}` : 'even'}
          </b>
        </div>
      ))}
      {transfers.length > 0 && (
        <p style={{ fontSize: '0.84rem', margin: '0.7rem 0 0' }}>
          <b>To settle:</b> {transfers.map(t => `${nm(t.from)} → ${nm(t.to)} ${INR(t.due)}`).join(' · ')}
        </p>
      )}
    </div>
  )
}

/** Shown inside the expense editor: the paid-by vs owned-by split, live. */
export function SplitPreview({ item, entities }: { item: Item; entities: Entity[] }) {
  const sh = shares(item)
  const amt = item.amount || 0
  const persons = new Set(entities.filter(e => e.kind === 'person').map(e => e.id))
  const parts = Object.entries(sh).filter(([, f]) => f > 0.001)
  if (!amt || !parts.length) return null
  const nm = (id: string) => (id === 'common' ? 'Household' : entName(entities, id))
  return (
    <div style={{ marginTop: '0.7rem', padding: '0.6rem 0.7rem', borderRadius: 12, background: 'rgba(109,75,216,0.06)', border: '1px solid var(--vg-line)', fontSize: '0.82rem' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{INR(amt)} paid by {nm(item.paidBy)}</div>
      {parts.map(([id, f]) => (
        <div key={id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span><span className="vg-dot" style={{ background: entColor(entities, id), marginRight: 5 }} />{nm(id)}: {Math.round(f * 100)}%</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {INR(amt * f)}
            {item.paidBy !== 'common' && id !== item.paidBy && persons.has(id) && persons.has(item.paidBy) && <span className="vg-muted"> · owes {nm(item.paidBy)}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// GOALS (buckets, surplus allocation, allowances)
// ============================================================

const GOAL_KINDS: [NonNullable<Goal['kind']>, string][] = [['emergency', 'Emergency fund'], ['travel', 'Vacation'], ['vehicle', 'Vehicle'], ['education', 'Education'], ['gadget', 'Gadget'], ['home', 'Home'], ['other', 'Other']]
const GOAL_COLORS = ['#6d4bd8', '#1f9d6b', '#4b7bec', '#c2410c', '#b0479a', '#0e7490', '#8b6d1d']

export function GoalsTab({ doc, viewer, action, perm = ALL, me }: { doc: FinanceDoc; viewer: string | null; action: Act; perm?: Perm; me: { role: 'super' | 'member'; entityId: string | null } }) {
  const { run, busy, flash } = useRunner(action)
  const [sub, setSub] = useState<'goals' | 'allowances'>('goals')
  const [edit, setEdit] = useState<Partial<Goal> | null>(null)
  const [contrib, setContrib] = useState<Goal | null>(null)
  const k = monthKey()
  const owner = viewer ?? 'household'
  const goals = (doc.goals ?? []).filter(g => !g.archived && (g.owner === owner || (viewer && g.owner === 'household')))
  const canSee = perm('savings', 'view')
  const canEdit = perm('savings', 'edit')
  const total = goals.filter(g => g.owner === owner).reduce((a, g) => a + (g.saved || 0), 0)
  const showAllowances = me.role === 'super' || (doc.allowances ?? []).length > 0 || doc.entities.some(e => e.kind === 'person' && e.isLiability)

  return (
    <>
      {flash}
      {showAllowances && <Sub value={sub} onChange={setSub} options={[['goals', 'Goals'], ['allowances', 'Allowances']]} />}
      {sub === 'allowances' ? <AllowancesPanel doc={doc} me={me} run={run} busy={busy} /> : !canSee ? <p className="vg-empty">You don’t have access to savings and goals for this profile.</p> : (
        <>
          <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
            {cardHead(viewer ? 'Goals' : 'Household goals', canEdit && perm('savings', 'add') ? <button className="vg-btn vg-btn-primary" onClick={() => setEdit({ kind: 'other', owner, color: GOAL_COLORS[goals.length % GOAL_COLORS.length] })}><Plus className="h-4 w-4" /> New goal</button> : undefined)}
            {goals.length > 0 && <p className="vg-muted" style={{ marginTop: 0, fontSize: '0.84rem' }}>{INR(total)} set aside across {goals.filter(g => g.owner === owner).length} bucket{goals.length === 1 ? '' : 's'}{viewer && goals.some(g => g.owner === 'household') ? ', plus shared household goals' : ''}.</p>}
            {goals.length === 0 && <p className="vg-muted" style={{ fontSize: '0.88rem', margin: 0 }}>Instead of one savings number, give each rupee a job — Emergency Fund, Vacation, Car, Education. Each goal shows what it needs a month, and whether you’re on track.</p>}
            <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {goals.map(g => {
                const st = goalStatus(g, k)
                const mine = g.owner === owner || (!!viewer && g.owner === 'household' && !!me.entityId && viewer === me.entityId)
                return (
                  <div key={g.id} className="vg-kpi" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: `3px solid ${g.color ?? '#6d4bd8'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                      <b>{g.name}</b>
                      <span style={{ display: 'flex', gap: 4 }}>
                        {g.owner === 'household' && viewer && <span className="vg-chip">household</span>}
                        {canEdit && mine && <button className="vg-icobtn" style={{ width: 26, height: 26 }} onClick={() => setEdit(g)} aria-label={`Edit ${g.name}`}><Pencil className="h-3.5 w-3.5" /></button>}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: '1.3rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{INR(g.saved)}</span>
                      <span className="vg-muted" style={{ fontSize: '0.82rem' }}>of {INR(g.target)}</span>
                    </div>
                    <Bar pct={st.pct} color={g.color ?? undefined} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: '0.76rem' }} className="vg-muted">
                      <span>Required/month<br /><b style={{ color: 'var(--vg-ink)' }}>{st.required != null ? INR(st.required) : '—'}</b></span>
                      <span>Target date<br /><b style={{ color: 'var(--vg-ink)' }}>{g.targetDate ? monthLabel(g.targetDate) : '—'}</b></span>
                      <span>Planned/month<br /><b style={{ color: 'var(--vg-ink)' }}>{st.planned ? INR(st.planned) : '—'}</b></span>
                      <span>Progress<br /><b style={{ color: 'var(--vg-ink)' }}>{Math.round(st.pct)}%</b></span>
                    </div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: st.shortBy > 0.5 ? SCEN_C : st.done ? 'var(--vg-pos)' : 'var(--vg-ink-soft)' }}>
                      {st.shortBy > 0.5 && <TriangleAlert className="h-3.5 w-3.5" style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />}{st.message}
                    </div>
                    {canEdit && mine && !st.done && <button className="vg-btn" style={{ marginTop: 'auto', justifyContent: 'center' }} onClick={() => setContrib(g)}><Plus className="h-4 w-4" /> Add money</button>}
                  </div>
                )
              })}
            </div>
          </div>
          {viewer && canEdit && <SurplusCard doc={doc} viewer={viewer} run={run} busy={busy} />}
        </>
      )}

      {edit && (
        <GoalEditor goal={edit} allowHousehold={!!viewer && viewer === me.entityId} busy={busy} onClose={() => setEdit(null)}
          onRemove={edit.id ? async () => { if (await run({ action: 'removeGoal', id: edit.id }, 'Goal closed')) setEdit(null) } : undefined}
          onSave={async g => { if (await run({ action: 'saveGoal', goal: g, isNew: !g.id }, g.id ? 'Goal updated' : 'Goal created')) setEdit(null) }} />
      )}
      {contrib && (
        <ContributeModal goal={contrib} busy={busy} onClose={() => setContrib(null)}
          onSave={async (amount, note) => { if (await run({ action: 'contributeGoal', id: contrib.id, amount, note }, 'Saved')) setContrib(null) }} />
      )}
    </>
  )
}

function GoalEditor({ goal, onSave, onClose, onRemove, busy, allowHousehold }: { goal: Partial<Goal>; onSave: (g: Partial<Goal>) => void; onClose: () => void; onRemove?: () => void; busy: boolean; allowHousehold: boolean }) {
  const [d, setD] = useState<Partial<Goal>>({ ...goal })
  const [t, setT] = useState(goal.target ? String(goal.target) : '')
  const [s, setS] = useState(goal.saved ? String(goal.saved) : '')
  const [m, setM] = useState(goal.monthly ? String(goal.monthly) : '')
  const preview = goalStatus({ id: 'x', name: d.name || 'this goal', owner: '', target: num(t), saved: num(s), monthly: num(m), targetDate: d.targetDate ?? null })
  return (
    <Modal title={goal.id ? 'Edit goal' : 'New goal'} onClose={onClose}>
      <Field label="Name"><input className="vg-input" value={d.name ?? ''} onChange={e => setD({ ...d, name: e.target.value })} placeholder="e.g. Vacation" autoFocus /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
        <Field label="Kind"><select className="vg-select" value={d.kind ?? 'other'} onChange={e => setD({ ...d, kind: e.target.value as Goal['kind'] })}>{GOAL_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Target date"><input type="month" className="vg-input" value={d.targetDate ?? ''} onChange={e => setD({ ...d, targetDate: e.target.value || null })} /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem' }}>
        <Field label="Target"><input className="vg-input vg-num" inputMode="numeric" value={t} onChange={e => setT(e.target.value)} /></Field>
        <Field label="Already saved"><input className="vg-input vg-num" inputMode="numeric" value={s} disabled={!!goal.id} onChange={e => setS(e.target.value)} /></Field>
        <Field label="Plan / month"><input className="vg-input vg-num" inputMode="numeric" value={m} onChange={e => setM(e.target.value)} /></Field>
      </div>
      {!goal.id && allowHousehold && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: '0.7rem', fontSize: '0.86rem' }}>
          <input type="checkbox" checked={d.owner === 'household'} onChange={e => setD({ ...d, owner: e.target.checked ? 'household' : undefined })} style={{ accentColor: '#6d4bd8' }} />
          A shared household goal (everyone in the family can see it)
        </label>
      )}
      <Field label="Colour"><div style={{ display: 'flex', gap: 6 }}>{GOAL_COLORS.map(c => <button key={c} onClick={() => setD({ ...d, color: c })} aria-label={`Colour ${c}`} style={{ width: 24, height: 24, borderRadius: 999, background: c, border: d.color === c ? '3px solid #241b40' : '2px solid #fff', cursor: 'pointer' }} />)}</div></Field>
      {num(t) > 0 && <p style={{ fontSize: '0.84rem', margin: '0.8rem 0 0', fontWeight: 600 }}>{preview.message}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', gap: 8 }}>
        {onRemove ? <button className="vg-btn" style={{ color: 'var(--vg-neg)' }} onClick={onRemove}><Trash2 className="h-4 w-4" /> Close goal</button> : <span />}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="vg-btn" onClick={onClose}>Cancel</button>
          <button className="vg-btn vg-btn-primary" disabled={busy || !(d.name ?? '').trim() || !(num(t) > 0)} onClick={() => onSave({ ...d, target: num(t), saved: num(s), monthly: num(m) })}><Check className="h-4 w-4" /> Save</button>
        </div>
      </div>
    </Modal>
  )
}

function ContributeModal({ goal, onSave, onClose, busy }: { goal: Goal; onSave: (amount: number, note: string) => void; onClose: () => void; busy: boolean }) {
  const [v, setV] = useState(goal.monthly ? String(goal.monthly) : '')
  const [out, setOut] = useState(false)
  const [note, setNote] = useState('')
  return (
    <Modal title={`${goal.name} · ${out ? 'take out' : 'add money'}`} onClose={onClose} width={380}>
      <div className="vg-tabs"><button className="vg-tab" data-on={!out} onClick={() => setOut(false)}>Add</button><button className="vg-tab" data-on={out} onClick={() => setOut(true)}>Take out</button></div>
      <Field label="Amount"><input className="vg-input vg-num" inputMode="numeric" value={v} onChange={e => setV(e.target.value)} autoFocus /></Field>
      <Field label="Note (optional)"><input className="vg-input" value={note} onChange={e => setNote(e.target.value)} /></Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', gap: 8 }}>
        <button className="vg-btn" onClick={onClose}>Cancel</button>
        <button className="vg-btn vg-btn-primary" disabled={busy || !(num(v) > 0)} onClick={() => onSave(out ? -num(v) : num(v), note)}><Check className="h-4 w-4" /> Save</button>
      </div>
    </Modal>
  )
}

function SurplusCard({ doc, viewer, run, busy }: { doc: FinanceDoc; viewer: string; run: (p: Record<string, unknown>, ok?: string) => Promise<boolean>; busy: boolean }) {
  const [mk, setMk] = useState(addMonths(monthKey(), -1))
  const surplus = Math.floor(monthSurplus(doc, viewer, mk))
  const done = (doc.allocations ?? []).find(a => a.owner === viewer && a.month === mk && !a.undone)
  const [rules, setRules] = useState<AllocRule[] | null>(null)
  const active = rules ?? allocRulesFor(doc, viewer)
  const lines = proposeAllocation(doc, viewer, surplus, active)
  const goals = (doc.goals ?? []).filter(g => !g.archived && g.owner === viewer)
  const targets: [string, string][] = [...goals.map(g => [g.id, g.name] as [string, string]), ['invest', 'Investments'], ['carry', 'Carry forward']]
  const history = (doc.allocations ?? []).filter(a => a.owner === viewer && !a.undone).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 4)
  const pctTotal = active.reduce((a, r) => a + r.pct, 0)
  return (
    <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
      {cardHead('Month-end surplus', <input type="month" className="vg-input" style={{ width: 150 }} value={mk} max={monthKey()} onChange={e => setMk(e.target.value || mk)} aria-label="Month" />)}
      <div style={{ fontSize: '1.05rem' }}>
        {surplus > 0 ? <><b style={{ fontSize: '1.5rem' }} className="vg-pos">{INR(surplus)}</b> surplus available from {monthLabel(mk)}.</> : <span className="vg-muted">No surplus in {monthLabel(mk)} — income did not exceed your share of the costs.</span>}
      </div>
      {done ? (
        <div style={{ marginTop: '0.8rem' }}>
          <p style={{ fontSize: '0.88rem', margin: 0 }}><Check className="h-4 w-4" style={{ display: 'inline', color: 'var(--vg-pos)' }} /> Allocated on {new Date(done.at).toLocaleDateString('en-IN')}: {done.lines.map(l => `${l.label} ${INR(l.amount)}`).join(' · ')}</p>
          <button className="vg-btn" style={{ marginTop: 8 }} disabled={busy} onClick={() => run({ action: 'undoAllocation', id: done.id }, 'Allocation undone')}><Undo2 className="h-4 w-4" /> Undo</button>
        </div>
      ) : surplus > 0 && (
        <>
          <p className="vg-muted" style={{ fontSize: '0.8rem' }}>Proposed split — change the percentages, then approve. Goals are credited; investments go to an “Investments (from surplus)” pot; carry-forward simply stays in your account.</p>
          <div style={{ display: 'grid', gap: 6 }}>
            {active.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px 28px', gap: 8, alignItems: 'center' }}>
                <select className="vg-select" value={r.target} onChange={e => setRules(active.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))}>
                  {targets.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <input className="vg-input vg-num" inputMode="numeric" value={r.pct} onChange={e => setRules(active.map((x, j) => (j === i ? { ...x, pct: num(e.target.value) } : x)))} aria-label="Percent" />
                <b style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{INR(lines.find(l => l.target === r.target)?.amount ?? 0)}</b>
                <button className="vg-icobtn" style={{ width: 26, height: 26 }} onClick={() => setRules(active.filter((_, j) => j !== i))} aria-label="Remove line"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: '0.8rem', alignItems: 'center' }}>
            <button className="vg-btn" onClick={() => setRules([...active, { target: 'carry', pct: 0 }])}><Plus className="h-4 w-4" /> Line</button>
            <span className="vg-muted" style={{ fontSize: '0.78rem' }}>{pctTotal}% {pctTotal !== 100 && '(scaled to 100%)'}</span>
            <span style={{ flex: 1 }} />
            {rules && <button className="vg-btn" disabled={busy} onClick={async () => { if (await run({ action: 'setAllocRules', rules: active }, 'Saved as your default split')) setRules(null) }}>Save as default</button>}
            <button className="vg-btn vg-btn-primary" disabled={busy} onClick={() => run({ action: 'applyAllocation', month: mk, lines }, 'Surplus allocated')}><Check className="h-4 w-4" /> Approve allocation</button>
          </div>
        </>
      )}
      {history.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <p className="vg-lbl" style={{ marginBottom: 4 }}>Earlier allocations</p>
          {history.map(h => <div key={h.id} className="vg-muted" style={{ fontSize: '0.8rem' }}>{monthLabel(h.month)}: {h.lines.map(l => `${l.label} ${INR(l.amount)}`).join(' · ')}</div>)}
        </div>
      )}
    </div>
  )
}

function AllowancesPanel({ doc, me, run, busy }: { doc: FinanceDoc; me: { role: 'super' | 'member'; entityId: string | null }; run: (p: Record<string, unknown>, ok?: string) => Promise<boolean>; busy: boolean }) {
  const k = monthKey()
  const [edit, setEdit] = useState<Partial<Allowance> | null>(null)
  const list = doc.allowances ?? []
  const canManage = (a?: Allowance) => me.role === 'super' || (!!me.entityId && (!a || a.approvers.includes(me.entityId)))
  const persons = doc.entities.filter(e => e.kind === 'person')
  return (
    <>
      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        {cardHead('Allowances', canManage() ? <button className="vg-btn vg-btn-primary" onClick={() => setEdit({ monthly: 2000, threshold: 500, approvers: me.entityId ? [me.entityId] : [], startMonth: k, active: true })}><Baby className="h-4 w-4" /> New allowance</button> : undefined)}
        {list.length === 0 && <p className="vg-muted" style={{ margin: 0, fontSize: '0.88rem' }}>A monthly amount for a child or dependent. Their spending counts against it, what’s left rolls into their savings, and anything above a limit you set comes to a parent to approve first.</p>}
        <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {list.map(a => {
            const st = allowanceStatus(doc, a, k)
            const pct = a.monthly > 0 ? (st.spent / a.monthly) * 100 : 0
            return (
              <div key={a.id} className="vg-kpi" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b>{entName(doc.entities, a.entity)}’s Monthly Allowance</b>
                  {canManage(a) && <button className="vg-icobtn" style={{ width: 26, height: 26 }} onClick={() => setEdit(a)} aria-label="Edit allowance"><Pencil className="h-3.5 w-3.5" /></button>}
                </div>
                <div className="vg-muted" style={{ fontSize: '0.8rem' }}>{INR(a.monthly)}/month{a.threshold > 0 && ` · parent approves anything over ${INR(a.threshold)}`}{!a.active && ' · paused'}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span>{INR(st.spent)} spent</span>
                  <b className={st.remaining < 0 ? 'vg-neg' : 'vg-pos'}>{st.remaining < 0 ? `${INR(-st.remaining)} over` : `${INR(st.remaining)} remaining`}</b>
                </div>
                <Bar pct={pct} color={pct > 100 ? 'var(--vg-neg)' : undefined} />
                {st.byCategory.length > 0 && (
                  <div style={{ fontSize: '0.78rem' }}>
                    {st.byCategory.slice(0, 5).map(c => (
                      <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="vg-muted">{c.name}</span>
                        <span className={c.limit && c.spent > c.limit ? 'vg-neg' : undefined}>{INR(c.spent)}{c.limit ? ` / ${INR(c.limit)}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: '0.8rem' }}>Saved from allowance so far: <b>{INR(st.saved)}</b></div>
                {st.pendingApprovals > 0 && <div style={{ fontSize: '0.8rem', color: SCEN_C, fontWeight: 600 }}>{st.pendingApprovals} expense{st.pendingApprovals === 1 ? '' : 's'} waiting for a parent’s approval</div>}
                {(doc.goals ?? []).filter(g => g.owner === a.entity && !g.archived).map(g => (
                  <div key={g.id} style={{ fontSize: '0.78rem' }}><Target className="h-3 w-3" style={{ display: 'inline' }} /> {g.name}: {INR(g.saved)} / {INR(g.target)}</div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      {edit && (
        <Modal title={edit.id ? 'Edit allowance' : 'New allowance'} onClose={() => setEdit(null)}>
          <Field label="For"><select className="vg-select" value={edit.entity ?? ''} onChange={e => setEdit({ ...edit, entity: e.target.value })}>
            <option value="">Choose…</option>{persons.map(p => <option key={p.id} value={p.id}>{p.name}{p.role ? ` (${p.role})` : ''}</option>)}
          </select></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <Field label="Per month"><input className="vg-input vg-num" inputMode="numeric" value={edit.monthly ?? ''} onChange={e => setEdit({ ...edit, monthly: num(e.target.value) })} /></Field>
            <Field label="Approve anything over" hint="0 = never ask"><input className="vg-input vg-num" inputMode="numeric" value={edit.threshold ?? 0} onChange={e => setEdit({ ...edit, threshold: num(e.target.value) })} /></Field>
          </div>
          <Field label="Parents who approve">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {persons.filter(p => p.id !== edit.entity).map(p => (
                <label key={p.id} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: '0.86rem' }}>
                  <input type="checkbox" style={{ accentColor: '#6d4bd8' }} checked={(edit.approvers ?? []).includes(p.id)}
                    onChange={e => setEdit({ ...edit, approvers: e.target.checked ? [...(edit.approvers ?? []), p.id] : (edit.approvers ?? []).filter(x => x !== p.id) })} />{p.name}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Category limits (optional)">
            {doc.categories.slice(0, 8).map(c => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ flex: 1, fontSize: '0.84rem' }}>{c.name}</span>
                <input className="vg-input vg-num" style={{ width: 100 }} inputMode="numeric" value={edit.categoryLimits?.[c.name] ?? ''} placeholder="—"
                  onChange={e => setEdit({ ...edit, categoryLimits: { ...(edit.categoryLimits ?? {}), [c.name]: num(e.target.value) } })} />
              </div>
            ))}
          </Field>
          <Field label="Counting from"><input type="month" className="vg-input" value={edit.startMonth ?? k} onChange={e => setEdit({ ...edit, startMonth: e.target.value })} /></Field>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', gap: 8 }}>
            {edit.id ? <button className="vg-btn" style={{ color: 'var(--vg-neg)' }} onClick={async () => { if (await run({ action: 'removeAllowance', id: edit.id }, 'Allowance removed')) setEdit(null) }}><Trash2 className="h-4 w-4" /> Remove</button> : <span />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="vg-btn" onClick={() => setEdit(null)}>Cancel</button>
              <button className="vg-btn vg-btn-primary" disabled={busy || !edit.entity || !(Number(edit.monthly) > 0)} onClick={async () => { if (await run({ action: 'saveAllowance', allowance: edit }, 'Allowance saved')) setEdit(null) }}><Check className="h-4 w-4" /> Save</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ============================================================
// PLAN (timeline, afford, what-if, memory)
// ============================================================

export function PlanTab({ doc, viewer, action, perm = ALL }: { doc: FinanceDoc; viewer: string | null; action: Act; perm?: Perm }) {
  const [sub, setSub] = useState<'timeline' | 'afford' | 'whatif' | 'memory'>('timeline')
  const { run, flash } = useRunner(action)
  return (
    <>
      {flash}
      <Sub value={sub} onChange={setSub} options={[['timeline', 'Health timeline'], ['afford', 'Can I afford it?'], ['whatif', 'What if…'], ['memory', 'Financial memory']]} />
      {sub === 'timeline' && <TimelinePanel doc={doc} viewer={viewer} />}
      {sub === 'afford' && <AffordPanel doc={doc} viewer={viewer} />}
      {sub === 'whatif' && <WhatIfPanel doc={doc} viewer={viewer} />}
      {sub === 'memory' && <MemoryPanel doc={doc} viewer={viewer} canPlan={perm('savings', 'add')} onPlan={s => run({ action: 'saveGoal', goal: { name: s.name, target: s.target, targetDate: s.targetDate, kind: 'other', saved: 0 }, isNew: true }, `Goal “${s.name}” created — see Goals`)} />}
    </>
  )
}

const shortMonth = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return `${new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short' })} ’${String(y).slice(2)}`
}

/** A one-axis line chart of month-end cash, with a crosshair tooltip. */
function CashChart({ series, height = 220 }: { series: { name: string; color: string; values: { key: string; v: number }[]; dashed?: boolean }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  // Drawn at the width it actually has, so text stays 11px on a phone rather
  // than being scaled down with the whole picture.
  const [W, setW] = useState(720)
  const box = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const narrow = W < 520
  const H = narrow ? Math.round(height * 0.85) : height, L = 52, R = narrow ? 12 : 84, T = 14, B = 26
  const n = series[0]?.values.length ?? 0
  const all = series.flatMap(s => s.values.map(p => p.v))
  if (!n || !all.length) return null
  let lo = Math.min(0, ...all), hi = Math.max(0, ...all)
  if (hi - lo < 1) hi = lo + 1
  const pad = (hi - lo) * 0.08; if (lo < 0) lo -= pad; hi += pad
  const x = (i: number) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1))
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B)
  const ticks = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * i) / 3)
  const short = (v: number) => { const a = Math.abs(v); const s = a >= 1e7 ? `${(a / 1e7).toFixed(1)}Cr` : a >= 1e5 ? `${(a / 1e5).toFixed(1)}L` : a >= 1e3 ? `${Math.round(a / 1e3)}k` : `${Math.round(a)}`; return `${v < 0 ? '−' : ''}₹${s}` }
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1)))))
  }
  const hk = hover != null ? series[0].values[hover].key : null
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'pan-y' }} role="img"
        aria-label={`Month-end cash: ${series.map(s => `${s.name} ends at ${INR(s.values[n - 1].v)}`).join('; ')}`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="rgba(120,99,190,0.14)" strokeWidth={1} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#8b81ad">{short(t)}</text>
          </g>
        ))}
        {lo < 0 && <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#8b81ad" strokeWidth={1} />}
        {series[0].values.map((p, i) => (i % Math.ceil(n / Math.max(3, Math.floor((W - L - R) / 80))) === 0) && (
          <text key={p.key} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="#8b81ad">{shortMonth(p.key)}</text>
        ))}
        {series.map(s => (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined}
              points={s.values.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')} />
            {!narrow && <text x={x(n - 1) + 6} y={y(s.values[n - 1].v) + 4} fontSize={11} fill="#5b5080" fontWeight={600}>{s.name}</text>}
          </g>
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#5b5080" strokeWidth={1} strokeDasharray="3 3" />
            {series.map(s => <circle key={s.name} cx={x(hover)} cy={y(s.values[hover].v)} r={4.5} fill={s.color} stroke="#fff" strokeWidth={2} />)}
          </g>
        )}
      </svg>
      {hover != null && hk && (
        <div className="vg-pop" style={{ position: 'absolute', top: 4, left: `${Math.min(70, (x(hover) / W) * 100)}%`, right: 'auto', width: 'max-content', pointerEvents: 'none' }}>
          <b>{monthLabel(hk)}</b>
          {series.map(s => <div key={s.name} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ width: 10, height: 2, background: s.color, display: 'inline-block' }} />{s.name}: {signed(s.values[hover].v)}</div>)}
        </div>
      )}
      {series.length > 1 && (
        <div className="vg-legend">
          {series.map(s => <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}><span style={{ width: 16, height: 2, background: s.color, display: 'inline-block' }} />{s.name}</span>)}
        </div>
      )}
    </div>
  )
}

function TimelinePanel({ doc, viewer }: { doc: FinanceDoc; viewer: string | null }) {
  const t = useMemo(() => healthTimeline(doc, viewer), [doc, viewer])
  const rows: [string, (h: typeof t.rows[number]) => number, string?][] = [
    ['Expected income', h => h.income, 'pos'],
    ['Recurring expenses', h => -h.recurring],
    ['EMIs', h => -h.emi],
    ['Annual bills', h => -h.annual],
    ['Savings (goal contributions)', h => -h.goals],
    ['Expected surplus', h => h.surplus, 'bold'],
    ['Expected cash balance', h => h.cash, 'bold'],
  ]
  const values = t.months.reduce((acc, p) => [...acc, { key: p.key, v: acc[acc.length - 1].v + p.surplus }], [{ key: monthKey(), v: t.start }])
  const worst = t.rows[t.rows.length - 1].lowest
  return (
    <>
      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        {cardHead(viewer ? 'Your financial health timeline' : 'Common account timeline')}
        <div className="vg-tablewrap">
          <table className="vg-table" style={{ minWidth: 640 }}>
            <thead><tr><th></th>{t.rows.map(h => <th key={h.label} className="num">{h.label}</th>)}</tr></thead>
            <tbody>
              {rows.map(([label, f, cls]) => (
                <tr key={label} style={cls === 'bold' ? { background: 'rgba(109,75,216,0.05)' } : undefined}>
                  <td style={{ fontWeight: cls === 'bold' ? 700 : 500 }}>{label}</td>
                  {t.rows.map(h => {
                    const v = f(h)
                    const isToday = h.months === 0 && label !== 'Expected cash balance'
                    return <td key={h.label} className="num" style={{ fontWeight: cls === 'bold' ? 700 : 400, color: cls === 'bold' && v < 0 ? 'var(--vg-neg)' : undefined }}>{isToday ? <span className="vg-muted">—</span> : signed(v)}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="vg-muted" style={{ fontSize: '0.74rem', marginTop: '0.5rem' }}>
          Starts from money available today ({signed(t.start)}) after this month’s remaining bills. Built from recurring commitments, yearly bills, EMIs that end along the way, and your planned goal contributions. Goal buckets hold {INR(t.saved)} today{t.rows[4] ? ` → ${INR(t.rows[4].savings)} in a year` : ''}.
        </p>
      </div>
      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        {cardHead('Expected cash balance, month by month', worst < 0 ? <span className="vg-chip" style={{ background: 'rgba(226,68,92,0.12)', color: 'var(--vg-neg)' }}><TriangleAlert className="h-3 w-3" /> dips to {signed(worst)}</span> : undefined)}
        <CashChart series={[{ name: 'Cash', color: '#6d4bd8', values }]} />
      </div>
    </>
  )
}

function AffRow({ l, v, strong, neg }: { l: string; v: number; strong?: boolean; neg?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px dashed var(--vg-line)', fontWeight: strong ? 700 : 400 }}>
      <span style={{ color: strong ? undefined : 'var(--vg-ink-soft)' }}>{l}</span><span style={{ fontVariantNumeric: 'tabular-nums', color: neg && v < 0 ? 'var(--vg-neg)' : undefined }}>{signed(v)}</span>
    </div>
  )
}

function AffordPanel({ doc, viewer }: { doc: FinanceDoc; viewer: string | null }) {
  const [what, setWhat] = useState('TV')
  const [price, setPrice] = useState('35000')
  const [months, setMonths] = useState('12')
  const [rate, setRate] = useState('14')
  const [down, setDown] = useState('0')
  const r = useMemo(() => affordCheck(doc, viewer, num(price), { months: num(months), rate: num(rate), down: num(down) }), [doc, viewer, price, months, rate, down])
  const verdict = { yes: { t: 'Comfortable', c: 'var(--vg-pos)' }, tight: { t: 'Tight', c: SCEN_C }, no: { t: 'Not safely', c: 'var(--vg-neg)' } }
  return (
    <>
      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        {cardHead('“Can I afford it?”')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.6rem' }}>
          <Field label="What"><input className="vg-input" value={what} onChange={e => setWhat(e.target.value)} /></Field>
          <Field label="Price"><input className="vg-input vg-num" inputMode="numeric" value={price} onChange={e => setPrice(e.target.value)} /></Field>
          <Field label="EMI months"><input className="vg-input vg-num" inputMode="numeric" value={months} onChange={e => setMonths(e.target.value)} /></Field>
          <Field label="Rate % / year"><input className="vg-input vg-num" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} /></Field>
          <Field label="Down payment"><input className="vg-input vg-num" inputMode="numeric" value={down} onChange={e => setDown(e.target.value)} /></Field>
        </div>
      </div>
      {num(price) > 0 && (
        <div style={{ display: 'grid', gap: '1.1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', marginBottom: '1.1rem' }}>
          <div className="vg-card vg-pad">
            {cardHead(`Pay cash · ${what || 'purchase'} ${INR(r.price)}`, <span className="vg-chip" style={{ color: verdict[r.cash.verdict].c }}>{verdict[r.cash.verdict].t}</span>)}
            <AffRow l="Current balance" v={r.balance} />
            <AffRow l="Upcoming commitments" v={-r.upcoming} />
            {r.upcomingParts.map(p => <div key={p.label} className="vg-muted" style={{ fontSize: '0.74rem', paddingLeft: 10 }}>· {p.label}: {INR(p.amount)}</div>)}
            <AffRow l="Monthly savings target" v={-r.savingsTarget} />
            <AffRow l={`${what || 'Purchase'}`} v={-r.price} />
            <AffRow l="After purchase: safe balance" v={r.cash.safeAfter} strong neg />
            {r.price > 0 && <p style={{ fontSize: '0.84rem', margin: '0.7rem 0 0' }}><TriangleAlert className="h-3.5 w-3.5" style={{ display: 'inline', color: SCEN_C, verticalAlign: '-2px' }} /> This would reduce your projected month-end surplus by {INR(r.price)} — from {signed(r.cash.monthEndBefore)} to {signed(r.cash.monthEndAfter)}.</p>}
          </div>
          {r.emi && (
            <div className="vg-card vg-pad">
              {cardHead(`On EMI · ${r.emi.months} months at ${r.emi.rate}%`, <span className="vg-chip" style={{ color: verdict[r.emi.verdict].c }}>{verdict[r.emi.verdict].t}</span>)}
              <AffRow l="Down payment now" v={-r.emi.down} />
              <AffRow l="EMI each month" v={-r.emi.emi} strong />
              <AffRow l="Interest paid" v={-r.emi.interest} />
              <AffRow l="Total cost" v={-r.emi.total} />
              <AffRow l="Safe balance today" v={r.emi.safeAfter} neg />
              <AffRow l="Monthly surplus: before → after" v={r.emi.surplusAfter} neg />
              <p className="vg-muted" style={{ fontSize: '0.8rem', margin: '0.6rem 0 0' }}>
                Surplus goes from {signed(r.emi.surplusBefore)} to {signed(r.emi.surplusAfter)} a month for {r.emi.months} months. EMIs would take {Math.round(r.emi.emiLoadAfter)}% of income (from {Math.round(r.emi.emiLoadBefore)}%){r.emi.emiLoadAfter > 45 ? ' — above the ~45% most lenders treat as a stretch' : ''}.
              </p>
              <p style={{ fontSize: '0.84rem', margin: '0.6rem 0 0', fontWeight: 600 }}>
                Cash vs EMI: EMI keeps {INR(Math.max(0, r.cash.safeAfter < r.emi.safeAfter ? r.emi.safeAfter - r.cash.safeAfter : 0))} more in hand today and costs {INR(r.emi.interest)} extra overall.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  )
}

type Draft = ScenarioChange
const PRESET_WI: { label: string; make: (doc: FinanceDoc, viewer: string | null) => Draft }[] = [
  { label: 'Salary +₹20,000', make: () => ({ id: 'x', type: 'income', label: 'Salary increase', amount: 20000, from: 0, months: 0 }) },
  { label: 'Buy a ₹15 lakh car', make: () => ({ id: 'x', type: 'loan', label: 'Car loan', principal: 1500000, rate: 9, tenure: 60, down: 300000, at: 0 }) },
  { label: 'Prepay ₹3 lakh of a loan', make: (doc, v) => ({ id: 'x', type: 'prepay', label: 'Loan prepayment', loanId: loansFor(doc, v)[0]?.id ?? '', amount: 300000, at: 0 }) },
  { label: 'Rent +₹5,000', make: () => ({ id: 'x', type: 'expense', label: 'Rent increase', amount: 5000, from: 0, months: 0 }) },
  { label: 'Partner stops working 6 months', make: () => ({ id: 'x', type: 'income', label: 'Partner’s income paused', amount: -50000, from: 0, months: 6 }) },
  { label: 'One-time purchase', make: () => ({ id: 'x', type: 'purchase', label: 'Purchase', amount: 100000, at: 0 }) },
]

function WhatIfPanel({ doc, viewer }: { doc: FinanceDoc; viewer: string | null }) {
  const [changes, setChanges] = useState<Draft[]>([])
  const [span, setSpan] = useState(24)
  const res = useMemo(() => runScenario(doc, viewer, changes, span), [doc, viewer, changes, span])
  const loans = loansFor(doc, viewer)
  const upd = (id: string, patch: Partial<Draft>) => setChanges(cs => cs.map(c => (c.id === id ? ({ ...c, ...patch } as Draft) : c)))
  const offs = Array.from({ length: span }, (_, i) => [i, monthLabel(addMonths(monthKey(), i + 1))] as [number, string])
  const n = (v: number, f: (x: number) => void, w = 110) => <input className="vg-input vg-num" style={{ width: w }} inputMode="numeric" value={v} onChange={e => f(num(e.target.value))} />
  const when = (v: number, f: (x: number) => void) => <select className="vg-select" style={{ width: 150 }} value={v} onChange={e => f(Number(e.target.value))}>{offs.map(([i, l]) => <option key={i} value={i}>{l}</option>)}</select>
  return (
    <>
      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        {cardHead('What if…', <span className="vg-chip">nothing here changes your real data</span>)}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESET_WI.map(p => <button key={p.label} className="vg-btn" onClick={() => setChanges(cs => [...cs, { ...p.make(doc, viewer), id: `c${Date.now()}${cs.length}` }])}><Plus className="h-3.5 w-3.5" /> {p.label}</button>)}
        </div>
        {changes.length > 0 && (
          <div style={{ marginTop: '0.9rem', display: 'grid', gap: 8 }}>
            {changes.map(c => (
              <div key={c.id} className="vg-kpi" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '0.6rem 0.7rem' }}>
                <input className="vg-input" style={{ width: 170, fontWeight: 600 }} value={c.label ?? ''} onChange={e => upd(c.id, { label: e.target.value })} aria-label="Label" />
                {(c.type === 'income' || c.type === 'expense') && <>
                  <span className="vg-muted" style={{ fontSize: '0.8rem' }}>{c.type === 'income' ? 'income ±/month' : 'cost ±/month'}</span>{n(c.amount, v => upd(c.id, { amount: v }))}
                  <span className="vg-muted" style={{ fontSize: '0.8rem' }}>from</span>{when(c.from, v => upd(c.id, { from: v }))}
                  <span className="vg-muted" style={{ fontSize: '0.8rem' }}>for</span>{n(c.months, v => upd(c.id, { months: v }), 60)}<span className="vg-muted" style={{ fontSize: '0.8rem' }}>months (0 = ongoing)</span>
                </>}
                {c.type === 'purchase' && <><span className="vg-muted" style={{ fontSize: '0.8rem' }}>amount</span>{n(c.amount, v => upd(c.id, { amount: v }))}<span className="vg-muted" style={{ fontSize: '0.8rem' }}>in</span>{when(c.at, v => upd(c.id, { at: v }))}</>}
                {c.type === 'loan' && <>
                  <span className="vg-muted" style={{ fontSize: '0.8rem' }}>price</span>{n(c.principal, v => upd(c.id, { principal: v }))}
                  <span className="vg-muted" style={{ fontSize: '0.8rem' }}>down</span>{n(c.down, v => upd(c.id, { down: v }))}
                  <span className="vg-muted" style={{ fontSize: '0.8rem' }}>rate %</span>{n(c.rate, v => upd(c.id, { rate: v }), 60)}
                  <span className="vg-muted" style={{ fontSize: '0.8rem' }}>months</span>{n(c.tenure, v => upd(c.id, { tenure: v }), 60)}
                  <span className="vg-muted" style={{ fontSize: '0.8rem' }}>from</span>{when(c.at, v => upd(c.id, { at: v }))}
                </>}
                {c.type === 'prepay' && <>
                  <select className="vg-select" style={{ width: 170 }} value={c.loanId} onChange={e => upd(c.id, { loanId: e.target.value })}>
                    {loans.length === 0 && <option value="">No loan with amount + tenure recorded</option>}
                    {loans.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <span className="vg-muted" style={{ fontSize: '0.8rem' }}>amount</span>{n(c.amount, v => upd(c.id, { amount: v }))}
                  <span className="vg-muted" style={{ fontSize: '0.8rem' }}>in</span>{when(c.at, v => upd(c.id, { at: v }))}
                </>}
                <span style={{ flex: 1 }} />
                <button className="vg-icobtn" onClick={() => setChanges(cs => cs.filter(x => x.id !== c.id))} aria-label="Remove change"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        {cardHead('Current plan vs scenario — month-end cash', <div className="vg-subtabs">{[12, 24, 36].map(m => <button key={m} className="vg-subtab" data-on={span === m} onClick={() => setSpan(m)}>{m} months</button>)}</div>)}
        <div className="vg-kpis" style={{ marginBottom: '0.8rem' }}>
          <div className="vg-kpi"><div className="k">Current plan in {span} months</div><div className="v">{signed(res.baseEnd)}</div></div>
          <div className="vg-kpi"><div className="k">Scenario in {span} months</div><div className={`v ${res.scenEnd < 0 ? 'vg-neg' : ''}`}>{signed(res.scenEnd)}</div></div>
          <div className="vg-kpi"><div className="k">Difference</div><div className={`v ${res.scenEnd - res.baseEnd < 0 ? 'vg-neg' : 'vg-pos'}`}>{signed(res.scenEnd - res.baseEnd)}</div></div>
          {res.lowest && <div className="vg-kpi"><div className="k">Lowest point</div><div className={`v ${res.lowest.cash < 0 ? 'vg-neg' : ''}`} style={{ fontSize: '1rem' }}>{signed(res.lowest.cash)} · {monthLabel(res.lowest.key)}</div></div>}
        </div>
        {res.firstNegative && <p style={{ color: 'var(--vg-neg)', fontWeight: 600, fontSize: '0.88rem' }}><TriangleAlert className="h-4 w-4" style={{ display: 'inline', verticalAlign: '-3px' }} /> In this scenario cash runs out in {monthLabel(res.firstNegative)}.</p>}
        {res.notes.map((t, i) => <p key={i} className="vg-muted" style={{ fontSize: '0.82rem', margin: '0.2rem 0' }}>{t}</p>)}
        <CashChart series={[
          { name: 'Current plan', color: BASE_C, values: res.rows.map(r => ({ key: r.key, v: r.baseCash })) },
          { name: 'Scenario', color: SCEN_C, values: res.rows.map(r => ({ key: r.key, v: r.scenCash })), dashed: true },
        ]} />
        <details style={{ marginTop: '0.8rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Month by month</summary>
          <div className="vg-tablewrap" style={{ marginTop: 6 }}>
            <table className="vg-table" style={{ minWidth: 560 }}>
              <thead><tr><th>Month</th><th className="num">Plan: net</th><th className="num">Plan: cash</th><th className="num">Scenario: net</th><th className="num">Scenario: cash</th></tr></thead>
              <tbody>{res.rows.map(r => (
                <tr key={r.key}><td>{monthLabel(r.key)}</td><td className="num">{signed(r.baseNet)}</td><td className="num">{signed(r.baseCash)}</td>
                  <td className="num" style={{ color: Math.abs(r.scenNet - r.baseNet) > 0.5 ? SCEN_C : undefined }}>{signed(r.scenNet)}</td><td className="num" style={{ fontWeight: 600, color: r.scenCash < 0 ? 'var(--vg-neg)' : undefined }}>{signed(r.scenCash)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      </div>
    </>
  )
}

function MemoryPanel({ doc, viewer, onPlan, canPlan }: { doc: FinanceDoc; viewer: string | null; onPlan: (s: { name: string; target: number; targetDate: string }) => void; canPlan: boolean }) {
  const mem = useMemo(() => financialMemory(doc, viewer), [doc, viewer])
  const existing = new Set((doc.goals ?? []).filter(g => !g.archived).map(g => g.name.toLowerCase()))
  return (
    <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
      {cardHead('What the sheet remembers', <span className="vg-chip"><Sparkles className="h-3 w-3" /> {mem.length}</span>)}
      <p className="vg-muted" style={{ fontSize: '0.82rem', marginTop: 0 }}>Patterns from your history — festivals, yearly bills, seasonal peaks — pointed at what is coming, so next year is prepared for rather than discovered.</p>
      {mem.length === 0 && <p className="vg-muted" style={{ margin: 0 }}>Not enough history yet. Tag event spending (e.g. “Diwali 2026”) and it will be remembered next year.</p>}
      {mem.map(m => (
        <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '0.6rem 0', borderBottom: '1px dashed var(--vg-line)' }}>
          <Lightbulb className="h-4 w-4" style={{ color: m.soon ? SCEN_C : 'var(--vg-accent)', marginTop: 2, flex: '0 0 auto' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{m.text}</div>
            {m.when && <div className="vg-muted" style={{ fontSize: '0.78rem' }}>{m.soon ? 'Coming up' : 'Next'}: {monthLabel(m.when)}{m.suggest ? ` · put aside ${INR(m.suggest.target / Math.max(1, (Number(m.when.slice(0, 4)) - Number(monthKey().slice(0, 4))) * 12 + Number(m.when.slice(5)) - Number(monthKey().slice(5)) + 1))}/month from now` : ''}</div>}
          </div>
          {m.suggest && canPlan && (existing.has(m.suggest.name.toLowerCase())
            ? <span className="vg-chip"><Check className="h-3 w-3" /> planned</span>
            : <button className="vg-btn" style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }} onClick={() => onPlan(m.suggest!)}>Plan for it</button>)}
        </div>
      ))}
      <DetectedAnomalies doc={doc} viewer={viewer} />
    </div>
  )
}

function DetectedAnomalies({ doc, viewer }: { doc: FinanceDoc; viewer: string | null }) {
  const list = useMemo(() => detectAnomalies(doc, viewer), [doc, viewer])
  if (!list.length) return null
  return (
    <div style={{ marginTop: '1.2rem' }}>
      <p className="vg-lbl">This month, out of the ordinary</p>
      {list.map(a => (
        <div key={a.id} style={{ display: 'flex', gap: 8, padding: '0.35rem 0', fontSize: '0.86rem' }}>
          <TriangleAlert className="h-4 w-4" style={{ color: a.severity === 'high' ? 'var(--vg-neg)' : SCEN_C, flex: '0 0 auto', marginTop: 1 }} />
          <span><b>{a.text}</b>{a.detail && <span className="vg-muted"> {a.detail}</span>}</span>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// ACCESS (delegated finance management)
// ============================================================

export function AccessTab({ doc, me, action, onSwitch }: {
  doc: FinanceDoc; me: { role: 'super' | 'member'; entityId: string | null }; action: Act; onSwitch?: (owner: string) => void
}) {
  const { run, busy, flash } = useRunner(action)
  const my = me.entityId
  const list = doc.delegations ?? []
  const toDecide = list.filter(d => d.status === 'pending' && d.owner === my)
  const iGranted = list.filter(d => d.status === 'active' && d.owner === my)
  const iManage = list.filter(d => d.status === 'active' && d.grantee === my)
  const myPending = list.filter(d => d.status === 'pending' && d.grantee === my)
  const past = list.filter(d => !['pending', 'active'].includes(d.status)).sort((a, b) => (b.endedAt ?? b.decidedAt ?? b.requestedAt).localeCompare(a.endedAt ?? a.decidedAt ?? a.requestedAt)).slice(0, 8)
  const [req, setReq] = useState<{ owner: string; perms: AccessPerms; message: string; expiresOn: string } | null>(null)
  const [draft, setDraft] = useState<Record<string, AccessPerms>>({})
  const nm = (id: string) => entName(doc.entities, id)
  const others = doc.entities.filter(e => e.kind === 'person' && e.id !== my)
  const log = (doc.auditLog ?? []).filter(a => a.onBehalfOf).slice(-12).reverse()

  if (me.role === 'super') {
    const live = list.filter(d => d.status === 'active' || d.status === 'pending')
    return (
      <div className="vg-card vg-pad">
        {flash}
        {cardHead('Delegated access across the family')}
        <p className="vg-muted" style={{ fontSize: '0.84rem', marginTop: 0 }}>Members grant each other access themselves — you can’t grant it, and you can’t see what it shows. You can revoke any grant as a safety valve.</p>
        {live.length === 0 && <p className="vg-muted" style={{ margin: 0 }}>No one manages anyone else’s finances right now.</p>}
        {live.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.55rem 0', borderBottom: '1px dashed var(--vg-line)' }}>
            <span style={{ flex: 1 }}><b>{nm(d.grantee)}</b> → {nm(d.owner)}’s finance <span className="vg-chip">{d.status}</span></span>
            <button className="vg-btn" style={{ color: 'var(--vg-neg)' }} disabled={busy} onClick={() => run({ action: 'revokeAccess', id: d.id }, 'Access revoked')}>Revoke</button>
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      {flash}
      {toDecide.map(d => {
        const p = draft[d.id] ?? d.requested
        return (
          <div key={d.id} className="vg-card vg-pad" style={{ marginBottom: '1.1rem', border: '1px solid rgba(109,75,216,0.4)' }}>
            {cardHead('Access request')}
            <p style={{ fontSize: '1.02rem', fontWeight: 700, margin: '0 0 0.3rem' }}>{nm(d.grantee)} is requesting permission to manage your finances.</p>
            {d.message && <p className="vg-muted" style={{ margin: '0 0 0.5rem', fontStyle: 'italic' }}>“{d.message}”</p>}
            <p className="vg-lbl" style={{ marginBottom: 4 }}>Access requested:</p>
            <ul style={{ margin: '0 0 0.8rem', paddingLeft: '1.1rem', fontSize: '0.88rem' }}>{permLines(d.requested).map(l => <li key={l}>{l}</li>)}</ul>
            <p className="vg-muted" style={{ fontSize: '0.8rem' }}>Untick anything you don’t want to allow. They never see more than you tick, every action they take is logged as done on your behalf, and you can revoke it instantly.</p>
            <PermMatrix value={p} onChange={v => setDraft(x => ({ ...x, [d.id]: v }))} highlight={d.requested} />
            {d.expiresOn && <p className="vg-muted" style={{ fontSize: '0.8rem' }}>Asked until {d.expiresOn}.</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '0.9rem' }}>
              <button className="vg-btn" disabled={busy} onClick={() => run({ action: 'decideAccess', id: d.id, approve: false }, 'Declined')}>Decline</button>
              <button className="vg-btn vg-btn-primary" disabled={busy} onClick={() => run({ action: 'decideAccess', id: d.id, approve: true, perms: p }, `Approved — ${nm(d.grantee)} can now manage your finances`)}><Check className="h-4 w-4" /> Approve</button>
            </div>
          </div>
        )
      })}

      {iManage.length > 0 && (
        <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
          {cardHead('Finances you manage')}
          {iManage.map(d => (
            <div key={d.id} style={{ padding: '0.6rem 0', borderBottom: '1px dashed var(--vg-line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <b style={{ flex: 1 }}>{nm(d.owner)}’s Finance</b>
                {onSwitch && <button className="vg-btn vg-btn-primary" onClick={() => onSwitch(d.owner)}><Eye className="h-4 w-4" /> Manage</button>}
                <button className="vg-btn" disabled={busy} onClick={() => run({ action: 'revokeAccess', id: d.id }, 'You no longer manage their finances')}>Stop managing</button>
              </div>
              <div className="vg-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>{permLines(d.perms).join(' · ')}{d.expiresOn ? ` · until ${d.expiresOn}` : ''}</div>
            </div>
          ))}
        </div>
      )}

      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        {cardHead('Who can manage your finances', <ShieldCheck className="h-4 w-4" style={{ color: 'var(--vg-accent)' }} />)}
        {iGranted.length === 0 && <p className="vg-muted" style={{ margin: 0, fontSize: '0.88rem' }}>Nobody. When someone asks, the request appears here for you to approve or decline.</p>}
        {iGranted.map(d => {
          const p = draft[d.id] ?? d.perms
          const dirty = JSON.stringify(p) !== JSON.stringify(d.perms)
          return (
            <div key={d.id} style={{ padding: '0.6rem 0', borderBottom: '1px dashed var(--vg-line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <b style={{ flex: 1 }}>{nm(d.grantee)} <span className="vg-muted" style={{ fontWeight: 400, fontSize: '0.8rem' }}>since {new Date(d.decidedAt ?? d.requestedAt).toLocaleDateString('en-IN')}</span></b>
                {dirty && <button className="vg-btn vg-btn-primary" disabled={busy} onClick={async () => { if (await run({ action: 'updateAccess', id: d.id, perms: p }, 'Permissions updated')) setDraft(x => { const n = { ...x }; delete n[d.id]; return n }) }}><Check className="h-4 w-4" /> Save</button>}
                <button className="vg-btn" style={{ color: 'var(--vg-neg)' }} disabled={busy} onClick={() => run({ action: 'revokeAccess', id: d.id }, `Revoked — ${nm(d.grantee)} lost access immediately`)}>Revoke access</button>
              </div>
              <PermMatrix value={p} onChange={v => setDraft(x => ({ ...x, [d.id]: v }))} />
            </div>
          )
        })}
      </div>

      <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
        {cardHead('Ask to manage someone’s finances', !req ? <button className="vg-btn" onClick={() => setReq({ owner: others[0]?.id ?? '', perms: PRESETS[0].perms, message: '', expiresOn: '' })}><Plus className="h-4 w-4" /> New request</button> : undefined)}
        {myPending.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.45rem 0' }}>
            <span style={{ flex: 1, fontSize: '0.88rem' }}>Waiting for <b>{nm(d.owner)}</b> to approve · asked {new Date(d.requestedAt).toLocaleDateString('en-IN')}</span>
            <button className="vg-btn" disabled={busy} onClick={() => run({ action: 'revokeAccess', id: d.id }, 'Request cancelled')}>Cancel</button>
          </div>
        ))}
        {!req && myPending.length === 0 && <p className="vg-muted" style={{ margin: 0, fontSize: '0.86rem' }}>Helpful when one person handles the day-to-day for someone else. They choose exactly what you may do, and can take it back at any time.</p>}
        {req && (
          <>
            <Field label="Whose finances"><select className="vg-select" value={req.owner} onChange={e => setReq({ ...req, owner: e.target.value })}>{others.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Start from">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{PRESETS.map(p => <button key={p.label} className="vg-btn" data-on={JSON.stringify(req.perms) === JSON.stringify(p.perms)} onClick={() => setReq({ ...req, perms: p.perms })}>{p.label}</button>)}</div>
            </Field>
            <div style={{ marginTop: '0.6rem' }}><PermMatrix value={req.perms} onChange={v => setReq({ ...req, perms: v })} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.6rem' }}>
              <Field label="Note to them (optional)"><input className="vg-input" value={req.message} onChange={e => setReq({ ...req, message: e.target.value })} placeholder="e.g. So I can add groceries and receipts while you travel" /></Field>
              <Field label="Until (optional)"><input type="date" className="vg-input" value={req.expiresOn} onChange={e => setReq({ ...req, expiresOn: e.target.value })} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '0.9rem' }}>
              <button className="vg-btn" onClick={() => setReq(null)}>Cancel</button>
              <button className="vg-btn vg-btn-primary" disabled={busy || !req.owner} onClick={async () => { if (await run({ action: 'requestAccess', ...req }, `Request sent to ${nm(req.owner)}`)) setReq(null) }}><Check className="h-4 w-4" /> Send request</button>
            </div>
          </>
        )}
      </div>

      {log.length > 0 && (
        <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem' }}>
          {cardHead('Done on someone’s behalf')}
          {log.map(a => (
            <div key={a.id} style={{ fontSize: '0.84rem', padding: '0.3rem 0', borderBottom: '1px dashed var(--vg-line)' }}>
              <b>{a.actorName}</b> {a.what.replace(/^(\w+) · /, (_, v: string) => `${v.toLowerCase() === 'add' ? 'added' : v.toLowerCase() === 'change' ? 'changed' : v.toLowerCase() === 'remove' ? 'removed' : v.toLowerCase()} · `)} <span className="vg-muted">on behalf of {a.onBehalfName} · {new Date(a.ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="vg-card vg-pad">
          {cardHead('History')}
          {past.map(d => <div key={d.id} className="vg-muted" style={{ fontSize: '0.8rem' }}>{nm(d.grantee)} → {nm(d.owner)} · {d.status}{d.endedBy ? ` by ${d.endedBy}` : ''} · {new Date(d.endedAt ?? d.decidedAt ?? d.requestedAt).toLocaleDateString('en-IN')}</div>)}
        </div>
      )}
    </>
  )
}

/** A helper for the dashboards: the grant-aware permission check. */
export function permFrom(acting: ActingInfo | null | undefined): Perm {
  if (!acting) return ALL
  return (area, op) => can(acting.perms, area, op)
}

