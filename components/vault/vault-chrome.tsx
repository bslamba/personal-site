'use client'

// ============================================================
// components/vault/vault-chrome.tsx
//
// Everything around the vault's pages, macOS-style:
//   · VaultTopBar   slim bar pinned to the top — logo, a Dock of 3D app
//                   icons that magnify under the cursor (it moves to the
//                   bottom on a phone), Control Centre, avatar, sign-out
//   · ControlCentre the theme picker (lib/vault-themes.ts), sounds, motion
//   · SignOutButton a 3D power key with a synthesised power-down sound and
//                   a shutdown animation
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
 * Locking the vault — sound design timed to the door, not music:
 *   0.00  air moving as the door swings shut (a filtered whoosh)
 *   0.62  the door lands — a deep thud with a steel ring
 *   0.72  the wheel spins — ratchet clicks, fast then slowing
 *   1.40  four bolts shoot home — heavy metallic clunks
 *   1.72  the lock engages — a low hit and a short, cool synth chord
 * A limiter at the end keeps the heavy hits clean.
 */
function vaultSound(a: AudioContext) {
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
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.03, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    n.connect(f).connect(g).connect(out); n.start(at)
  }
  const ping = (at: number, f: number, dur: number, vol: number, type: OscillatorType = 'sine', drop = 1) => {
    const o = a.createOscillator(), g = a.createGain()
    o.type = type; o.frequency.setValueAtTime(f, at); o.frequency.exponentialRampToValueAtTime(f * drop, at + dur)
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    o.connect(g).connect(out); o.start(at); o.stop(at + dur + 0.02)
  }

  // 1. The swing: air rushing past a heavy door.
  burst(t0, 0.62, 'bandpass', 380, 1800, 0.9, 0.22)
  // 2. The door lands: a sub thud, a body knock, and a short steel ring.
  const land = t0 + 0.62
  ping(land, 62, 0.55, 0.9, 'sine', 0.6)
  burst(land, 0.18, 'lowpass', 900, 120, 0.7, 0.55)
  ping(land, 1480, 0.5, 0.05, 'triangle'); ping(land, 2210, 0.4, 0.03, 'triangle')
  // 3. The wheel: ratchet clicks, quickening then settling — like a safe.
  const clicks = [0, 0.07, 0.13, 0.18, 0.225, 0.265, 0.3, 0.335, 0.375, 0.42, 0.475, 0.54, 0.62]
  clicks.forEach((c, i) => {
    const at = t0 + 0.72 + c
    burst(at, 0.018, 'highpass', 2600, 2200, 0.7, 0.28 - i * 0.012)
    ping(at, 900 + (i % 2) * 120, 0.035, 0.07, 'square')
  })
  // 4. Four bolts shoot home, one after another.
  for (let i = 0; i < 4; i++) {
    const at = t0 + 1.4 + i * 0.075
    burst(at, 0.12, 'bandpass', 1300, 700, 1.4, 0.5)
    ping(at, 2400 - i * 90, 0.16, 0.045, 'triangle')
    ping(at, 110, 0.12, 0.35, 'sine', 0.7)
  }
  // 5. Locked: a low hit, then a short, cool chord that opens and settles.
  const lock = t0 + 1.72
  ping(lock, 48, 0.9, 0.85, 'sine', 0.8)
  burst(lock, 0.3, 'lowpass', 400, 60, 0.7, 0.4)
  const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
  ;[50, 57, 62, 64, 69].forEach((m, i) => {                 // D3 A3 D4 E4 A4 — an open, modern sus chord
    const at = lock + 0.04 + i * 0.012
    for (const det of [-6, 6]) {
      const o = a.createOscillator(), g = a.createGain(), lp = a.createBiquadFilter()
      o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det
      lp.type = 'lowpass'; lp.Q.value = 2
      lp.frequency.setValueAtTime(400, at); lp.frequency.exponentialRampToValueAtTime(2600, at + 0.35); lp.frequency.exponentialRampToValueAtTime(500, at + 1.6)
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.03, at + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, at + 1.7)
      o.connect(lp).connect(g).connect(out); o.start(at); o.stop(at + 1.75)
    }
  })
}

/** click: any click anywhere in the vault · vault: signing out. */
export function sfx(kind: 'click' | 'vault') {
  const a = audio()
  if (!a) return
  if (kind === 'click') click(a)
  else vaultSound(a)
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
    sfx('vault')
    setDown(true)
    document.querySelector('.vg')?.classList.add('vg-shutting')
    const req = fetch('/api/vault/logout', { method: 'POST' }).catch(() => undefined)
    // The door swings, the wheel spins, the bolts shoot, it locks — then black.
    await Promise.all([req, new Promise(r => setTimeout(r, motionOff() ? 150 : 2650))])
    // A full page load rather than a router push, so nothing from the
    // signed-in session survives in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/vault/login')
  }
  return (
    <>
      {/* A brushed-steel safe dial with a padlock whose shackle stands open
          while you are signed in; it snaps shut when you lock the vault. */}
      <button className="vg-lockbtn" data-locking={down} onClick={go} disabled={down} aria-label="Lock the vault and sign out" title="Lock & sign out">
        <svg viewBox="0 0 24 24" className="vg-padlock" aria-hidden="true">
          <path className="shackle" d="M8.2 11V8.1a3.8 3.8 0 0 1 7.6 0V11" />
          <rect x="5.5" y="10.6" width="13" height="10" rx="2.6" />
          <circle cx="12" cy="15.3" r="1.35" />
          <path d="M12 16.3v1.6" />
        </svg>
      </button>
      {down && typeof document !== 'undefined' && createPortal(<VaultDoor name={name} />, document.body)}
    </>
  )
}

