'use client'

// ============================================================
// components/vault/vault-chrome.tsx
//
// Everything around the vault's pages, macOS-style:
//   · VaultTopBar   slim bar pinned to the top — logo, a Dock of 3D app
//                   icons that magnify under the cursor (it moves to the
//                   bottom on a phone), Control Centre, avatar, sign-out
//   · ControlCentre the theme picker (lib/vault-themes.ts), sounds, motion
//   · SignOutButton an armoured mech core; signing out plays a robot
//                   transformation with synthesised servo sound design
//   · CountUp, Hello, ThemeSync — small touches used around the app
//
// Sounds are synthesised with Web Audio, so there are no audio files, and
// they only ever play in answer to a click.
// ============================================================

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
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
  if (typeof window === 'undefined' || read(SOUND_KEY) === 'off') return null
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

/**
 * The transformation — sound design timed to the animation, not music:
 *   0.30  twelve armour plates slam onto the screen, clank by clank
 *   0.62  the seams charge up — a rising whine
 *   0.85  servos whirr as the plates break apart and fold inward
 *   1.28  fifteen helmet pieces lock into place, click by click
 *   1.70  the eyes ignite — an impact and a deep, cinematic brass swell
 *   2.50  power down — a falling tone as the screen collapses to a line
 * A limiter at the end keeps the heavy hits clean.
 */
function mechSound(a: AudioContext) {
  const t0 = a.currentTime + 0.02
  const limit = a.createDynamicsCompressor()
  limit.threshold.value = -10; limit.knee.value = 6; limit.ratio.value = 12; limit.attack.value = 0.003; limit.release.value = 0.2
  limit.connect(a.destination)
  const out = a.createGain(); out.gain.value = 0.7; out.connect(limit)

  const burst = (at: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, vol: number) => {
    const n = a.createBufferSource(); n.buffer = noise(a, dur)
    const f = a.createBiquadFilter(); f.type = type; f.Q.value = q
    f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), at + dur)
    const g = a.createGain()
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.02, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    n.connect(f).connect(g).connect(out); n.start(at)
  }
  const tone = (at: number, f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine', attack = 0.004, lp = 0) => {
    const o = a.createOscillator(), g = a.createGain()
    o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur)
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    if (lp) { const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f).connect(g) } else o.connect(g)
    g.connect(out); o.start(at); o.stop(at + dur + 0.02)
  }
  // Struck metal rings at inharmonic partials — that's what makes it sound like steel.
  const clank = (at: number, f: number, vol: number) => {
    burst(at, 0.07, 'bandpass', 2200, 900, 1.8, vol)
    tone(at, 95, 60, 0.12, vol * 0.9)
    ;[1, 1.47, 2.09, 2.76].forEach((k, i) => tone(at, f * k, f * k * 0.995, 0.18 - i * 0.03, vol * 0.09 / (i + 1), 'triangle'))
  }

  // 1. Armour plates slam on.
  for (let i = 0; i < 12; i++) clank(t0 + 0.3 + i * 0.03, 640 + ((i * 137) % 5) * 70, 0.32)
  // 2. The seams charge: a rising, buzzing whine.
  tone(t0 + 0.62, 90, 420, 0.28, 0.07, 'sawtooth', 0.2, 1400)
  burst(t0 + 0.62, 0.28, 'bandpass', 600, 3200, 3, 0.08)
  // 3. Servos whirr as the plates break apart and fold in.
  ;[0, 0.11, 0.2, 0.31, 0.4].forEach((d, i) => {
    const at = t0 + 0.85 + d, up = i % 2 === 0
    tone(at, up ? 180 : 420, up ? 520 : 230, 0.12, 0.06, 'sawtooth', 0.01, 1800)
    tone(at, up ? 360 : 840, up ? 1040 : 460, 0.12, 0.025, 'square', 0.01, 2400)
  })
  burst(t0 + 0.85, 0.45, 'bandpass', 900, 2400, 1.2, 0.1)
  // 4. Helmet pieces lock into place.
  for (let i = 0; i < 15; i++) {
    const at = t0 + 1.28 + i * 0.026
    burst(at, 0.02, 'highpass', 3000, 2500, 0.8, 0.26)
    tone(at, 1300 + (i % 3) * 180, 1200, 0.04, 0.05, 'square')
    tone(at, 150, 90, 0.06, 0.16)
  }
  // 5. Eyes ignite: a zap, a heavy impact, and a low brass swell (A1 + E2 + A2).
  const ig = t0 + 1.7
  tone(ig - 0.08, 300, 2400, 0.1, 0.05, 'sawtooth', 0.01, 5000)
  tone(ig, 58, 32, 1.1, 0.95)
  burst(ig, 0.35, 'lowpass', 1400, 80, 0.7, 0.5)
  ;[55, 82.41, 110].forEach((f, i) => {
    for (const det of [-9, 9]) {
      const o = a.createOscillator(), g = a.createGain(), lp = a.createBiquadFilter()
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det
      lp.type = 'lowpass'; lp.Q.value = 3
      lp.frequency.setValueAtTime(180, ig); lp.frequency.exponentialRampToValueAtTime(1100, ig + 0.25); lp.frequency.exponentialRampToValueAtTime(220, ig + 0.8)
      g.gain.setValueAtTime(0.0001, ig); g.gain.exponentialRampToValueAtTime(0.09 / (i + 1), ig + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, ig + 0.8)
      o.connect(lp).connect(g).connect(out); o.start(ig); o.stop(ig + 0.85)
    }
  })
  // 6. Power down: a falling tone and a hiss that closes, then one last tick.
  const off = t0 + 2.5
  tone(off, 900, 40, 0.45, 0.12, 'sine', 0.01)
  tone(off, 1800, 80, 0.45, 0.03, 'square', 0.01, 3000)
  burst(off, 0.45, 'highpass', 6000, 800, 0.7, 0.07)
  burst(off + 0.45, 0.015, 'highpass', 3000, 3000, 0.7, 0.2)
}

