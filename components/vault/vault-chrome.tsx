'use client'

// ============================================================
// components/vault/vault-chrome.tsx
//
// Everything around the vault's pages, macOS-style:
//   · VaultTopBar   slim bar pinned to the top — logo, a Dock of 3D app
//                   icons that magnify under the cursor (it moves to the
//                   bottom on a phone), Control Centre, avatar, sign-out
//   · ControlCentre the theme picker (lib/vault-themes.ts), sounds, motion
//   · SignOutButton an armoured mech core; signing out zooms the whole page
//                   down into a single dot in the middle
//   · CountUp, Hello, ThemeSync — small touches used around the app
//
// Sounds are synthesised with Web Audio, so there are no audio files, and
// they only ever play in answer to a click.
// ============================================================

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Great_Vibes, Cinzel } from 'next/font/google'
import { AppIcon } from '@/components/vault/dock-icons'
import { Loader2, Check, SlidersHorizontal, Volume2, Sparkles, House, Wallet, Images, FolderLock, type LucideIcon } from 'lucide-react'
import { VAULT_THEMES, DEFAULT_THEME, THEME_KEY } from '@/lib/vault-themes'

// The logo: a hand signature, and engraved Roman capitals beneath it.
const signature = Great_Vibes({ subsets: ['latin'], weight: '400', display: 'swap' })
const roman = Cinzel({ subsets: ['latin'], weight: ['500'], display: 'swap' })

// ---------- preferences (per browser) ---------------------------
const SOUND_KEY = 'vg-sound'
const MOTION_KEY = 'vg-motion'
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }
const PREF_EVENT = 'vg-prefs'
const subscribePrefs = (cb: () => void) => { window.addEventListener(PREF_EVENT, cb); window.addEventListener('storage', cb); return () => { window.removeEventListener(PREF_EVENT, cb); window.removeEventListener('storage', cb) } }
const notify = () => window.dispatchEvent(new Event(PREF_EVENT))

function usePref(key: string, fallback: string): string {
  return useSyncExternalStore(subscribePrefs, () => read(key) ?? fallback, () => fallback)
}
/** The phone view: a phone-sized screen, or the installed Home Screen app. */
export const isPhone = () => typeof window !== 'undefined' && (matchMedia('(max-width: 760px)').matches || matchMedia('(display-mode: standalone)').matches)
const motionOff = () => read(MOTION_KEY) === 'off' || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)

export function applyTheme(id: string) {
  document.documentElement.setAttribute('data-vg-theme', id)
  write(THEME_KEY, id)
  notify()
}

/** Re-applies the chosen theme and motion setting on pages reached by client
 *  navigation, where the boot script in the layout does not run again. */
export function ThemeSync() {
  useClickSound()
  useTableLabels()
  useEffect(() => {
    const t = read(THEME_KEY)
    if (t) document.documentElement.setAttribute('data-vg-theme', t)
    if (read(MOTION_KEY) === 'off') document.documentElement.setAttribute('data-vg-motion', 'off')
  }, [])
  return null
}

// ---------- sound ------------------------------------------------
let ctx: AudioContext | null = null
function audio(): AudioContext | null {
  // The phone app is silent: no clicks, ever.
  if (typeof window === 'undefined' || read(SOUND_KEY) === 'off' || isPhone()) return null
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}
/** A short burst of noise, shaped — the raw material of a mechanical click. */
function noise(a: AudioContext, dur: number): AudioBuffer {
  const len = Math.max(1, Math.floor(a.sampleRate * dur)), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return buf
}

/**
 * The click: in the spirit of the iPhone's lock click — a hard, very short
 * tick (bright filtered noise) with a tiny wooden body under it, and a second,
 * softer latch a few milliseconds later. Synthesised, not a recording.
 */
function click(a: AudioContext) {
  const t = a.currentTime
  const out = a.createGain(); out.gain.value = 0.55; out.connect(a.destination)
  const tick = (at: number, hp: number, body: number, vol: number) => {
    const n = a.createBufferSource(); n.buffer = noise(a, 0.012)
    const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp
    const g = a.createGain()
    g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.011)
    n.connect(f).connect(g).connect(out); n.start(t + at)
    // The body: a resonant knock that dies almost at once.
    const o = a.createOscillator(), og = a.createGain()
    o.type = 'sine'; o.frequency.setValueAtTime(body, t + at); o.frequency.exponentialRampToValueAtTime(body * 0.6, t + at + 0.03)
    og.gain.setValueAtTime(vol * 0.5, t + at); og.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.03)
    o.connect(og).connect(out); o.start(t + at); o.stop(t + at + 0.04)
  }
  tick(0, 3200, 1500, 0.6)
  tick(0.018, 2400, 1100, 0.22)
}

