'use client'

// ============================================================
// components/vault/finance-profile.tsx
//
// My Profile, laid out like Apple's account settings: an identity card on
// the left, grouped settings on the right.
//   · a photo you crop yourself — drag, zoom, turn — to exactly what shows
//     in the circle
//   · name and personal details, contact, an emergency contact
//   · payments: your UPI id, with a QR code anyone can scan to pay you
//   · family: how each person is related to you, and who can manage whose
//     finances (linked through Access)
//   · email alerts, and security
// Details are saved on your login (/api/vault/profile) and are yours only;
// the UPI id and alerts live in the finance sheet (action API).
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import {
  Camera, Check, X, Loader2, RotateCw, ZoomIn, ZoomOut, Trash2, Copy, KeyRound, BellRing, IndianRupee,
  User, Phone, HeartPulse, Users, ShieldCheck, ChevronRight, QrCode,
} from 'lucide-react'
import { type FinanceDoc, entName, entColor, upiLink, isUpiId } from '@/lib/finance-data'

type Act = (payload: Record<string, unknown>) => Promise<{ ok?: boolean; error?: string } | null | void> | void
export interface ProfileMe { role: 'super' | 'member'; username?: string; firstName?: string; lastName?: string; name?: string; email?: string; avatar?: string }
interface Details {
  nickname?: string; phone?: string; dob?: string; bloodGroup?: string; city?: string; occupation?: string; employer?: string; bio?: string
  emergencyName?: string; emergencyRelation?: string; emergencyPhone?: string; relations?: Record<string, string>
}

const BLOOD = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−']
const RELATIONS = ['Spouse', 'Wife', 'Husband', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Father-in-law', 'Mother-in-law', 'Son-in-law', 'Daughter-in-law', 'Grandfather', 'Grandmother', 'Grandson', 'Granddaughter', 'Uncle', 'Aunt', 'Cousin', 'Other']

// ---------- the photo cropper -----------------------------------
/** Drag to move, zoom and turn the picture until the circle shows exactly
 *  what you want; the result is a 512 × 512 JPEG. */
function Cropper({ src, onDone, onClose }: { src: string; onDone: (dataUrl: string) => void; onClose: () => void }) {
  const V = 300                                   // the viewport, in CSS pixels
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [rot, setRot] = useState(0)               // quarter turns
  const [off, setOff] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  useEffect(() => { const i = new Image(); i.onload = () => setImg(i); i.src = src }, [src])

  // Size of the (turned) picture at this zoom, and how far it may move so
  // the circle is never left with an empty edge.
  const geom = useMemo(() => {
    if (!img) return null
    const turned = rot % 2 === 1
    const w = turned ? img.height : img.width, h = turned ? img.width : img.height
    const scale = Math.max(V / w, V / h) * zoom
    return { scale, maxX: Math.max(0, (w * scale - V) / 2), maxY: Math.max(0, (h * scale - V) / 2) }
  }, [img, zoom, rot])
  const clamp = (o: { x: number; y: number }) => geom ? { x: Math.max(-geom.maxX, Math.min(geom.maxX, o.x)), y: Math.max(-geom.maxY, Math.min(geom.maxY, o.y)) } : o
  const at = clamp(off)

  const draw = (c: HTMLCanvasElement, size: number, mask: boolean) => {
    if (!img || !geom) return
    const k = size / V
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, size, size)
    ctx.save()
    ctx.translate(size / 2 + at.x * k, size / 2 + at.y * k)
    ctx.rotate((rot * Math.PI) / 2)
    ctx.drawImage(img, (-img.width * geom.scale * k) / 2, (-img.height * geom.scale * k) / 2, img.width * geom.scale * k, img.height * geom.scale * k)
    ctx.restore()
    if (mask) {
      // Dim everything outside the circle, and ring it.
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2, true); ctx.fill('evenodd')
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
  }
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = V * dpr; c.height = V * dpr
    draw(c, V * dpr, true)
  })

  const done = () => {
    const out = document.createElement('canvas'); out.width = 512; out.height = 512
    draw(out, 512, false)
    onDone(out.toDataURL('image/jpeg', 0.86))
  }

  return (
    <div className="vg-lb" onClick={onClose}>
      <div className="vg-card vg-pad" onClick={e => e.stopPropagation()} style={{ width: 'min(380px, 96vw)', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
          <p className="vg-sec" style={{ margin: 0 }}>Move and scale</p>
          <button className="vg-icobtn" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <canvas ref={canvas} className="vg-crop" style={{ width: V, height: V, maxWidth: '100%' }}
          onPointerDown={e => { try { (e.target as HTMLElement).setPointerCapture(e.pointerId) } catch { /* keep dragging without capture */ } drag.current = { x: e.clientX, y: e.clientY, ox: at.x, oy: at.y } }}
          onPointerMove={e => { if (drag.current) setOff(clamp({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y })) }}
          onPointerUp={() => { drag.current = null }}
          onWheel={e => setZoom(z => Math.max(1, Math.min(4, z * (e.deltaY < 0 ? 1.06 : 0.94))))}
          aria-label="Drag to position your photo" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0.9rem 0.3rem 0' }}>
          <ZoomOut className="h-4 w-4" style={{ color: 'var(--vg-ink-faint)' }} />
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} aria-label="Zoom" style={{ flex: 1, accentColor: 'var(--vg-accent)' }} />
          <ZoomIn className="h-4 w-4" style={{ color: 'var(--vg-ink-faint)' }} />
          <button className="vg-icobtn" onClick={() => { setRot(r => (r + 1) % 4); setOff({ x: 0, y: 0 }) }} aria-label="Turn a quarter" title="Turn"><RotateCw className="h-4 w-4" /></button>
        </div>
        <p className="vg-muted" style={{ fontSize: '0.78rem', margin: '0.5rem 0 0' }}>Drag to move · scroll or slide to zoom</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1rem' }}>
          <button className="vg-btn" onClick={onClose}>Cancel</button>
          <button className="vg-btn vg-btn-primary" onClick={done} disabled={!img}><Check className="h-4 w-4" /> Use photo</button>
        </div>
      </div>
    </div>
  )
}