/**
 * Signing out closes the vault: a heavy steel door swings shut over the
 * page, its wheel spins, four bolts shoot into the frame, a light runs
 * across the steel and the status ring turns to LOCKED. Then black.
 */
function VaultDoor({ name }: { name?: string }) {
  const rivets = Array.from({ length: 32 }, (_, i) => (i / 32) * Math.PI * 2)
  const bolts = [0, 90, 180, 270]
  return (
    <div className="vg-vault" role="status" aria-live="polite">
      <div className="vg-vault-shake">
        <div className="vg-vault-frame">
          <svg viewBox="0 0 400 400" className="vg-vault-svg" aria-hidden="true">
            <defs>
              <radialGradient id="vd-steel" cx="42%" cy="36%" r="75%">
                <stop offset="0" stopColor="#f4f6f8" /><stop offset="0.45" stopColor="#b9c0c7" /><stop offset="0.8" stopColor="#7d858d" /><stop offset="1" stopColor="#4f555b" />
              </radialGradient>
              <radialGradient id="vd-hub" cx="40%" cy="35%" r="70%">
                <stop offset="0" stopColor="#ffffff" /><stop offset="0.5" stopColor="#aeb5bc" /><stop offset="1" stopColor="#555b61" />
              </radialGradient>
              <linearGradient id="vd-frame" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#3a3f45" /><stop offset="0.5" stopColor="#1c1f23" /><stop offset="1" stopColor="#2c3035" />
              </linearGradient>
              <linearGradient id="vd-bolt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#e9edf1" /><stop offset="1" stopColor="#7b838b" />
              </linearGradient>
              <linearGradient id="vd-sheen" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.7" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <clipPath id="vd-clip"><circle cx="200" cy="200" r="168" /></clipPath>
            </defs>
            {/* the shockwave when it locks */}
            <circle className="vd-shock" cx="200" cy="200" r="196" fill="none" stroke="#30d158" strokeWidth="3" />
            {/* the frame in the wall, and the bolts' sockets */}
            <circle cx="200" cy="200" r="196" fill="url(#vd-frame)" />
            <circle cx="200" cy="200" r="196" fill="none" stroke="#5c636a" strokeWidth="2" />
            {/* the bolts sit behind the door until they shoot out into the frame */}
            {bolts.map((deg, i) => (
              <g key={deg} transform={`rotate(${deg} 200 200)`}>
                <rect className="vd-bolt" x="184" y="6" width="32" height="52" rx="6" fill="url(#vd-bolt)" stroke="#4a5056" style={{ animationDelay: `${1.4 + i * 0.075}s` }} />
              </g>
            ))}
            <g className="vd-door">
              <circle cx="200" cy="200" r="170" fill="url(#vd-steel)" stroke="#3f454b" strokeWidth="3" />
              {/* brushed rings */}
              {[150, 132, 118].map(r => <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="1" />)}
              <circle cx="200" cy="200" r="128" fill="none" stroke="#5f666d" strokeWidth="6" />
              <circle cx="200" cy="200" r="128" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.2" transform="translate(-1 -1.5)" />
              {rivets.map((t, i) => <circle key={i} cx={200 + 156 * Math.cos(t)} cy={200 + 156 * Math.sin(t)} r="3.4" fill="url(#vd-hub)" stroke="#555b61" strokeWidth="0.8" />)}
              {/* the status ring: amber while locking, green once locked */}
              <circle className="vd-status" cx="200" cy="200" r="58" fill="none" strokeWidth="4" />
              {/* the wheel */}
              <g className="vd-wheel">
                {[0, 120, 240].map(deg => (
                  <g key={deg} transform={`rotate(${deg} 200 200)`}>
                    <rect x="194" y="92" width="12" height="108" rx="6" fill="url(#vd-hub)" stroke="#50565c" />
                    <circle cx="200" cy="92" r="13" fill="url(#vd-hub)" stroke="#50565c" strokeWidth="1.5" />
                  </g>
                ))}
                <circle cx="200" cy="200" r="34" fill="url(#vd-hub)" stroke="#4a5056" strokeWidth="2" />
                <circle cx="200" cy="200" r="12" fill="#2a2e33" />
              </g>
              {/* a light that runs across the steel once it locks */}
              <g clipPath="url(#vd-clip)"><rect className="vd-sheen" x="-120" y="-40" width="110" height="480" fill="url(#vd-sheen)" transform="rotate(20 200 200)" /></g>
            </g>
          </svg>
        </div>
        <div className="vg-vault-text">
          <p className="vg-vault-state"><span className="vg-vault-led" /> <span className="vg-vault-words"><span className="t-locking">Locking</span><span className="t-locked">Locked</span></span></p>
          <p className="vg-vault-sub">{name ? `See you soon, ${name}` : 'See you soon'}</p>
        </div>
      </div>
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