/** click: any click anywhere in the vault. */
export function sfx(kind: 'click') {
  const a = audio()
  if (!a) return
  if (kind === 'click') click(a)
}

/** Every click in the vault makes the click — installed once by ThemeSync. */
/**
 * On a phone every table is shown as a stack of cards, one per row, each
 * value labelled with its column name. This writes that name onto each cell
 * (data-label), working out which header sits over which column even when
 * headers span rows or columns. Tables that change are relabelled.
 */
function labelTable(t: HTMLTableElement) {
  const labels: string[] = []
  const taken: boolean[][] = []
  Array.from(t.tHead?.rows ?? []).forEach((row, r) => {
    let c = 0
    for (const th of Array.from(row.cells)) {
      while (taken[r]?.[c]) c++
      const txt = (th.textContent || '').trim()
      for (let i = 0; i < th.colSpan; i++) {
        for (let j = 0; j < th.rowSpan; j++) (taken[r + j] ??= [])[c + i] = true
        // A lower header row is more specific, so it wins; a group header
        // ("Borne by…") only fills columns nothing more specific names.
        if (txt && (th.colSpan === 1 || !labels[c + i])) labels[c + i] = txt
      }
      c += th.colSpan
    }
  })
  for (const body of [...Array.from(t.tBodies), ...(t.tFoot ? [t.tFoot] : [])]) {
    for (const row of Array.from(body.rows)) {
      let c = 0
      for (const td of Array.from(row.cells)) {
        const l = td.colSpan > 1 && c === 0 ? '' : labels[c] ?? ''
        if (td.getAttribute('data-label') !== l) td.setAttribute('data-label', l)
        // A cell holding only a dash says "nothing here": the phone card skips it.
        const blank = /^[—–-]?$/.test((td.textContent || '').trim()) && !td.querySelector('input, select, button, svg, img')
        if (td.hasAttribute('data-blank') !== blank) td.toggleAttribute('data-blank', blank)
        // Long or multi-part values (several chips, a sentence) get the card's full width.
        const wide = (td.textContent || '').trim().length > 20 || td.querySelectorAll('.vg-chip, input:not([type="checkbox"]), select').length > 1
        if (td.hasAttribute('data-wide') !== wide) td.toggleAttribute('data-wide', wide)
        c += td.colSpan
      }
    }
  }
}
function useTableLabels() {
  useEffect(() => {
    let raf = 0
    const run = () => { raf = 0; document.querySelectorAll<HTMLTableElement>('table.vg-table').forEach(labelTable) }
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(run) })
    mo.observe(document.body, { childList: true, subtree: true, characterData: true })
    run()
    return () => { mo.disconnect(); cancelAnimationFrame(raf) }
  }, [])
}

function useClickSound() {
  useEffect(() => {
    const on = (e: PointerEvent) => { if (e.button === 0 && e.isPrimary) sfx('click') }
    document.addEventListener('pointerdown', on, { capture: true, passive: true })
    return () => document.removeEventListener('pointerdown', on, { capture: true })
  }, [])
}

// ---------- Logo -------------------------------------------------
/** "Lamba" signed by hand, with a signature flourish beneath and FAMILY in
 *  engraved capitals between two hairlines — a signet, not a sticker. */
export function Logo({ href = '/vault' }: { href?: string }) {
  return (
    <Link href={href} className="vg-logo" aria-label="Lamba Family — home">
      <span className={`vg-logo-sign ${signature.className}`}>Lamba</span>
      <svg className="vg-logo-flourish" viewBox="0 0 120 14" aria-hidden="true">
        <path d="M4 9.5C24 3 52 12.5 78 7.5S112 3.5 117 5.5" />
      </svg>
      <span className={`vg-logo-family ${roman.className}`}>Family</span>
    </Link>
  )
}

// ---------- Dock -------------------------------------------------
export interface DockItem { id: string; label: string; icon: LucideIcon; badge?: number; href?: string; sep?: boolean }

