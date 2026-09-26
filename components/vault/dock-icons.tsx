'use client'

// ============================================================
// components/vault/dock-icons.tsx
//
// The Dock's app icons, drawn the way macOS draws its own: a continuous-
// curvature squircle, a lit gradient, a soft sheen across the top and a
// drop shadow beneath. The ones with a real counterpart are pictures, not
// symbols — Calendar shows today's date, Photos is the petal flower,
// Finance is a wallet of cards, Budget a target, Year a chart — and the
// rest are a bold symbol on an Apple system colour.
// ============================================================

import { useId, useSyncExternalStore } from 'react'
import {
  Scale, Landmark, Tag, PiggyBank, FileDown, BellRing, Settings, FolderClosed, User, type LucideIcon,
} from 'lucide-react'

// A superellipse, close to the shape of a macOS app icon.
const SQUIRCLE = 'M32 0C55.5 0 64 8.5 64 32S55.5 64 32 64 0 55.5 0 32 8.5 0 32 0Z'

function Frame({ from, to, children, glyph }: { from: string; to: string; children?: React.ReactNode; glyph?: React.ReactNode }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 64 64" className="vg-appicon" aria-hidden="true">
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={from} /><stop offset="1" stopColor={to} /></linearGradient>
        <linearGradient id={`sh${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.38" /><stop offset="0.5" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <clipPath id={`cl${id}`}><path d={SQUIRCLE} /></clipPath>
      </defs>
      <path d={SQUIRCLE} fill={`url(#bg${id})`} />
      <g clipPath={`url(#cl${id})`}>{children}</g>
      {glyph}
      <path d={SQUIRCLE} fill={`url(#sh${id})`} />
      <path d={SQUIRCLE} fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="1" />
    </svg>
  )
}

/** A lucide symbol, centred on the tile. */
const sym = (I: LucideIcon, color = '#fff', size = 34) => (
  <I x={(64 - size) / 2} y={(64 - size) / 2} width={size} height={size} color={color} strokeWidth={2.1} />
)

const tick = (cb: () => void) => { const t = setInterval(cb, 60_000); return () => clearInterval(t) }

function CalendarIcon() {
  // Today's date, like the real Calendar icon — rendered in the browser only.
  const day = useSyncExternalStore(tick, () => new Date().toDateString(), () => '')
  const d = day ? new Date(day) : null
  return (
    <Frame from="#ffffff" to="#e9e9ee">
      <text x="32" y="19" textAnchor="middle" fontSize="11" fontWeight="700" fill="#ff3b30" fontFamily="-apple-system, system-ui, sans-serif" letterSpacing="0.5">
        {d ? d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase() : ''}
      </text>
      <text x="32" y="50" textAnchor="middle" fontSize="31" fontWeight="300" fill="#1c1c1e" fontFamily="-apple-system, system-ui, sans-serif">{d ? d.getDate() : ''}</text>
    </Frame>
  )
}

function ChartIcon() {
  const bars: [number, number, string][] = [[12, 26, '#34c759'], [23, 16, '#0a84ff'], [34, 30, '#ff9f0a'], [45, 10, '#ff375f']]
  return (
    <Frame from="#ffffff" to="#eceef2">
      <line x1="9" y1="50" x2="55" y2="50" stroke="#c7c7cc" strokeWidth="1.5" />
      {bars.map(([x, y, c]) => <rect key={x} x={x} y={y} width="8" height={50 - y} rx="2" fill={c} />)}
    </Frame>
  )
}

function TargetIcon() {
  return (
    <Frame from="#ffffff" to="#eef0f4">
      {[22, 16, 10, 4.5].map((r, i) => <circle key={r} cx="32" cy="33" r={r} fill={i % 2 ? '#fff' : '#ff3b30'} />)}
      <line x1="33" y1="32" x2="50" y2="15" stroke="#1c1c1e" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M47 12l6 1-1 6" fill="none" stroke="#1c1c1e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  )
}

function PhotosIcon() {
  const petals = ['#ff9f0a', '#ffd60a', '#a4d65e', '#34c759', '#30b0c7', '#5e5ce6', '#bf5af2', '#ff375f']
  return (
    <Frame from="#ffffff" to="#f2f2f7">
      {petals.map((c, i) => (
        <ellipse key={c} cx="32" cy="20" rx="7.5" ry="12" fill={c} opacity="0.85" style={{ mixBlendMode: 'multiply' }} transform={`rotate(${i * 45} 32 32)`} />
      ))}
    </Frame>
  )
}

function WalletIcon() {
  return (
    <Frame from="#3a3a3c" to="#0c0c0e">
      <rect x="11" y="12" width="42" height="14" rx="4" fill="#0a84ff" />
      <rect x="11" y="18" width="42" height="14" rx="4" fill="#ffd60a" />
      <rect x="11" y="24" width="42" height="14" rx="4" fill="#ff453a" />
      <rect x="11" y="30" width="42" height="14" rx="4" fill="#30d158" />
      <path d="M8 36h48v14a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6Z" fill="#1c1c1e" />
      <path d="M8 36h48" stroke="#48484a" strokeWidth="1.2" />
    </Frame>
  )
}

function LaunchpadIcon() {
  const dots = ['#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f']
  return (
    <Frame from="#8e8e93" to="#48484a">
      {dots.map((c, i) => <rect key={c} x={14 + (i % 3) * 13} y={14 + Math.floor(i / 3) * 13} width="10" height="10" rx="3" fill={c} />)}
    </Frame>
  )
}

function ContactsIcon() {
  return (
    <Frame from="#d8c3a5" to="#a88a64">
      <rect x="12" y="10" width="40" height="44" rx="5" fill="#f7f1e8" />
      <rect x="12" y="10" width="6" height="44" rx="3" fill="#8e6e4a" />
      <circle cx="35" cy="27" r="7" fill="#8e8e93" />
      <path d="M23 46c1.5-7 6.5-10 12-10s10.5 3 12 10Z" fill="#8e8e93" />
    </Frame>
  )
}

function SettingsIcon() {
  return <Frame from="#d1d1d6" to="#8e8e93" glyph={sym(Settings, '#3a3a3c', 38)} />
}

/** The icon for a Dock item, by id. */
export function AppIcon({ id }: { id: string }) {
  switch (id) {
    case 'month': return <CalendarIcon />
    case 'year': return <ChartIcon />
    case 'setup': return <TargetIcon />
    case 'photos': return <PhotosIcon />
    case 'finance': return <WalletIcon />
    case 'home': return <LaunchpadIcon />
    case 'access': return <ContactsIcon />
    case 'entities': return <SettingsIcon />
    case 'settle': return <Frame from="#5fe07d" to="#1f9e44" glyph={sym(Scale)} />
    case 'loans': return <Frame from="#5aa9ff" to="#0a60d6" glyph={sym(Landmark)} />
    case 'tags': return <Frame from="#ffc15a" to="#ff8a00" glyph={sym(Tag)} />
    case 'savings': return <Frame from="#ff8fb1" to="#ff2d6f" glyph={sym(PiggyBank)} />
    case 'import': return <Frame from="#6ee7ff" to="#0a8fd6" glyph={sym(FileDown)} />
    case 'approvals': return <Frame from="#ff7a6e" to="#e0281c" glyph={sym(BellRing)} />
    case 'files': return <Frame from="#6cc6ff" to="#2f6fe0" glyph={sym(FolderClosed)} />
    default: return <Frame from="#9aa6ff" to="#5b6cff" glyph={sym(User)} />
  }
}