/** click: any click anywhere in the vault · mech: signing out. */
export function sfx(kind: 'click' | 'mech') {
  const a = audio()
  if (!a) return
  if (kind === 'click') click(a)
  else mechSound(a)
}

/** Every click in the vault makes the click — installed once by ThemeSync. */
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
          <div className="vg-cc-row">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Volume2 className="h-4 w-4" /> Sounds</span>
            <button className="vg-switch" role="switch" aria-checked={sound} aria-label="Sounds" onClick={() => { write(SOUND_KEY, sound ? 'off' : 'on'); notify(); if (!sound) setTimeout(() => sfx('click'), 0) }} />
          </div>
          <div className="vg-cc-row" style={{ borderTop: 0, marginTop: 0 }}>
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
export function SignOutButton({ name }: { name?: string }) {
  const [down, setDown] = useState(false)
  async function go() {
    if (down) return
    sfx('mech')
    setDown(true)
    document.querySelector('.vg')?.classList.add('vg-shutting')
    const req = fetch('/api/vault/logout', { method: 'POST' }).catch(() => undefined)
    // Plates, transform, eyes, power down — then leave.
    await Promise.all([req, new Promise(r => setTimeout(r, motionOff() ? 150 : 3100))])
    // A full page load rather than a router push, so nothing from the
    // signed-in session survives in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/vault/login')
  }
  return (
    <>
      {/* An armoured hex core: two plates with a glowing visor slit between
          them. Hover and the plates part to show the power core; click and
          they slam shut. */}
      <button className="vg-mechbtn" data-locking={down} onClick={go} disabled={down} aria-label="Power down and sign out" title="Power down & sign out">
        <span className="hex">
          <span className="core">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v7.5" /><path d="M7 6.6a7 7 0 1 0 10 0" /></svg>
          </span>
          <span className="plate top" />
          <span className="plate bot" />
        </span>
      </button>
      {down && typeof document !== 'undefined' && createPortal(<Transform name={name} />, document.body)}
    </>
  )
}

// A robot helmet cut into pieces (a 200 × 210 drawing). Left-hand pieces are
// mirrored for the right. Each piece flies in from its own direction.
type Pt = [number, number]
const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [200 - x, y])
const HELMET: { id: string; pts: Pt[]; from: [number, number, number]; tone?: 'lite' | 'dark' }[] = (() => {
  const side: { id: string; pts: Pt[]; from: [number, number, number]; tone?: 'lite' | 'dark' }[] = [
    { id: 'fin', pts: [[32, 72], [16, 52], [14, 100], [34, 106]], from: [-220, -60, -140] },
    { id: 'temple', pts: [[44, 42], [62, 64], [58, 100], [38, 118], [32, 72]], from: [-180, 40, 120] },
    { id: 'brow', pts: [[97, 8], [88, 26], [94, 58], [62, 64], [44, 42], [68, 20]], from: [-120, -200, -90], tone: 'lite' },
    { id: 'cheek', pts: [[38, 118], [58, 100], [86, 108], [78, 148], [52, 158]], from: [-200, 140, 160] },
    { id: 'jaw', pts: [[52, 158], [78, 148], [90, 156], [100, 164], [100, 200], [72, 186]], from: [-90, 220, -180], tone: 'lite' },
  ]
  const out: typeof side = []
  for (const p of side) {
    out.push({ ...p, id: `${p.id}-l` })
    out.push({ ...p, id: `${p.id}-r`, pts: mirror(p.pts), from: [-p.from[0], p.from[1], -p.from[2]] })
  }
  out.splice(4, 0, { id: 'crest', pts: [[100, 4], [112, 26], [106, 58], [94, 58], [88, 26]], from: [0, -260, 180], tone: 'lite' })
  out.push({ id: 'visor', pts: [[62, 64], [138, 64], [142, 100], [100, 106], [58, 100]], from: [0, -40, 0], tone: 'dark' })
  out.push({ id: 'mouth', pts: [[86, 108], [100, 106], [114, 108], [110, 156], [100, 164], [90, 156]], from: [0, 260, 90] })
  return out
})()
const EYE: Pt[] = [[66, 76], [94, 80], [92, 90], [68, 90]]
const ptsAttr = (pts: Pt[]) => pts.map(p => p.join(',')).join(' ')