/** The macOS Dock: a glass shelf at the bottom of the screen whose icons
 *  swell under the cursor, name themselves above, bounce when opened and
 *  keep a dot under whichever is open. */
function Dock({ items, active, onPick }: { items: DockItem[]; active?: string; onPick?: (id: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const centres = useRef<number[]>([])
  const [bounce, setBounce] = useState<string | null>(null)

  const canMagnify = () => typeof window !== 'undefined' && window.innerWidth > 760 && matchMedia('(hover: hover) and (pointer: fine)').matches && !motionOff()
  const kids = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('.vg-dock-item') ?? [])
  const reset = () => kids().forEach(k => k.style.setProperty('--s', '1'))
  // Measure where the icons sit at rest, so magnifying never makes them jitter.
  const measure = () => { centres.current = kids().map(k => { const r = k.getBoundingClientRect(); return r.left + r.width / 2 }) }
  const move = (x: number) => {
    if (!canMagnify()) return
    if (!centres.current.length) measure()
    kids().forEach((k, i) => {
      const d = Math.abs(x - (centres.current[i] ?? 0))
      const s = d < 150 ? 1 + 0.62 * (Math.cos((d / 150) * Math.PI) + 1) / 2 : 1
      k.style.setProperty('--s', s.toFixed(3))
    })
  }
  const pick = (id: string) => {
    if (!motionOff()) { setBounce(id); setTimeout(() => setBounce(b => (b === id ? null : b)), 700) }
    onPick?.(id)
  }

  // On a phone the tab bar scrolls; keep the open tab in view.
  useEffect(() => {
    if (!isPhone()) return
    ref.current?.querySelector<HTMLElement>('.vg-dock-item[data-on="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [active])

  return (
    <nav ref={ref} className="vg-dock" aria-label="Sections"
      onMouseEnter={() => { reset(); measure() }} onMouseMove={e => move(e.clientX)} onMouseLeave={() => { reset(); centres.current = [] }}>
      {items.map(it => {
        const inner = (
          <>
            <span className="vg-app"><AppIcon id={it.id} /></span>
            {!!it.badge && <span className="vg-dock-badge">{it.badge > 99 ? '99+' : it.badge}</span>}
            <span className="vg-dock-tip">{it.label}</span>
            <span className="vg-dock-lbl">{it.label}</span>
          </>
        )
        const common = { className: 'vg-dock-item', 'data-on': active === it.id, 'data-bounce': bounce === it.id, 'aria-label': it.label, 'aria-current': active === it.id ? ('page' as const) : undefined }
        return (
          <span key={it.id} style={{ display: 'contents' }}>
            {it.sep && <span className="vg-dock-sep" aria-hidden="true" />}
            {it.href
              ? <Link href={it.href} {...common}>{inner}</Link>
              : <button type="button" {...common} onClick={() => pick(it.id)}>{inner}</button>}
          </span>
        )
      })}
    </nav>
  )
}

// ---------- Control Centre --------------------------------------
function ControlCentre() {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<React.CSSProperties>({})
  // Open beside the button, on whichever side of the screen has room.
  const toggle = () => {
    const r = btn.current?.getBoundingClientRect()
    if (r && !open) {
      const onLeft = r.left + r.width / 2 < window.innerWidth / 2
      const top = Math.max(10, Math.min(r.top - 40, window.innerHeight - 520))
      const maxHeight = window.innerHeight - top - 10
      setAt(onLeft ? { left: r.right + 12, top, maxHeight } : { right: window.innerWidth - r.left + 12, top, maxHeight })
    }
    setOpen(o => !o)
  }
  const theme = usePref(THEME_KEY, DEFAULT_THEME)
  const sound = usePref(SOUND_KEY, 'on') !== 'off'
  const motion = usePref(MOTION_KEY, 'on') !== 'off'
  const panel = useRef<HTMLDivElement | null>(null)
  const btn = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const light = VAULT_THEMES.filter(t => !t.dark), dark = VAULT_THEMES.filter(t => t.dark)
  const swatches = (list: typeof VAULT_THEMES) => (
    <div className="vg-swatches">
      {list.map(t => (
        <button key={t.id} className="vg-swatch" data-on={theme === t.id} onClick={() => applyTheme(t.id)} aria-pressed={theme === t.id}>
          <span className="vg-swatch-win" style={{ background: `radial-gradient(60% 70% at 20% 10%, ${t.blobs[0]}, transparent), radial-gradient(60% 70% at 90% 20%, ${t.blobs[1]}, transparent), linear-gradient(180deg, ${t.bg[0]}, ${t.bg[1]})` }}>
            <span className="vg-swatch-card" style={{ background: t.glass2, boxShadow: `inset 0 0 0 1px ${t.line}` }}>
              <span style={{ position: 'absolute', left: 6, top: 5, width: 24, height: 4, borderRadius: 3, background: t.ink, opacity: 0.8 }} />
              <span style={{ position: 'absolute', left: 6, top: 12, width: 36, height: 3, borderRadius: 3, background: t.faint }} />
            </span>
            <span className="vg-swatch-dot" style={{ background: `linear-gradient(180deg, ${t.accent2}, ${t.accent})` }} />
          </span>
          {t.name}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <button ref={btn} className="vg-cc-btn" data-on={open} onClick={toggle} aria-label="Appearance" aria-expanded={open} title="Appearance">
        <SlidersHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div ref={panel} className="vg-cc" style={at} role="dialog" aria-label="Appearance">
          <h4>Light</h4>
          {swatches(light)}
          <h4 style={{ marginTop: 14 }}>Dark</h4>
          {swatches(dark)}
          <div className="vg-cc-row vg-cc-sound">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Volume2 className="h-4 w-4" /> Sounds</span>
            <button className="vg-switch" role="switch" aria-checked={sound} aria-label="Sounds" onClick={() => { write(SOUND_KEY, sound ? 'off' : 'on'); notify(); if (!sound) setTimeout(() => sfx('click'), 0) }} />
          </div>
          <div className="vg-cc-row vg-cc-motion">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Sparkles className="h-4 w-4" /> Animations</span>
            <button className="vg-switch" role="switch" aria-checked={motion} aria-label="Animations" onClick={() => {
              write(MOTION_KEY, motion ? 'off' : 'on'); notify()
              if (motion) document.documentElement.setAttribute('data-vg-motion', 'off'); else document.documentElement.removeAttribute('data-vg-motion')
            }} />
          </div>
        </div>
      )}
    </>
  )
}

// ---------- Avatar -----------------------------------------------
export interface BarUser { firstName?: string; name?: string; username?: string; avatar?: string }
function AvatarButton({ me, onClick, on }: { me: BarUser; onClick?: () => void; on?: boolean }) {
  const label = (me.firstName || me.name || me.username || '').trim()
  const initials = label.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  const body = (
    <span className="vg-avatar-in">
      {/* eslint-disable-next-line @next/next/no-img-element -- a small data-URL avatar, nothing to optimise */}
      {me.avatar ? <img src={me.avatar} alt="" /> : initials}
    </span>
  )
  return onClick
    ? <button className="vg-avatar" onClick={onClick} data-on={on} aria-label={label ? `${label} — your profile` : 'Your profile'} title={label || 'Your profile'}>{body}</button>
    : <span className="vg-avatar" title={label}>{body}</span>
}

// ---------- Sign out ---------------------------------------------
/**
 * Signing out: the whole page shrinks into one dot in the middle of the
 * screen, on black, and the dot winks out. The transform is on <html>, so
 * fixed elements (the Dock, the control strip) shrink with everything else.
 */
function zoomToDot(): Promise<void> {
  const html = document.documentElement, body = document.body
  const y = window.scrollY + window.innerHeight / 2
  const origin = `50vw ${y}px`
  html.style.background = '#000'
  html.style.overflow = 'hidden'
  const opts = { duration: 620, easing: 'cubic-bezier(.65,0,.8,.2)', fill: 'forwards' as const }
  // The page shrinks toward the middle of the screen…
  const zoom = html.animate([{ transform: 'scale(1)', transformOrigin: origin }, { transform: 'scale(0.012)', transformOrigin: origin }], opts)
  // …and rounds off as it goes, so what's left is a dot.
  body.animate([{ clipPath: `circle(150vmax at 50vw ${y - body.offsetTop}px)` }, { clipPath: `circle(28vmin at 50vw ${y - body.offsetTop}px)` }], opts)
  return zoom.finished
    .then(() => body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, delay: 60, fill: 'forwards' }).finished)
    .then(() => undefined, () => undefined)
}

export function SignOutButton() {
  const [down, setDown] = useState(false)
  async function go() {
    if (down) return
    setDown(true)
    const req = fetch('/api/vault/logout', { method: 'POST' }).catch(() => undefined)
    // The click sound comes from the vault's global click handler.
    await Promise.all([req, motionOff() ? Promise.resolve() : zoomToDot()])
    // A full page load rather than a router push, so nothing from the
    // signed-in session survives in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/vault/login')
  }
  return (
    // An armoured hex core: two plates with a glowing visor slit between
    // them. Hover and the plates part to show the power core; click and
    // they slam shut, and the page zooms away into a dot.
    <button className="vg-mechbtn" data-locking={down} onClick={go} disabled={down} aria-label="Power down and sign out" title="Power down & sign out">
      <span className="hex">
        <span className="core">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v7.5" /><path d="M7 6.6a7 7 0 1 0 10 0" /></svg>
        </span>
        <span className="plate top" />
        <span className="plate bot" />
      </span>
    </button>
  )
}

// ---------- the bar ----------------------------------------------
export function VaultTopBar({ items, active, onPick, me, onProfile, profileOn, status }: {
  items: DockItem[]; active?: string; onPick?: (id: string) => void
  me?: BarUser; onProfile?: () => void; profileOn?: boolean; homeHref?: string
  status?: 'idle' | 'saving' | 'saved' | 'conflict'
}) {
  // A soft light follows the cursor across the glass cards.
  useEffect(() => {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return
    let raf = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const card = (e.target as Element | null)?.closest?.('.vg-card') as HTMLElement | null
        if (!card) return
        const r = card.getBoundingClientRect()
        card.style.setProperty('--mx', `${e.clientX - r.left}px`)
        card.style.setProperty('--my', `${e.clientY - r.top}px`)
      })
    }
    document.addEventListener('pointermove', onMove, { passive: true })
    return () => { document.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf) }
  }, [])

  return (
    <>
      <Dock items={items} active={active} onPick={onPick} />
      <FloatingControls status={status} title={items.find(i => i.id === active)?.label ?? (profileOn ? 'Profile' : 'Vault')}>
        <ControlCentre />
        {me && <AvatarButton me={me} onClick={onProfile} on={profileOn} />}
        <SignOutButton />
      </FloatingControls>
    </>
  )
}