// ---------- pieces -------------------------------------------------
function Group({ icon, title, children, foot }: { icon: React.ReactNode; title: string; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <section className="vg-group">
      <h3>{icon}{title}</h3>
      <div className="vg-group-body">{children}</div>
      {foot && <p className="vg-group-foot">{foot}</p>}
    </section>
  )
}
function Row({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="vg-row">
      <label htmlFor={htmlFor}>{label}</label>
      <div className="vg-row-v">{children}</div>
    </div>
  )
}

function PayQr({ link, name }: { link: string; name: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let live = true
    QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } })
      .then(s => { if (live) setSvg(s) }).catch(() => undefined)
    return () => { live = false }
  }, [link])
  return (
    <div className="vg-qr">
      <div className="vg-qr-code" dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label={`QR code to pay ${name} by UPI`} />
      <p>Scan with any UPI app to pay <b>{name}</b></p>
    </div>
  )
}

// ---------- the page -------------------------------------------------
export function ProfilePage({ me, onSaved, doc, entityId, action, onGo, passwordModal }: {
  me?: ProfileMe
  onSaved: (patch: Partial<ProfileMe>) => void
  doc?: FinanceDoc
  entityId?: string | null            // set for a member on their own profile
  action?: Act
  onGo?: (tab: string) => void
  passwordModal: (close: () => void) => React.ReactNode
}) {
  const entity = entityId && doc ? doc.entities.find(e => e.id === entityId) : undefined
  const [loaded, setLoaded] = useState(false)
  const [base, setBase] = useState({ firstName: me?.firstName ?? '', lastName: me?.lastName ?? '', email: me?.email ?? '', avatar: me?.avatar ?? '', upi: entity?.upi ?? '', details: {} as Details })
  const [form, setForm] = useState(base)
  const [crop, setCrop] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [showPw, setShowPw] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [now] = useState(() => Date.now())          // for the age shown on the card

  useEffect(() => {
    let live = true
    fetch('/api/vault/profile').then(r => r.json()).then(d => {
      if (!live || !d?.user) return
      const b = { firstName: d.user.firstName ?? '', lastName: d.user.lastName ?? '', email: d.user.email ?? '', avatar: d.user.avatar ?? '', upi: entity?.upi ?? '', details: (d.details ?? {}) as Details }
      setBase(b); setForm(b); setLoaded(true)
    }).catch(() => { if (live) setLoaded(true) })
    return () => { live = false }
    // Loaded once for this person.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dirty = JSON.stringify(form) !== JSON.stringify(base)
  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }))
  const setD = (patch: Partial<Details>) => setForm(f => ({ ...f, details: { ...f.details, ...patch } }))
  const full = [form.firstName, form.lastName].filter(Boolean).join(' ') || me?.name || me?.username || 'You'
  const initials = full.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const upiOk = !form.upi || isUpiId(form.upi)
  const emailOk = !form.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
  const payLink = entity && isUpiId(form.upi) ? upiLink({ ...entity, upi: form.upi }, 0, 'Lamba family')?.replace('&am=0.00', '') ?? null : null
  const age = form.details.dob ? Math.floor((now - new Date(`${form.details.dob}T00:00:00`).getTime()) / (365.25 * 86400000)) : null
  const others = doc?.entities.filter(e => e.kind === 'person' && e.id !== entityId) ?? []
  const grants = doc?.delegations ?? []

  function pick(f?: File) {
    if (!f) return
    if (!f.type.startsWith('image/')) { setNote({ ok: false, text: 'Pick an image file.' }); return }
    const r = new FileReader()
    r.onload = () => setCrop(String(r.result))
    r.readAsDataURL(f)
  }

  async function save() {
    if (!emailOk) { setNote({ ok: false, text: 'Enter a valid email address.' }); return }
    if (!upiOk) { setNote({ ok: false, text: 'A UPI id looks like name@bank.' }); return }
    setBusy(true); setNote(null)
    try {
      const r = await fetch('/api/vault/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: form.firstName, lastName: form.lastName, email: form.email, avatar: form.avatar, details: form.details }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setNote({ ok: false, text: d.error ?? 'Could not save your profile.' }); return }
      if (entity && action && form.upi.trim() !== (base.upi ?? '')) await action({ action: 'setUpi', upi: form.upi.trim() })
      const saved = { ...form, details: (d.details ?? form.details) as Details }
      setBase(saved); setForm(saved)
      onSaved({ firstName: form.firstName, lastName: form.lastName, email: form.email, avatar: form.avatar || undefined, name: [form.firstName, form.lastName].filter(Boolean).join(' ') })
      setNote({ ok: true, text: 'Saved.' })
      setTimeout(() => setNote(null), 2200)
    } catch { setNote({ ok: false, text: 'Could not reach the server.' }) } finally { setBusy(false) }
  }

  const txt = (v: string | undefined, on: (s: string) => void, ph = '', type = 'text', id?: string) =>
    <input id={id} className="vg-input vg-row-input" type={type} value={v ?? ''} placeholder={ph} onChange={e => on(e.target.value)} />

  return (
    <div className="vg-profile">
      {/* ---- identity ---- */}
      <aside className="vg-id-card vg-card">
        <div className="vg-id-photo">
          <button className="vg-id-avatar" onClick={() => fileRef.current?.click()} aria-label="Change your photo">
            {/* eslint-disable-next-line @next/next/no-img-element -- a small data-URL avatar */}
            {form.avatar ? <img src={form.avatar} alt="" /> : <span>{initials}</span>}
            <span className="vg-id-cam"><Camera className="h-4 w-4" /></span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
        </div>
        <h2>{full}</h2>
        {form.details.nickname && <p className="vg-id-nick">“{form.details.nickname}”</p>}
        <p className="vg-id-sub">@{me?.username}{entity?.role ? ` · ${entity.role}` : ''}</p>
        <div className="vg-id-chips">
          <span className="vg-chip">{me?.role === 'super' ? 'Family admin' : 'Family member'}</span>
          {entity?.earning && <span className="vg-chip">Earning</span>}
          {form.details.bloodGroup && <span className="vg-chip" style={{ background: 'color-mix(in srgb, var(--vg-neg) 12%, transparent)', color: 'var(--vg-neg)' }}>{form.details.bloodGroup}</span>}
        </div>
        <div className="vg-id-actions">
          <button className="vg-btn" onClick={() => fileRef.current?.click()}><Camera className="h-4 w-4" /> {form.avatar ? 'New photo' : 'Add photo'}</button>
          {form.avatar && <button className="vg-btn" onClick={() => setCrop(form.avatar)}>Adjust</button>}
          {form.avatar && <button className="vg-icobtn" onClick={() => set({ avatar: '' })} aria-label="Remove photo" title="Remove photo"><Trash2 className="h-4 w-4" /></button>}
        </div>
        <dl className="vg-id-facts">
          {form.email && <><dt>Email</dt><dd>{form.email}</dd></>}
          {form.details.phone && <><dt>Phone</dt><dd>{form.details.phone}</dd></>}
          {form.details.city && <><dt>City</dt><dd>{form.details.city}</dd></>}
          {age != null && age >= 0 && <><dt>Age</dt><dd>{age}</dd></>}
          {entity?.upi && <><dt>UPI</dt><dd>{entity.upi}</dd></>}
        </dl>
        {form.details.bio && <p className="vg-id-bio">{form.details.bio}</p>}
      </aside>

      {/* ---- settings ---- */}
      <div className="vg-settings">
        {!loaded && <p className="vg-muted" style={{ fontSize: '0.85rem' }}><Loader2 className="h-4 w-4 vg-spin" style={{ display: 'inline', verticalAlign: '-3px' }} /> Loading your details…</p>}

        <Group icon={<User className="h-4 w-4" />} title="Name & details">
          <Row label="First name" htmlFor="pf-fn">{txt(form.firstName, v => set({ firstName: v }), '', 'text', 'pf-fn')}</Row>
          <Row label="Last name" htmlFor="pf-ln">{txt(form.lastName, v => set({ lastName: v }), '', 'text', 'pf-ln')}</Row>
          <Row label="Nickname" htmlFor="pf-nick">{txt(form.details.nickname, v => setD({ nickname: v }), 'What the family calls you', 'text', 'pf-nick')}</Row>
          <Row label="Date of birth" htmlFor="pf-dob">{txt(form.details.dob, v => setD({ dob: v }), '', 'date', 'pf-dob')}</Row>
          <Row label="Blood group" htmlFor="pf-bg">
            <select id="pf-bg" className="vg-select vg-row-input" value={form.details.bloodGroup ?? ''} onChange={e => setD({ bloodGroup: e.target.value })}>
              <option value="">—</option>{BLOOD.map(b => <option key={b}>{b}</option>)}
            </select>
          </Row>
          <Row label="City" htmlFor="pf-city">{txt(form.details.city, v => setD({ city: v }), 'Bangalore', 'text', 'pf-city')}</Row>
          <Row label="Occupation" htmlFor="pf-occ">{txt(form.details.occupation, v => setD({ occupation: v }), 'What you do', 'text', 'pf-occ')}</Row>
          <Row label="Employer" htmlFor="pf-emp">{txt(form.details.employer, v => setD({ employer: v }), 'Where you work', 'text', 'pf-emp')}</Row>
          <Row label="About" htmlFor="pf-bio"><textarea id="pf-bio" className="vg-input vg-row-input" rows={2} value={form.details.bio ?? ''} onChange={e => setD({ bio: e.target.value })} placeholder="A line about you" style={{ resize: 'vertical' }} /></Row>
        </Group>

        <Group icon={<Phone className="h-4 w-4" />} title="Contact" foot="Your email is where password-reset codes are sent.">
          <Row label="Email" htmlFor="pf-em">
            {txt(form.email, v => set({ email: v }), 'name@email.com', 'email', 'pf-em')}
            {!emailOk && <span className="vg-row-err">Not a valid email</span>}
          </Row>
          <Row label="Phone" htmlFor="pf-ph">{txt(form.details.phone, v => setD({ phone: v }), '+91 …', 'tel', 'pf-ph')}</Row>
        </Group>

        {entity && (
          <Group icon={<IndianRupee className="h-4 w-4" />} title="Payments" foot="Anyone who owes you in a settlement gets a Pay button that opens their UPI app with your id and the amount filled in.">
            <Row label="UPI id" htmlFor="pf-upi">
              {txt(form.upi, v => set({ upi: v }), 'name@bank', 'text', 'pf-upi')}
              {form.upi && (upiOk ? <span className="vg-row-ok"><Check className="h-3.5 w-3.5" /> Looks right</span> : <span className="vg-row-err">A UPI id looks like name@bank</span>)}
            </Row>
            {payLink && (
              <div className="vg-row vg-row-actions">
                <button className="vg-btn" onClick={() => setShowQr(s => !s)}><QrCode className="h-4 w-4" /> {showQr ? 'Hide' : 'Show'} my pay QR</button>
                <button className="vg-btn" onClick={() => { void navigator.clipboard?.writeText(form.upi.trim()); setNote({ ok: true, text: 'UPI id copied.' }); setTimeout(() => setNote(null), 1800) }}><Copy className="h-4 w-4" /> Copy UPI id</button>
              </div>
            )}
            {payLink && showQr && <PayQr link={payLink} name={full} />}
          </Group>
        )}

        <Group icon={<HeartPulse className="h-4 w-4" />} title="Emergency contact">
          <Row label="Name" htmlFor="pf-ecn">{txt(form.details.emergencyName, v => setD({ emergencyName: v }), '', 'text', 'pf-ecn')}</Row>
          <Row label="Relation" htmlFor="pf-ecr">{txt(form.details.emergencyRelation, v => setD({ emergencyRelation: v }), 'e.g. Brother', 'text', 'pf-ecr')}</Row>
          <Row label="Phone" htmlFor="pf-ecp">{txt(form.details.emergencyPhone, v => setD({ emergencyPhone: v }), '+91 …', 'tel', 'pf-ecp')}</Row>
        </Group>

        {others.length > 0 && (
          <Group icon={<Users className="h-4 w-4" />} title="Family & linked profiles" foot="Set how each person is related to you. Linking lets one of you manage the other’s finances — that is asked for, approved and revoked under Access.">
            {others.map(p => {
              const manageMe = grants.find(g => g.status === 'active' && g.grantee === p.id && g.owner === entityId)
              const iManage = grants.find(g => g.status === 'active' && g.owner === p.id && g.grantee === entityId)
              const pending = grants.find(g => g.status === 'pending' && ((g.grantee === p.id && g.owner === entityId) || (g.owner === p.id && g.grantee === entityId)))
              return (
                <div key={p.id} className="vg-row vg-person">
                  <span className="vg-person-dot" style={{ background: entColor(doc!.entities, p.id) }}>{entName(doc!.entities, p.id).slice(0, 1)}</span>
                  <span className="vg-person-name">
                    <b>{p.name}</b>
                    <small>
                      {manageMe && 'Can manage your finances'}
                      {manageMe && iManage && ' · '}
                      {iManage && 'You manage their finances'}
                      {!manageMe && !iManage && (pending ? 'Access request waiting' : 'Not linked')}
                    </small>
                  </span>
                  {entityId && (
                    <select className="vg-select" style={{ width: 150 }} value={form.details.relations?.[p.id] ?? ''} aria-label={`How ${p.name} is related to you`}
                      onChange={e => setD({ relations: { ...(form.details.relations ?? {}), [p.id]: e.target.value } })}>
                      <option value="">Relation…</option>{RELATIONS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  )}
                  {onGo && entityId && <button className="vg-icobtn" onClick={() => onGo('access')} aria-label={`Link or manage access with ${p.name}`} title="Access"><ChevronRight className="h-4 w-4" /></button>}
                </div>
              )
            })}
          </Group>
        )}

        {entity && action && (
          <Group icon={<BellRing className="h-4 w-4" />} title="Notifications">
            <div className="vg-row">
              <label>Email alerts</label>
              <div className="vg-row-v" style={{ justifyContent: 'space-between' }}>
                <span className="vg-muted" style={{ fontSize: '0.82rem' }}>Budget limits and unusual months, emailed once each</span>
                <button className="vg-switch" role="switch" aria-checked={entity.alerts !== false} aria-label="Email alerts" onClick={() => action({ action: 'setAlerts', on: entity.alerts === false })} />
              </div>
            </div>
          </Group>
        )}

        <Group icon={<ShieldCheck className="h-4 w-4" />} title="Security">
          <Row label="Username"><span className="vg-row-static">{me?.username}</span></Row>
          <div className="vg-row">
            <label>Password</label>
            <div className="vg-row-v"><button className="vg-btn" onClick={() => setShowPw(true)}><KeyRound className="h-4 w-4" /> Change password</button></div>
          </div>
        </Group>
      </div>

      {/* ---- save bar ---- */}
      {(dirty || note) && (
        <div className="vg-savebar" role="region" aria-label="Save changes">
          {note ? <span className={note.ok ? 'vg-pos' : 'vg-neg'} style={{ fontWeight: 600 }}>{note.ok ? <Check className="h-4 w-4" style={{ display: 'inline', verticalAlign: '-3px' }} /> : null} {note.text}</span>
            : <span>You have unsaved changes</span>}
          {dirty && <div style={{ display: 'flex', gap: 8 }}>
            <button className="vg-btn" onClick={() => { setForm(base); setNote(null) }} disabled={busy}>Discard</button>
            <button className="vg-btn vg-btn-primary vg-btn-pill" onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 vg-spin" /> : <Check className="h-4 w-4" />} Save changes</button>
          </div>}
        </div>
      )}

      {crop && <Cropper src={crop} onClose={() => setCrop(null)} onDone={url => { set({ avatar: url }); setCrop(null) }} />}
      {showPw && passwordModal(() => setShowPw(false))}
    </div>
  )
}