/**
 * Signing out transforms the vault: twelve armour plates slam over the
 * page, charge at the seams, break apart and fold inward, and the pieces
 * reassemble as a robot helmet. Its eyes ignite, a HUD spins up — then the
 * whole thing powers off like an old screen collapsing to a line.
 */
function Transform({ name }: { name?: string }) {
  const plates = Array.from({ length: 12 }, (_, i) => {
    const r = Math.floor(i / 4), c = i % 4
    const style = {
      '--i': i,
      '--fx': c < 2 ? -1 : 1, '--fy': r - 1, '--fr': `${(c < 2 ? -1 : 1) * (r === 1 ? 8 : 18)}deg`,
      '--tx': `${(1.5 - c) * 100}%`, '--ty': `${(1 - r) * 100}%`,
      '--o': Math.abs(1.5 - c) + Math.abs(1 - r),
    } as React.CSSProperties
    return <div key={i} className={`vg-tf-plate${i % 5 === 0 ? ' hazard' : ''}`} style={style} data-label={`${'ABC'[r]}-0${c + 1}`} />
  })
  return (
    <div className="vg-tf" role="status" aria-live="polite">
      <div className="vg-tf-plates" aria-hidden="true">{plates}</div>
      <div className="vg-tf-stage">
        <div className="vg-tf-head">
          <svg viewBox="-40 -40 280 290" className="vg-tf-hud" aria-hidden="true">
            <circle cx="100" cy="105" r="128" className="ring r1" />
            <circle cx="100" cy="105" r="116" className="ring r2" />
            <circle cx="100" cy="105" r="138" className="ring r3" />
          </svg>
          <svg viewBox="0 0 200 210" className="vg-tf-svg" aria-hidden="true">
            <defs>
              <linearGradient id="tf-metal" x1="0" y1="0" x2="0.4" y2="1">
                <stop offset="0" stopColor="#9aa6b4" /><stop offset="0.45" stopColor="#4a525d" /><stop offset="1" stopColor="#1d2127" />
              </linearGradient>
              <linearGradient id="tf-lite" x1="0" y1="0" x2="0.3" y2="1">
                <stop offset="0" stopColor="#dfe6ee" /><stop offset="0.5" stopColor="#8e99a6" /><stop offset="1" stopColor="#3b424b" />
              </linearGradient>
              <filter id="tf-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <clipPath id="tf-clip">{HELMET.map(p => <polygon key={p.id} points={ptsAttr(p.pts)} />)}</clipPath>
            </defs>
            {HELMET.map((p, i) => (
              <g key={p.id} className="tf-part" style={{ '--dx': `${p.from[0]}px`, '--dy': `${p.from[1]}px`, '--r': `${p.from[2]}deg`, '--i': i } as React.CSSProperties}>
                <polygon points={ptsAttr(p.pts)} fill={p.tone === 'dark' ? '#07090c' : p.tone === 'lite' ? 'url(#tf-lite)' : 'url(#tf-metal)'} />
                {p.id === 'mouth' && [120, 130, 140, 150].map(y => <line key={y} x1="92" x2="108" y1={y} y2={y} className="slat" />)}
              </g>
            ))}
            <g className="tf-eyes" filter="url(#tf-glow)">
              <polygon points={ptsAttr(EYE)} />
              <polygon points={ptsAttr(mirror(EYE))} />
            </g>
            <g clipPath="url(#tf-clip)"><rect className="tf-scan" x="0" y="0" width="200" height="14" /></g>
          </svg>
        </div>
        <div className="vg-tf-text">
          <p className="vg-tf-state"><span className="vg-tf-led" /><span className="vg-tf-words"><span className="t1">Transforming</span><span className="t2">Secured</span></span></p>
          <p className="vg-tf-sub">{name ? `See you soon, ${name}` : 'See you soon'}</p>
        </div>
      </div>
      <div className="vg-tf-line" aria-hidden="true" />
    </div>
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

  const first = (me?.firstName || me?.name || me?.username || '').split(' ')[0]
  return (
    <>
      <Dock items={items} active={active} onPick={onPick} />
      <FloatingControls status={status}>
        <ControlCentre />
        {me && <AvatarButton me={me} onClick={onProfile} on={profileOn} />}
        <SignOutButton name={first} />
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
function FloatingControls({ status, children }: { status?: 'idle' | 'saving' | 'saved' | 'conflict'; children: React.ReactNode }) {
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