// ---------- the floating control strip ------------------------------
const POS_KEY = 'vg-controls-pos'
/** Appearance, profile and sign-out on a small vertical strip that floats
 *  on the left edge by default and can be dragged anywhere by its grip.
 *  Where it was left is remembered (as a fraction of the screen, so it
 *  stays on screen when the window is resized). */
function FloatingControls({ status, title, children }: { status?: 'idle' | 'saving' | 'saved' | 'conflict'; title?: string; children: React.ReactNode }) {
  const pos = usePref(POS_KEY, '')
  const ref = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const [fx, fy] = pos ? pos.split(',').map(Number) : [NaN, NaN]
  const placed = Number.isFinite(fx) && Number.isFinite(fy)
  // While it sits in its home on the left, the page keeps a lane clear for it.
  useEffect(() => {
    document.documentElement.dataset.vgStrip = placed ? 'free' : 'left'
    return () => { delete document.documentElement.dataset.vgStrip }
  }, [placed])
  const style: React.CSSProperties = placed
    ? { left: `calc((100vw - var(--vg-fc-w)) * ${fx})`, top: `calc((100dvh - var(--vg-fc-h)) * ${fy})` }
    : { left: 12, top: 'calc(50dvh - var(--vg-fc-h) / 2)' }

  const where = (clientX: number, clientY: number) => {
    const el = ref.current!
    const w = el.offsetWidth, h = el.offsetHeight
    const x = Math.max(0, Math.min(window.innerWidth - w, clientX - (drag.current?.dx ?? 0)))
    const y = Math.max(0, Math.min(window.innerHeight - h, clientY - (drag.current?.dy ?? 0)))
    return { x, y, fx: x / Math.max(1, window.innerWidth - w), fy: y / Math.max(1, window.innerHeight - h) }
  }
  const onDown = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* keep dragging without capture */ }
    ref.current!.dataset.dragging = 'true'
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const { x, y } = where(e.clientX, e.clientY)
    ref.current!.style.left = `${x}px`; ref.current!.style.top = `${y}px`
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current) return
    const { fx: nx, fy: ny } = where(e.clientX, e.clientY)
    drag.current = null
    delete ref.current!.dataset.dragging
    write(POS_KEY, `${nx.toFixed(4)},${ny.toFixed(4)}`); notify()
  }
  // Keyboard: arrow keys on the grip nudge it; Home puts it back.
  const onKey = (e: React.KeyboardEvent) => {
    const step = 0.04
    let [x, y] = placed ? [fx, fy] : [0, 0.5]
    if (e.key === 'ArrowLeft') x -= step; else if (e.key === 'ArrowRight') x += step
    else if (e.key === 'ArrowUp') y -= step; else if (e.key === 'ArrowDown') y += step
    else if (e.key === 'Home') { write(POS_KEY, ''); notify(); return } else return
    e.preventDefault()
    write(POS_KEY, `${Math.max(0, Math.min(1, x)).toFixed(4)},${Math.max(0, Math.min(1, y)).toFixed(4)}`); notify()
  }

  return (
    <div ref={ref} className="vg-fc" style={style} role="toolbar" aria-orientation="vertical" aria-label="Your controls">
      <button className="vg-fc-grip" aria-label="Move these controls (drag, or use the arrow keys)" title="Drag to move"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey} onDoubleClick={() => { write(POS_KEY, ''); notify() }}>
        <span /><span /><span /><span /><span /><span />
      </button>
      {/* On a phone this strip is the fixed bar across the top, titled with
          the section you are in (the title is hidden on a desktop). */}
      {title && <span className="vg-fc-title">{title}</span>}
      {children}
      <span className="vg-fc-status" aria-live="polite">
        {status === 'saving' && <Loader2 className="h-3.5 w-3.5 vg-spin" aria-label="Saving" />}
        {status === 'saved' && <Check className="h-3.5 w-3.5" style={{ color: 'var(--vg-pos)' }} aria-label="Saved" />}
        {status === 'conflict' && <span title="Someone else changed the sheet while this page was open. Their version is now loaded, so your last edit was not saved — please make it again." style={{ color: 'var(--vg-neg)', fontWeight: 800 }}>!</span>}
      </span>
    </div>
  )
}

