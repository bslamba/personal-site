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
import { Power, Loader2, Check, SlidersHorizontal, Volume2, Sparkles, House, Wallet, Images, FolderLock, type LucideIcon } from 'lucide-react'
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

/** A concert-hall tail, made from decaying noise — no audio files involved. */
function hall(a: AudioContext, seconds = 3.6): ConvolverNode {
  const len = Math.floor(a.sampleRate * seconds), ir = a.createBuffer(2, len, a.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
  }
  const c = a.createConvolver(); c.buffer = ir
  return c
}

/**
 * Signing out: a harp sweeps up a D-major-9 arpeggio and lands on a warm,
 * golden bell chord over a soft low gong, with a few glints of light in the
 * air — all in a long, expensive-sounding hall.
 */
function royal(a: AudioContext) {
  const t0 = a.currentTime + 0.02
  // A gentle limiter at the end, so the chord blooms without ever clipping.
  const limit = a.createDynamicsCompressor()
  limit.threshold.value = -12; limit.knee.value = 8; limit.ratio.value = 10; limit.attack.value = 0.004; limit.release.value = 0.25
  limit.connect(a.destination)
  const master = a.createGain(); master.gain.value = 0.42; master.connect(limit)
  const wet = a.createGain(); wet.gain.value = 0.55
  const verb = hall(a); verb.connect(wet).connect(master)
  const bus = a.createGain(); bus.connect(master); bus.connect(verb)
  const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

  // 1. The harp: plucked strings, each ringing into the next.
  const harp = [62, 66, 69, 73, 76, 78, 81, 85, 86]            // D4 F#4 A4 C#5 E5 F#5 A5 C#6 D6
  harp.forEach((m, i) => {
    const at = t0 + i * 0.055
    for (const [type, mult, vol] of [['triangle', 1, 0.16], ['sine', 2, 0.05]] as const) {
      const o = a.createOscillator(), g = a.createGain(), lp = a.createBiquadFilter()
      o.type = type; o.frequency.value = hz(m) * mult
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(5200, at); lp.frequency.exponentialRampToValueAtTime(900, at + 1.2)
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + 1.4)
      o.connect(lp).connect(g).connect(bus); o.start(at); o.stop(at + 1.5)
    }
  })

  // 2. The bells: FM chimes on D major 9 — warm, round, and long.
  const land = t0 + harp.length * 0.055 + 0.04
  ;[74, 78, 81, 85, 88].forEach((m, i) => {
    const at = land + i * 0.018
    const car = a.createOscillator(), mod = a.createOscillator(), mg = a.createGain(), g = a.createGain()
    car.frequency.value = hz(m); mod.frequency.value = hz(m) * 3.5
    mg.gain.setValueAtTime(hz(m) * 2.2, at); mg.gain.exponentialRampToValueAtTime(hz(m) * 0.05, at + 2.2)
    mod.connect(mg).connect(car.frequency)
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.1, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + 3.4)
    car.connect(g).connect(bus)
    car.start(at); mod.start(at); car.stop(at + 3.5); mod.stop(at + 3.5)
  })

  // 3. A soft low gong beneath it, settling a touch as it sounds.
  for (const [mult, vol] of [[1, 0.22], [2.76, 0.05], [5.4, 0.02]]) {
    const o = a.createOscillator(), g = a.createGain()
    o.frequency.setValueAtTime(hz(38) * mult * 1.01, land); o.frequency.exponentialRampToValueAtTime(hz(38) * mult, land + 1.5)
    g.gain.setValueAtTime(0.0001, land); g.gain.exponentialRampToValueAtTime(vol, land + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, land + 3)
    o.connect(g).connect(bus); o.start(land); o.stop(land + 3.1)
  }

  // 4. Glints: a few high, bright sparkles as the chord blooms.
  for (let i = 0; i < 7; i++) {
    const at = land + 0.12 + i * 0.09 + Math.random() * 0.05
    const o = a.createOscillator(), g = a.createGain()
    o.frequency.value = hz(93 + [0, 4, 7, 11, 12, 16, 19][i])
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.025, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5)
    o.connect(g).connect(bus); o.start(at); o.stop(at + 0.55)
  }
}

/** click: any click anywhere in the vault · royal: signing out. */
export function sfx(kind: 'click' | 'royal') {
  const a = audio()
  if (!a) return
  if (kind === 'click') click(a)
  else royal(a)
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
    sfx('royal')
    setDown(true)
    document.querySelector('.vg')?.classList.add('vg-shutting')
    const req = fetch('/api/vault/logout', { method: 'POST' }).catch(() => undefined)
    // Long enough for the chord to bloom and the crest to seal; the last
    // part of it is the fade to black.
    await Promise.all([req, new Promise(r => setTimeout(r, motionOff() ? 150 : 2600))])
    // A full page load rather than a router push, so nothing from the
    // signed-in session survives in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/vault/login')
  }
  return (
    <>
      <button className="vg-power" onClick={go} disabled={down} aria-label="Sign out" title="Sign out">
        {down ? <Loader2 className="vg-spin" /> : <Power strokeWidth={2.6} />}
        <span className="vg-power-lbl">Sign out</span>
      </button>
      {down && typeof document !== 'undefined' && createPortal(<Farewell name={name} />, document.body)}
    </>
  )
}

/**
 * The farewell: the vault dims to a deep velvet dark, a gold seal draws
 * itself — two rings and the family's L — gold dust drifts out from it, and
 * the name is signed beneath before everything fades to black.
 */
function Farewell({ name }: { name?: string }) {
  // Gold dust: the same scatter every time, so nothing random runs in render.
  const dust = Array.from({ length: 26 }, (_, i) => {
    const angle = (i / 26) * 360 + (i % 3) * 7
    const dist = 90 + ((i * 37) % 70)
    return { angle, dist, delay: 0.55 + (i % 7) * 0.06, size: 2 + (i % 3) }
  })
  return (
    <div className="vg-farewell" role="status" aria-live="polite">
      <div className="vg-farewell-in">
        <div className="vg-seal">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <linearGradient id="vg-gold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#fff4c2" /><stop offset="0.35" stopColor="#e9c46a" />
                <stop offset="0.65" stopColor="#b8892b" /><stop offset="1" stopColor="#f5dc8a" />
              </linearGradient>
            </defs>
            <circle className="r1" cx="60" cy="60" r="54" />
            <circle className="r2" cx="60" cy="60" r="46" />
            {Array.from({ length: 24 }, (_, i) => <circle key={i} className="bead" cx={60 + 50 * Math.cos((i / 24) * Math.PI * 2)} cy={60 + 50 * Math.sin((i / 24) * Math.PI * 2)} r="1.1" style={{ animationDelay: `${0.5 + i * 0.012}s` }} />)}
          </svg>
          <span className={`vg-seal-l ${signature.className}`}>L</span>
          {dust.map((d, i) => (
            <span key={i} className="vg-dust" style={{ '--a': `${d.angle}deg`, '--d': `${d.dist}px`, '--s': `${d.size}px`, animationDelay: `${d.delay}s` } as React.CSSProperties} />
          ))}
        </div>
        <p className={`vg-farewell-kicker ${roman.className}`}>Until next time</p>
        {name && <p className={`vg-farewell-name ${signature.className}`}>{name}</p>}
        <p className={`vg-farewell-foot ${roman.className}`}>The vault is sealed</p>
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
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
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
