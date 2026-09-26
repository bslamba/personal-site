'use client'

// ============================================================
// components/vault/finance-access.tsx
//
// Delegated access — one family member managing another's finances.
//
//   · AccessTab       ask for access, approve / decline it, change what
//                     is allowed, revoke it, and see what was done
//   · ProfileSwitcher the "My Finance | Mehak’s Finance" toggle
//   · ActingBanner    the "Managing: … / Logged in as …" strip shown while
//                     acting as someone else
//
// The browser only ever asks; every rule is enforced on the server (see
// app/api/vault/finance/route.ts and action/route.ts).
// ============================================================

import { useRef, useState } from 'react'
import { Plus, Check, X, TriangleAlert, ShieldCheck, Eye, LogOut } from 'lucide-react'
import {
  type FinanceDoc, type AccessPerms, type AccessArea, type AccessOp, type Item, type Entity,
  ACCESS_AREAS, ACCESS_OPS, ACCESS_LABEL, FULL_ACCESS, INR, entName, entColor, shares, can,
} from '@/lib/finance-data'

// ---------- shared bits -----------------------------------------

export type Act = (payload: Record<string, unknown>) => Promise<{ ok?: boolean; error?: string } | null>
export interface ActingInfo { grantId: string; owner: string; ownerName: string; grantee: string; granteeName: string; perms: AccessPerms }
type Perm = (area: AccessArea, op: AccessOp) => boolean
const ALL: Perm = () => true
const WARN = '#c2410c'


/** Runs an action and confirms success. Failures are shown once, by the
 *  dashboard's own error toast, so they are never silent and never doubled. */
function useRunner(action: Act) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const run = async (payload: Record<string, unknown>, okText?: string) => {
    setBusy(true)
    const d = await action(payload)
    setBusy(false)
    const ok = !!d && !d.error
    const text = ok ? okText : undefined
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

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginTop: '0.6rem' }}>
      <label className="vg-lbl">{label}</label>
      {children}
      {hint && <p className="vg-muted" style={{ fontSize: '0.74rem', margin: '0.25rem 0 0' }}>{hint}</p>}
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

/** The one place an action's failure is shown — for every tab, old and new. */
export function ErrorToast({ text, onClose }: { text: string | null; onClose: () => void }) {
  if (!text) return null
  return (
    <div role="alert" className="vg-card" style={{ position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 71, padding: '0.6rem 0.5rem 0.6rem 0.9rem', background: '#4a1420', color: '#fff', fontSize: '0.86rem', maxWidth: 'min(540px, 92vw)', display: 'flex', gap: 10, alignItems: 'center', boxShadow: '0 16px 40px -14px rgba(0,0,0,0.5)' }}>
      <TriangleAlert className="h-4 w-4" style={{ flex: '0 0 auto' }} />
      <span style={{ flex: 1 }}>{text}</span>
      <button onClick={onClose} aria-label="Dismiss" style={{ background: 'transparent', border: 0, color: '#fff', cursor: 'pointer', padding: 4 }}><X className="h-4 w-4" /></button>
    </div>
  )
}

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
  const full = ACCESS_AREAS.every(a => ACCESS_OPS.every(o => (acting.perms[a] ?? []).includes(o)))
  return (
    <div className="vg-card" style={{ padding: '0.75rem 1rem', marginBottom: '1rem', background: 'linear-gradient(90deg, rgba(194,65,12,0.12), rgba(109,75,216,0.10))', border: '1px solid rgba(194,65,12,0.35)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <ShieldCheck className="h-5 w-5" style={{ color: WARN, flex: '0 0 auto' }} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontWeight: 800, fontSize: '0.98rem' }}>Managing: {acting.ownerName}’s Finance</div>
        <div className="vg-muted" style={{ fontSize: '0.8rem' }}>
          Logged in as {acting.granteeName} · everything you do here is recorded as done by you on {acting.ownerName}’s behalf · {full ? 'full access' : `allowed: ${granted.map(a => ACCESS_LABEL[a]).join(', ') || 'nothing'}`}
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
  { label: 'Full access — act as them', perms: FULL_ACCESS },
  { label: 'Day-to-day helper', perms: { expenses: ['view', 'add', 'edit'], accounts: ['view'], budgets: ['view', 'add', 'edit'], documents: ['view', 'add'], savings: ['view', 'add', 'edit'] } },
  { label: 'View only', perms: Object.fromEntries(ACCESS_AREAS.map(a => [a, ['view']])) as AccessPerms },
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
  const today = new Date().toISOString().slice(0, 10)
  const expired = (d: { expiresOn?: string | null }) => !!d.expiresOn && d.expiresOn < today
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
                <b style={{ flex: 1 }}>{nm(d.owner)}’s Finance{expired(d) && <span className="vg-chip" style={{ marginLeft: 6 }}>expired</span>}</b>
                {onSwitch && !expired(d) && <button className="vg-btn vg-btn-primary" onClick={() => onSwitch(d.owner)}><Eye className="h-4 w-4" /> Manage</button>}
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
                <b style={{ flex: 1 }}>{nm(d.grantee)}{expired(d) && <span className="vg-chip" style={{ marginLeft: 6 }}>expired {d.expiresOn}</span>} <span className="vg-muted" style={{ fontWeight: 400, fontSize: '0.8rem' }}>since {new Date(d.decidedAt ?? d.requestedAt).toLocaleDateString('en-IN')}</span></b>
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