// ---------- small touches -----------------------------------------
/** Money figures count up to their value, like a Wallet balance. */
export function CountUp({ text }: { text: string }) {
  const el = useRef<HTMLSpanElement | null>(null)
  const last = useRef(0)
  useEffect(() => {
    const m = text.match(/^([−-]?)₹([\d,]+)$/)
    const node = el.current
    if (!m || !node) return
    const to = Number(m[2].replace(/,/g, '')) * (m[1] ? -1 : 1)
    const from = last.current
    last.current = to
    if (motionOff() || from === to) { node.textContent = text; return }
    const fmt = (v: number) => `${v < 0 ? '−' : ''}₹${Math.abs(v).toLocaleString('en-IN')}`
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 750)
      node.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [text])
  return <span ref={el}>{text}</span>
}

const tick30 = (cb: () => void) => { const id = setInterval(cb, 30_000); return () => clearInterval(id) }
/** "Good evening, Bhawneet" with the date — rendered in the browser only,
 *  so the server never guesses the wrong time of day. */
export function Hello({ name }: { name?: string }) {
  const now = useSyncExternalStore(tick30, () => Math.floor(Date.now() / 30_000), () => 0)
  if (!now) return null
  const d = new Date(now * 30_000)
  const h = d.getHours()
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return (
    <div className="vg-hello">
      <h2>{part}{name ? <>, <span>{name}</span></> : null}</h2>
      <time dateTime={d.toISOString()}>{d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · {d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</time>
    </div>
  )
}

/** The bar for the vault's own pages, where the Dock holds its apps. */
export function VaultAppsBar({ active, me }: { active: 'home' | 'finance' | 'photos' | 'files'; me?: BarUser }) {
  const items: DockItem[] = [
    { id: 'home', label: 'Vault', icon: House, href: '/vault' },
    { id: 'finance', label: 'Finance', icon: Wallet, href: '/vault/finance' },
    { id: 'photos', label: 'Family Photos', icon: Images, href: '/vault/photos' },
    { id: 'files', label: 'Files', icon: FolderLock, href: '/vault/files' },
  ]
  return <VaultTopBar items={items} active={active} me={me} />
}
