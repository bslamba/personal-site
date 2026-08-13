'use client'

// ============================================================
// components/tools/panel.tsx
//
// Shared dashboard furniture: one table shape used by every panel
// on every tool, so column headers are impossible to forget and
// sorting behaves the same everywhere.
//
// The important detail is `sort`. Several cells are React elements
// carrying conditional colour, and an element cannot be compared —
// stringifying one gives "[object Object]", which makes every row
// equal and sorting silently do nothing. So each row supplies
// explicit sort keys alongside its display cells, and the field is
// required rather than optional: a panel that forgets it fails to
// compile instead of failing quietly in the browser.
// ============================================================

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react'

// ------------------------------------------------------------
// formatting, shared by every tool
// ------------------------------------------------------------
export const n = (v: number) => Math.round(v).toLocaleString()
export const pc = (v: number, d = 1) => (v * 100).toFixed(d) + '%'
export const ms = (v: number) =>
  v >= 10 ? Math.round(v).toLocaleString() + 'ms' : v.toFixed(2) + 'ms'

export function duration(msTotal: number): string {
  const s = Math.round(msTotal / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

export function clock(t: number): string {
  const d = new Date(t)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

export function stamp(t: number): string {
  const d = new Date(t)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getUTCDate())} ${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })} ` +
         `${d.getUTCFullYear()}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

export const bytes = (v: number) =>
  v > 1024 * 1024 ? `${(v / 1024 / 1024).toFixed(1)} MB` : `${Math.round(v / 1024)} KB`

export const rateTone = (r: number) =>
  r > 0.15 ? 'text-signal-500 font-bold'
    : r > 0.08 ? 'text-[#B45309] font-bold'
    : 'text-ink-400'

// ------------------------------------------------------------
// model
// ------------------------------------------------------------

export interface Column {
  head: string
  align: 'left' | 'right'
  /** tailwind width class; the first column takes the remainder */
  width?: string
}

export interface PanelRow {
  id: string
  /** 0–1, drives the grey volume bar behind the row */
  bar?: number
  /** 0–1 of that bar which is failure, drawn in red */
  barFail?: number
  cells: React.ReactNode[]
  /** sort keys, parallel to cells — see the note at the top */
  sort: (number | string)[]
  onClick?: () => void
}

export interface PanelData {
  title: string
  note?: string
  columns: Column[]
  rows: PanelRow[]
  empty?: React.ReactNode
}

export const PREVIEW_ROWS = 6

// ------------------------------------------------------------
// pieces
// ------------------------------------------------------------

export function Row({ row, columns, dense }: {
  row: PanelRow; columns: Column[]; dense: boolean
}) {
  const clickable = Boolean(row.onClick)
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={row.onClick}
      onKeyDown={e => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); row.onClick!() }
      }}
      className={`lg-row relative flex items-center gap-2 ${
        dense ? 'px-2.5 py-[6px]' : 'px-3 py-2'
      } ${clickable ? 'cursor-pointer' : ''}`}
    >
      {row.bar !== undefined && (
        <>
          {/* The volume bar is a gradient that fades out rather than a
              flat block that stops. A hard right edge reads as a
              second column and competes with the number beside it. */}
          <span className="pointer-events-none absolute inset-y-0 left-0 rounded-[12px]"
                style={{
                  width: `${Math.min(100, row.bar * 100)}%`,
                  background: 'linear-gradient(90deg, rgba(255,255,255,.13), rgba(255,255,255,.02))',
                }} aria-hidden="true" />
          {row.barFail !== undefined && row.barFail > 0 && (
            <span className="pointer-events-none absolute inset-y-0 left-0 rounded-[12px]"
                  style={{
                    width: `${Math.min(100, row.bar * row.barFail * 100)}%`,
                    background: 'linear-gradient(90deg, rgba(255,143,163,.30), rgba(255,143,163,.05))',
                  }} aria-hidden="true" />
          )}
        </>
      )}
      {columns.map((c, i) => (
        <span
          key={i}
          className={`relative ${i === 0 ? 'min-w-0 flex-1 truncate' : `shrink-0 ${c.width ?? 'w-16'}`} ${
            c.align === 'right' ? 'text-right' : ''
          } ${dense ? 'text-[11.5px]' : 'text-[13px]'} ${
            i === 0 ? 'text-ink-900' : 'lg-num text-ink-700'
          }`}
          title={i === 0 && typeof row.cells[0] === 'string' ? row.cells[0] : undefined}
        >
          {row.cells[i]}
        </span>
      ))}
    </div>
  )
}

function Headers({ columns, dense }: { columns: Column[]; dense: boolean }) {
  return (
    <div className={`lg-rowhead mb-0.5 flex items-center gap-2 ${
      dense ? 'px-2.5 py-1.5' : 'px-3 py-2'
    }`}>
      {columns.map((c, i) => (
        <span
          key={i}
          className={`${i === 0 ? 'min-w-0 flex-1' : `shrink-0 ${c.width ?? 'w-16'}`} ${
            c.align === 'right' ? 'text-right' : ''
          } text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-500`}
        >
          {c.head}
        </span>
      ))}
    </div>
  )
}

export function Panel({ data, onExpand, accent = '#0077BB' }: {
  data: PanelData; onExpand: (d: PanelData) => void; accent?: string
}) {
  const shown = data.rows.slice(0, PREVIEW_ROWS)
  const more = data.rows.length - shown.length

  return (
    <section className="lg-card lg-rise flex flex-col p-3"
             style={{ '--accent': accent } as React.CSSProperties}>
      <header className="px-1 pb-2 pt-0.5">
        <h3 className="lg-title text-[13px] font-bold leading-tight"
            style={{ letterSpacing: '-0.005em' }}>
          {data.title}
        </h3>
        {data.note && <p className="mt-0.5 text-[10.5px] leading-snug text-ink-500">{data.note}</p>}
      </header>

      {data.rows.length === 0 ? (
        <div className="flex-1 px-1 py-5 text-[11px] leading-relaxed text-ink-400">
          {data.empty ?? 'Not populated in this export.'}
        </div>
      ) : (
        <>
          <Headers columns={data.columns} dense />
          <div className="flex-1">
            {shown.map(r => <Row key={r.id} row={r} columns={data.columns} dense />)}
          </div>
        </>
      )}

      <footer className="mt-2 flex items-center justify-between gap-2 px-1">
        <span className="lg-num text-[10px] text-ink-400">
          {data.rows.length > 0 ? `${n(data.rows.length)} row${data.rows.length === 1 ? '' : 's'}` : ''}
        </span>
        {data.rows.length > 0 && (
          <button
            onClick={() => onExpand(data)}
            className="lg-pill px-3 py-1 text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-700"
          >
            {more > 0 ? `${n(more)} more` : 'Open'}
          </button>
        )}
      </footer>
    </section>
  )
}

/** Full-screen view of one panel: every row, searchable and sortable. */
export function DetailView({ data, onClose, accent = '#5AC8FA' }: {
  data: PanelData; onClose: () => void; accent?: string
}) {
  // The sheet is rendered outside the sky wrapper, deliberately —
  // an ancestor stacking context would trap it under the site
  // header. So it carries its own data-sky and picks up the same
  // palette variables independently.
  const sky = useSkyPhase()
  const [q, setQ] = useState('')
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [desc, setDesc] = useState(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const rows = useMemo(() => {
    let list = data.rows
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      list = list.filter(r => String(r.sort[0] ?? '').toLowerCase().includes(needle))
    }
    if (sortCol !== null) {
      list = [...list].sort((a, b) => {
        const av = a.sort[sortCol]
        const bv = b.sort[sortCol]
        let cmp: number
        if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
        else cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true })
        return desc ? -cmp : cmp
      })
    }
    return list
  }, [data.rows, q, sortCol, desc])

  return (
    <div className="lg-scrim fixed inset-0 z-[120] flex items-start justify-center p-3 sm:p-8"
         data-sky={sky}
         onClick={onClose} role="dialog" aria-modal="true" aria-label={data.title}>
      {/* The sheet must own its own style block: it is portalled to
          the page root and may open from a section that never
          rendered WidgetStyles. */}
      <WidgetStyles />

      <div className="lg-sheet flex max-h-full w-full max-w-5xl flex-col overflow-hidden"
           style={{ '--accent': accent } as React.CSSProperties}
           onClick={e => e.stopPropagation()}>

        <header className="flex items-start justify-between gap-4 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-ink-950"
                style={{ letterSpacing: '-0.008em' }}>
              {data.title}
            </h3>
            {data.note && <p className="mt-1 text-xs leading-relaxed text-ink-600">{data.note}</p>}
          </div>
          {/* A round glass button, the size iOS uses for a sheet
              dismiss — 30px is below the 44px touch target, so the
              hit area is padded out rather than the glyph enlarged. */}
          <button onClick={onClose} aria-label="Close"
                  className="lg-pill grid h-8 w-8 shrink-0 place-items-center text-[15px]
                             leading-none text-ink-600">
            ✕
          </button>
        </header>

        <div className="flex items-center gap-3 px-5 pb-3">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Filter these rows…"
            className="lg-field w-full px-3.5 py-1.5 text-xs text-ink-900 outline-none
                       placeholder:text-ink-400"
          />
          <span className="lg-num shrink-0 font-mono text-[11px] text-ink-500">
            {n(rows.length)}
          </span>
        </div>

        <div className="overflow-y-auto px-3 pb-4">
          <div className="lg-rowhead sticky top-0 z-10 mb-1 flex items-center gap-2 px-3 py-2">
            {data.columns.map((c, i) => (
              <button
                key={i}
                onClick={() => {
                  if (sortCol === i) setDesc(d => !d)
                  else { setSortCol(i); setDesc(true) }
                }}
                title={`Sort by ${c.head}`}
                className={`${i === 0 ? 'min-w-0 flex-1' : `shrink-0 ${c.width ?? 'w-16'}`} ${
                  c.align === 'right' ? 'text-right' : 'text-left'
                } text-[9.5px] font-bold uppercase tracking-[0.09em] transition-colors ${
                  sortCol === i ? 'text-ink-950' : 'text-ink-500 hover:text-ink-800'
                }`}
              >
                {c.head}
                <span className={sortCol === i ? 'text-signal-500' : 'text-ink-300'}>
                  {sortCol === i ? (desc ? ' ↓' : ' ↑') : ' ⇅'}
                </span>
              </button>
            ))}
          </div>
          {rows.map(r => <Row key={r.id} row={r} columns={data.columns} dense={false} />)}
        </div>
      </div>
    </div>
  )
}

export function Kpi({ label, value, sub, tone = 'ink' }: {
  label: string; value: string; sub?: string; tone?: 'ink' | 'red' | 'green'
}) {
  const colour = tone === 'red' ? 'text-[#FF8FA3]'
    : tone === 'green' ? 'text-[#7FE3C4]' : 'text-[#F0F2F7]'
  const accent = tone === 'red' ? '#FF8FA3' : tone === 'green' ? '#7FE3C4' : '#A8BEFF'
  return (
    <div className="lg-card lg-rise px-3 py-2.5"
         style={{ '--accent': accent } as React.CSSProperties}>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-500">{label}</div>
      <div className={`lg-num mt-1 text-[1.35rem] font-bold leading-none ${colour}`}
           style={{ letterSpacing: '-0.01em' }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[10px] leading-snug text-ink-500">{sub}</div>}
    </div>
  )
}

// ------------------------------------------------------------
// charts
//
// All hand-drawn SVG rather than a charting library. Three
// reasons: the palette stays exactly on-brand, there is no
// runtime dependency to load before a chart appears, and the
// shapes can be tuned to the data rather than the reverse.
// ------------------------------------------------------------

/**
 * A red-through-graphite ramp. Deliberately not a rainbow —
 * categorical colour should still read as one design, and the
 * eye ranks these in order, which suits ranked data.
 */
/**
 * A ranked ramp for a dark surface: warm and bright at the top,
 * cooling and dimming down the list. Every value is light, because
 * on a near-black ground a dark swatch is not "low", it is absent.
 */
export const SERIES_COLOURS = [
  '#FF8FA3', '#FFA98F', '#FFC48E', '#FFDD9B', '#E9E3AE',
  '#C9CEDA', '#AAB1BF', '#8C94A4', '#727A8B', '#5B6373',
]

/**
 * Twelve identities that stay distinct — including under the two
 * common forms of colour blindness.
 *
 * The ramp above is right for ranked data, where the eye is meant
 * to read order. It is wrong for nodes: `vcolofrnkf-psn02` is not
 * "more" than `vcolochicg-psn01`, and five shades of the same red
 * are indistinguishable once eleven of them share a legend.
 *
 * These are drawn from Paul Tol's vibrant, bright and muted
 * schemes (SRON), which are built specifically so that no two
 * colours collapse together in green-blind or red-blind vision —
 * roughly one man in twelve. Vibrant leads because it was designed
 * for screen data display; bright and muted fill out the set.
 *
 * Honest caveat: Tol designs and tests each scheme as a unit and
 * recommends the discrete rainbow past nine colours. Mixing three
 * schemes to reach twelve is my choice, not his, and the last few
 * are the least separated. Node twelve onwards wraps and reuses.
 */
/** Bright, on the night and sunset skies. */
export const NIGHT_INKS = [
  '#5AC8FA', '#4FE3B4', '#FFD24F', '#FF7A93', '#B78BFF', '#7FDD52',
  '#FF9B4A', '#4FE6E6', '#FF85D6', '#D6E552', '#8AA5FF', '#FF7A5A',
]

export const SUNSET_INKS = [
  '#FFD98E', '#FFAE6B', '#FF8FA3', '#C9B4FF', '#7FE0E0', '#A8E86B',
  '#FF8AD0', '#FFCFA8', '#9FB6FF', '#FF8A6B', '#E4E88A', '#66C8F5',
]

/**
 * Dark and saturated, for the daytime sky.
 *
 * The pastels above would disappear on a pale blue ground — this
 * is the whole reason there are three palettes rather than one
 * with an opacity tweak. Contrast has to be re-earned against each
 * background, not scaled.
 */
export const DAY_INKS = [
  '#0B6FC4', '#00796B', '#C2540B', '#C2185B', '#5333A8', '#2E7D32',
  '#0369A1', '#00695C', '#A3145A', '#3F2C9E', '#B85A00', '#243B8F',
]

/** Kept for callers that just want a stable list. */
export const NODE_COLOURS = NIGHT_INKS
export const nodeColour = (i: number) => NIGHT_INKS[i % NIGHT_INKS.length]

/*
  Alerts are CSS variables rather than literals so one set of
  markup can serve three skies. Anywhere these are blended with
  transparency, use color-mix — the old `${colour}33` hex-alpha
  trick silently produces garbage when the value is a var().
*/
export const ALERT_HIGH = 'var(--alert-high)'
export const ALERT_MED = 'var(--alert-med)'
export const DIM = 'var(--dim)'
export const softTint = (c: string, pct: number) =>
  `color-mix(in srgb, ${c} ${pct}%, transparent)`

export type SkyPhase = 'day' | 'sunset' | 'night'

export function phaseAt(d: Date = new Date()): SkyPhase {
  const h = d.getHours()
  if (h >= 6 && h < 16) return 'day'
  if (h >= 16 && h < 19) return 'sunset'
  return 'night'
}

/*
  One store, not one hook per component.

  The sky is read by the backdrop, the toggle, the palette and the
  modal — all in different subtrees. If each ran its own timer and
  its own state they would drift apart, and the toggle could never
  reach the others at all. A module-level store with
  useSyncExternalStore keeps every reader on the same value and
  gives React an explicit server snapshot, which is what makes the
  hydration behaviour predictable rather than lucky.
*/
let _override: SkyPhase | null = null
let _clock: SkyPhase = 'night'
let _timer: number | null = null
const _subs = new Set<() => void>()
const _emit = () => _subs.forEach(f => f())

function _subscribe(f: () => void) {
  _subs.add(f)
  if (_subs.size === 1) {
    _clock = phaseAt()
    _timer = window.setInterval(() => {
      const next = phaseAt()
      if (next !== _clock) { _clock = next; _emit() }
    }, 60_000)
    // The first read happens during hydration and must still say
    // 'night' to match the server; correct it on the next tick.
    queueMicrotask(_emit)
  }
  return () => {
    _subs.delete(f)
    if (_subs.size === 0 && _timer !== null) {
      window.clearInterval(_timer); _timer = null
    }
  }
}

const _snapshot = (): SkyPhase => _override ?? _clock
const _serverSnapshot = (): SkyPhase => 'night'

/** null puts the sky back on the clock. */
export function setSkyOverride(p: SkyPhase | null) { _override = p; _emit() }
export function getSkyOverride() { return _override }

export function useSkyPhase(): SkyPhase {
  return useSyncExternalStore(_subscribe, _snapshot, _serverSnapshot)
}

/** Auto / Day / Sunset / Night, as a segmented glass pill. */
export function SkyToggle({ className = '' }: { className?: string }) {
  const phase = useSkyPhase()
  const [override, setOv] = useState<SkyPhase | null>(null)
  useEffect(() => { setOv(getSkyOverride()) }, [])

  const choose = (p: SkyPhase | null) => { setSkyOverride(p); setOv(p) }
  const opts: Array<{ id: SkyPhase | null; label: string; glyph: string }> = [
    { id: null,     label: 'Auto',   glyph: '◐' },
    { id: 'day',    label: 'Day',    glyph: '☀' },
    { id: 'sunset', label: 'Sunset', glyph: '◑' },
    { id: 'night',  label: 'Night',  glyph: '☾' },
  ]

  return (
    <div className={`lg-pill inline-flex items-center gap-0.5 p-0.5 ${className}`}
         role="group" aria-label="Sky">
      {opts.map(o => {
        const on = override === o.id
        return (
          <button
            key={o.label}
            onClick={() => choose(o.id)}
            aria-pressed={on}
            title={o.id === null ? `Follow the clock (now ${phase})` : o.label}
            className={`rounded-full px-2.5 py-[3px] text-[10px] font-bold uppercase
                        tracking-[0.08em] transition-colors ${
              on ? 'text-ink-950' : 'text-ink-500 hover:text-ink-800'
            }`}
            style={on ? { background: 'var(--rim)' } : undefined}
          >
            <span aria-hidden="true" className="mr-1">{o.glyph}</span>{o.label}
          </button>
        )
      })}
    </div>
  )
}

export function useInkPalette(): string[] {
  const phase = useSkyPhase()
  return phase === 'day' ? DAY_INKS : phase === 'sunset' ? SUNSET_INKS : NIGHT_INKS
}

/**
 * Rotates the palette by a random amount, once, after mount, so
 * the deck deals differently each load and no node is permanently
 * "the blue one". Same hydration rule as above: the shift happens
 * in an effect, never during render.
 */
export function useInkRotation() {
  const palette = useInkPalette()
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    setOffset(Math.floor(Math.random() * 12))
  }, [])
  return (i: number) => palette[(i + offset) % palette.length]
}

export interface Slice { label: string; value: number }

/**
 * Donut with the total in the middle.
 *
 * Drawn with stroke-dasharray on circles rather than arc paths —
 * far less arithmetic, no rounding seams between segments, and
 * it animates cleanly if that is ever wanted.
 */
export function Donut({ slices, total, centreLabel, centreValue, size = 168,
                       colours = SERIES_COLOURS }: {
  slices: Slice[]
  total?: number
  centreLabel?: string
  centreValue?: string
  size?: number
  colours?: string[]
}) {
  const sum = total ?? slices.reduce((a, s) => a + s.value, 0)
  if (!sum) return null

  const stroke = size * 0.17
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  let offset = 0

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0"
           role="img" aria-label={centreLabel ?? 'Breakdown'}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke="var(--hair-soft)" strokeWidth={stroke} />
        {slices.map((s, i) => {
          const frac = s.value / sum
          const dash = `${c * frac} ${c * (1 - frac)}`
          const el = (
            <circle
              key={s.label}
              cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={colours[i % colours.length]}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )
          offset += c * frac
          return el
        })}
        {(centreValue || centreLabel) && (
          <>
            <text x={size / 2} y={size / 2 - 2} textAnchor="middle"
                  fontSize={size * 0.16} fontWeight="700" fill="#08080A">
              {centreValue}
            </text>
            <text x={size / 2} y={size / 2 + 16} textAnchor="middle"
                  fontSize={size * 0.072} fill="#8A8A93">
              {centreLabel}
            </text>
          </>
        )}
      </svg>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2 text-[11px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: colours[i % colours.length] }} />
            <span className="min-w-0 flex-1 truncate text-ink-700" title={s.label}>{s.label}</span>
            <span className="shrink-0 font-mono text-ink-500">{n(s.value)}</span>
            <span className="w-11 shrink-0 text-right font-mono text-ink-400">
              {pc(s.value / sum)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface Series { label: string; values: (number | null)[] }

/**
 * Several series over a shared axis.
 *
 * `emphasise` is the important argument. Past about five lines a
 * multi-series chart becomes unreadable no matter how the colours
 * are chosen — every line crosses every other and the eye has
 * nothing to hold. So the named series are drawn in colour with
 * markers, and everything else recedes to thin grey context.
 * The exceptions stay legible; the rest still show the envelope
 * they sit inside.
 */
export function MultiLine({ labels, series, unit = '', height = 240, emphasise,
                           colours = SERIES_COLOURS, colourOf }: {
  labels: string[]
  series: Series[]
  unit?: string
  height?: number
  emphasise?: string[]
  colours?: string[]
  /** Overrides `colours` — lets a caller keep one colour per node
      across every chart on the page, rather than per chart. */
  colourOf?: (label: string) => string
}) {
  if (labels.length < 2 || series.length === 0) return null

  const W = 1200, padL = 46, padR = 16, padT = 12, padB = 26
  const H = height
  const iw = W - padL - padR, ih = H - padT - padB
  const all = series.flatMap(s => s.values).filter((v): v is number => v !== null)
  const max = Math.max(1, ...all)
  const x = (i: number) => padL + (labels.length === 1 ? 0 : (i * iw) / (labels.length - 1))
  const y = (v: number) => padT + ih - (v / max) * ih
  const step = Math.max(1, Math.ceil(labels.length / 8))

  const isHot = (label: string) => !emphasise || emphasise.includes(label)
  const hot = series.filter(s => isHot(s.label))
  const cold = series.filter(s => !isHot(s.label))
  const path = (s: Series) => {
    let d = ''
    s.values.forEach((v, i) => {
      if (v === null) return
      d += `${d === '' ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
    })
    return d
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Series over time">
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={padL} x2={W - padR} y1={padT + ih * f} y2={padT + ih * f}
                  stroke="var(--hair-soft)" strokeWidth="1" />
            <text x={padL - 7} y={padT + ih * f + 3.5} textAnchor="end" fontSize="9" fill="var(--dim)"
                  className="lg-num">
              {Math.round(max * (1 - f))}
            </text>
          </g>
        ))}

        {/* context first, so the highlighted lines sit on top */}
        {cold.map(s => (
          <path key={s.label} d={path(s)} fill="none" stroke="var(--hair-strong)" strokeWidth="1"
                strokeLinejoin="round" />
        ))}

        {hot.map((s, si) => {
          const colour = colourOf ? colourOf(s.label) : colours[si % colours.length]
          return (
            <g key={s.label}>
              <path d={path(s)} fill="none" stroke={colour} strokeWidth="1.9"
                    strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => v === null ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r="2" fill={colour} />
              ))}
            </g>
          )
        })}

        {labels.map((l, i) => i % step === 0 || i === labels.length - 1 ? (
          <text key={i} x={x(i)} y={H - 7} textAnchor="middle" fontSize="9" fill="var(--dim)"
                className="lg-num">{l}</text>
        ) : null)}
      </svg>

      <ul className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1">
        {hot.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1.5 text-[10.5px] text-ink-700">
            <span className="h-1.5 w-4 rounded-full"
                  style={{ background: colourOf ? colourOf(s.label) : colours[i % colours.length] }} />
            {s.label}
          </li>
        ))}
        {cold.length > 0 && (
          <li className="flex items-center gap-1.5 text-[10.5px] text-ink-400">
            <span className="h-1.5 w-4 rounded-full" style={{ background: 'var(--hair-strong)' }} />
            {cold.length} other node{cold.length === 1 ? '' : 's'}
          </li>
        )}
      </ul>
      {unit && <p className="mt-1 text-[9.5px] text-ink-400">Measured in {unit}.</p>}
    </div>
  )
}

/**
 * A small chart meant to be repeated — one per node, all sharing a
 * scale passed in from outside so that height means the same thing
 * in every copy. Comparability is the entire point; a sparkline
 * scaled to its own maximum is decorative rather than informative.
 */
export function Sparkline({ values, max, colour = '#D3002D', height = 34, showPeak = true }: {
  values: (number | null)[]
  max: number
  colour?: string
  height?: number
  showPeak?: boolean
}) {
  const points = values.filter((v): v is number => v !== null)
  if (points.length < 2) return null

  const W = 200, H = height, pad = 3
  const ih = H - pad * 2
  const top = Math.max(1, max)
  const x = (i: number) => (i / (values.length - 1)) * W
  const y = (v: number) => pad + ih - (v / top) * ih

  let line = ''
  values.forEach((v, i) => {
    if (v === null) return
    line += `${line === '' ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
  })
  const area = `${line} L${W},${H} L0,${H} Z`

  const peakValue = Math.max(...points)
  const peakIndex = values.findIndex(v => v === peakValue)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
         className="w-full" style={{ height }} aria-hidden="true">
      <path d={area} fill={colour} opacity="0.20" />
      <path d={line} fill="none" stroke={colour} strokeWidth="1.4"
            vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {/*
        The peak is a vertical tick, not a dot. This viewBox is
        stretched horizontally to fill the card, so a circle would
        render as a flattened ellipse. A line with a non-scaling
        stroke keeps its width whatever the scaling does, and it
        also shows *when* the peak happened — which a dot sitting on
        the curve conveys poorly at 26 pixels tall.
      */}
      {showPeak && peakIndex >= 0 && peakValue > 0 && (
        <line x1={x(peakIndex)} x2={x(peakIndex)} y1={y(peakValue)} y2={H}
              stroke={colour} strokeWidth="1" opacity="0.4"
              vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  )
}

// ------------------------------------------------------------
// liquid gauge
// ------------------------------------------------------------

/**
 * A percentage drawn as a sphere filling with liquid.
 *
 * Two sine waves drift across a circular clip at different speeds
 * and in opposite directions, which is what stops the surface
 * reading as a repeating loop. The waterline is the value; nothing
 * else encodes it, so the number is printed over the top as well —
 * a gauge that can only be read approximately is decoration, and
 * "memory is somewhere near three quarters" is not a thing anyone
 * can put in a change record.
 *
 * The path is 400 units wide across a 100-unit viewBox and shifts
 * by exactly two wave periods, so the loop closes seamlessly
 * instead of snapping back.
 */
export function LiquidGauge({
  value, max = 100, colour = '#5AC8FA', size = 118, unit = '%', caption, alert = false,
}: {
  value: number
  max?: number
  colour?: string
  size?: number
  unit?: string
  caption?: string
  alert?: boolean
}) {
  // useId gives SSR-stable ids; the colons it contains are not
  // valid in a url(#…) reference, hence the strip.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const level = 100 - frac * 100

  const wave = (amp: number) => {
    let d = `M0,${level.toFixed(2)}`
    for (let i = 0; i < 8; i++) d += ` q12.5,${-amp} 25,0 q12.5,${amp} 25,0`
    return `${d} L400,112 L0,112 Z`
  }

  const shown = value >= 100 ? Math.round(value).toString()
    : value >= 10 ? value.toFixed(0)
    : value.toFixed(1)

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 100 100" role="img"
           aria-label={`${caption ?? 'Value'}: ${shown}${unit}`}>
        <defs>
          <clipPath id={`lgc${uid}`}><circle cx="50" cy="50" r="45" /></clipPath>
          {/* Bubbles are clipped to the liquid as well as the
              sphere, so they never appear rising through air above
              a half-empty gauge. */}
          <clipPath id={`lgw${uid}`}>
            <rect x="0" y={Math.max(0, level - 2)} width="100" height={110 - level} />
          </clipPath>
          <radialGradient id={`lgg${uid}`} cx="34%" cy="26%" r="72%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#0A1622" stopOpacity="0.14" />
          </radialGradient>
          <linearGradient id={`lgl${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colour} stopOpacity="0.95" />
            <stop offset="100%" stopColor={colour} stopOpacity="0.60" />
          </linearGradient>
        </defs>

        {/* The sphere is white in every sky. It is the one element
            that does not follow the ground, which is exactly why it
            works: a white disc reads as an instrument face, and it
            gives the black number a fixed contrast that never has
            to be renegotiated when the sky changes. */}
        <circle cx="50" cy="50" r="45" fill="#FFFFFF" fillOpacity="0.94" />
        <circle cx="50" cy="50" r="45" fill="none"
                stroke="rgba(16,28,44,.16)" strokeWidth="1" />

        <g clipPath={`url(#lgc${uid})`}>
          <g className="lg-bob">
            <path className="lg-wave lg-wave-back" d={wave(2.4)} fill={colour} opacity="0.42" />
            <path className="lg-wave lg-wave-mid"  d={wave(3.6)} fill={colour} opacity="0.55" />
            <path className="lg-wave" d={wave(3.0)} fill={`url(#lgl${uid})`} />
            {/* a lit crest on the front wave — the single detail
                that makes the surface look wet rather than filled */}
            <path className="lg-wave" d={wave(3.0)} fill="none"
                  stroke="#FFFFFF" strokeOpacity="0.75" strokeWidth="0.9" />
          </g>

          <g clipPath={`url(#lgw${uid})`}>
            {[
              { cx: 33, cy: 92, r: 1.5, d: '0s',   dur: '6s' },
              { cx: 58, cy: 96, r: 2.1, d: '1.7s', dur: '7.2s' },
              { cx: 71, cy: 90, r: 1.2, d: '3.4s', dur: '5.4s' },
              { cx: 45, cy: 98, r: 1.7, d: '4.6s', dur: '8s' },
            ].map((b, k) => (
              <circle key={k} className="lg-bubble" cx={b.cx} cy={b.cy} r={b.r}
                      fill="#FFFFFF" fillOpacity="0.55"
                      style={{ animationDelay: b.d, animationDuration: b.dur }} />
            ))}
          </g>
        </g>

        {/* glass: specular highlight top-left, faint occlusion bottom-right */}
        <circle cx="50" cy="50" r="45" fill={`url(#lgg${uid})`} />
        <circle cx="50" cy="50" r="45" fill="none" strokeWidth="1.6"
                stroke={alert ? ALERT_HIGH : colour} strokeOpacity={alert ? 0.95 : 0.5} />

        {/* No stroke on the glyphs. An outlined letterform is a
            crutch for text over an unpredictable background, and it
            always looks like one — the edges go furry and the
            counters fill in at small sizes. On a white face the
            halo is unnecessary, so it is gone. */}
        <text x="50" y="50" textAnchor="middle" dominantBaseline="middle"
              fontSize="31" fill="#0A0D12"
              style={{
                fontFamily: "'Calibri Light',Calibri,Carlito,'Segoe UI Light','Segoe UI',-apple-system,sans-serif",
                fontWeight: 300,
                fontVariantNumeric: 'tabular-nums',
              }}>
          {shown}
        </text>
        <text x="50" y="72" textAnchor="middle" fontSize="11" fill="#5A6472"
              style={{ fontFamily: "'Calibri Light',Calibri,Carlito,'Segoe UI',sans-serif", fontWeight: 300 }}>
          {unit}
        </text>
      </svg>

      {caption && (
        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-400">
          {caption}
        </span>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// the sky
// ------------------------------------------------------------

/**
 * The moving backdrop: a base gradient plus four cloud layers
 * drifting at different speeds.
 *
 * Each layer is twice as wide as the frame and carries its pattern
 * twice (`background-size: 50% 100%` with repeat-x), so translating
 * it by exactly -50% lands on an identical image and the loop is
 * invisible. Different durations per layer give parallax, which is
 * what stops four bands of fog reading as one sheet sliding past.
 *
 * Everything in here is decorative and contains no text, which is
 * why the top edge can be handled with a mask — the clouds
 * themselves dissolve into the cream above rather than a flat
 * overlay being laid on top of them. That is the fix for the hard
 * band: the previous version faded a rectangle over an opaque
 * background, and the eye finds the end of a linear ramp very
 * easily. Fading the thing itself, over a longer run, with the
 * texture still moving inside it, leaves nothing to find.
 */
export function SkyBackdrop() {
  return (
    <div className="lg-sky-back" aria-hidden="true">
      <div className="lg-sky-base" />
      <div className="lg-puff lg-puff-1" />
      <div className="lg-puff lg-puff-2" />
      <div className="lg-cloud lg-cloud-1" />
      <div className="lg-cloud lg-cloud-2" />
      <div className="lg-cloud lg-cloud-3" />
      <div className="lg-sky-foot" />
    </div>
  )
}

/*
  Real cloud texture, not blobs.

  feTurbulence with fractalNoise is what actually looks like cloud:
  self-similar detail at several scales, which no stack of radial
  gradients can imitate. The colour matrix throws away the noise
  colour, forces the pixels white, and drives ALPHA from the noise
  instead — so the output is a white cloud field with soft, ragged
  edges rather than a grey rectangle.

  It is baked into a data-URI background rather than rendered as a
  live SVG filter on purpose: as a background image the filter is
  rasterised once, and animating transform on the element after
  that is pure compositing. A live filter would be re-evaluated
  every frame and would cook a laptop fan.

  stitchTiles="stitch" makes the noise tileable so the two copies
  meet without a seam when the layer repeats.
*/
const cloudTile = (freq: string, octaves: number, seed: number, cut: number) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='800'%3E` +
  `%3Cfilter id='f' x='0' y='0' width='100%25' height='100%25'%3E` +
  `%3CfeTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${octaves}' ` +
  `seed='${seed}' stitchTiles='stitch'/%3E` +
  `%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 -1.9 0 0 0 ${cut}'/%3E` +
  `%3C/filter%3E%3Crect width='1600' height='800' filter='url(%23f)'/%3E%3C/svg%3E")`

// ------------------------------------------------------------
// the glass layer
// ------------------------------------------------------------

/**
 * Rendered once per page. Keyframes cannot be expressed as inline
 * styles and Tailwind has no vocabulary for backdrop layers, so
 * the whole material lives here as one stylesheet.
 *
 * The material is modelled on iOS 26's liquid glass, adapted to a
 * light page. Four things make it read as glass rather than as a
 * grey box with rounded corners:
 *
 *   · it refracts. backdrop-filter blurs AND saturates what is
 *     behind, which is why colour has to exist behind it — hence
 *     the blooms on the canvas. Glass over a flat surface just
 *     looks like paint.
 *   · it has a lit edge. A one-pixel inset white highlight along
 *     the top, falling off around the rim, is the specular
 *     response of a bevelled edge to light from above.
 *   · it has depth, not a border. Two shadows at different radii
 *     read as an object floating above a surface; a 1px grey
 *     outline reads as a rectangle drawn on it. There are no
 *     hairline borders anywhere in here.
 *   · it is tinted by what it sits on, not by a stripe. Each card
 *     carries a soft bloom of its own accent in the corner
 *     instead of the hard 3px bar it had before.
 *
 * Every shadow is warm — rgba(74,60,45) rather than black. On a
 * cream page a neutral shadow reads as dirt. This is the kind of
 * detail that is invisible when right and obvious when wrong.
 */
export function WidgetStyles() {
  return (
    <style>{`
      /*
        Calibri is Microsoft's and cannot be shipped. Carlito is
        metric-compatible with it, SIL-licensed and on Google Fonts,
        so the line breaks and column widths land in the same place
        whether or not the reader has Office installed. @import has
        to be the first rule in the sheet or the browser drops it.
      */
      @import url('https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400&display=swap');

      /* ---- gauge motion ---- */
      @keyframes lg-drift {
        from { transform: translateX(0); }
        to   { transform: translateX(-100px); }
      }
      .lg-wave { animation: lg-drift 7s linear infinite; }
      .lg-wave-back { animation-duration: 11.5s; animation-direction: reverse; }
      .lg-wave-mid  { animation-duration: 9s; }

      /* The body of water rises and settles as a whole, slower than
         any of the waves crossing it. Three surface speeds plus one
         slow swell is what stops it reading as a looping GIF. */
      @keyframes lg-bob {
        0%, 100% { transform: translateY(0); }
        50%      { transform: translateY(-1.8px); }
      }
      .lg-bob { animation: lg-bob 5.5s ease-in-out infinite; }

      @keyframes lg-bubble {
        0%   { transform: translateY(0) scale(.5);  opacity: 0; }
        18%  { opacity: .7; }
        75%  { opacity: .45; }
        100% { transform: translateY(-40px) scale(1.15); opacity: 0; }
      }
      .lg-bubble { animation: lg-bubble 6s ease-in infinite; }

      /*
        Entrance animates opacity only, deliberately. Animating
        transform would need fill-mode: both to avoid a first-frame
        flash, and a filled animation keeps 'transform: none'
        applied forever — animated values outrank normal
        declarations in the cascade, so the hover lift below would
        silently stop working.
      */
      @keyframes lg-fade { from { opacity: 0; } to { opacity: 1; } }
      .lg-rise { animation: lg-fade .42s ease both; }

      /* ---- the dark ground ----
         Not one colour but five, all dark: a cold navy top-left,
         plum top-right, a deep teal through the middle, slate low
         left and a warm near-black bottom right. Held apart they
         give the surface somewhere to go across a long scroll,
         while every one of them stays dark enough that light text
         over it clears contrast everywhere. */
      /* ================= THE SKY ================= */

      .lg-sky { position: relative; }
      .lg-sky-back {
        position: absolute; inset: 0; z-index: 0;
        overflow: hidden;
        pointer-events: none;
      }

      /*
        The entry is 30rem long and hand-eased.

        The visible band in the old version came from two mistakes.
        It was short, so the ramp had a detectable start and end;
        and it was a mask, which faded the clouds out exactly where
        the gradient was flattest, leaving a smooth grey wash with
        nothing in it to distract the eye. Now only the base colour
        ramps, over a long distance, through many stops following an
        ease-in-out curve — while the cloud layers stay at full
        strength the whole way down. Texture across the transition
        is what actually hides it; length alone never does.
      */
      .lg-sky-base {
        position: absolute; inset: 0;
        background: var(--sky-base);
      }
      .lg-sky-base::after {
        content: '';
        position: absolute; left: 0; right: 0; top: 0; height: 30rem;
        background: linear-gradient(to bottom,
          var(--sky-in) 0%,
          color-mix(in srgb, var(--sky-in) 97%, transparent) 6%,
          color-mix(in srgb, var(--sky-in) 90%, transparent) 13%,
          color-mix(in srgb, var(--sky-in) 78%, transparent) 21%,
          color-mix(in srgb, var(--sky-in) 62%, transparent) 30%,
          color-mix(in srgb, var(--sky-in) 46%, transparent) 40%,
          color-mix(in srgb, var(--sky-in) 31%, transparent) 51%,
          color-mix(in srgb, var(--sky-in) 19%, transparent) 62%,
          color-mix(in srgb, var(--sky-in) 10%, transparent) 73%,
          color-mix(in srgb, var(--sky-in) 4%,  transparent) 84%,
          transparent 100%);
      }

      /* the run-out into the near-black footer, matched in shape to
         the mask above so both ends behave the same way */
      .lg-sky-foot {
        position: absolute; left: 0; right: 0; bottom: 0; height: 28rem;
        background: linear-gradient(to bottom,
          rgba(8,8,10,0) 0%, rgba(8,8,10,.03) 10%, rgba(8,8,10,.08) 20%,
          rgba(8,8,10,.16) 30%, rgba(8,8,10,.28) 40%, rgba(8,8,10,.42) 50%,
          rgba(8,8,10,.57) 60%, rgba(8,8,10,.71) 70%, rgba(8,8,10,.83) 80%,
          rgba(8,8,10,.93) 90%, #08080A 100%);
      }
      [data-sky="day"] .lg-sky-foot {
        background: linear-gradient(to bottom,
          rgba(250,248,245,0) 0%, rgba(250,248,245,.03) 10%, rgba(250,248,245,.08) 20%,
          rgba(250,248,245,.16) 30%, rgba(250,248,245,.28) 40%, rgba(250,248,245,.42) 50%,
          rgba(250,248,245,.57) 60%, rgba(250,248,245,.71) 70%, rgba(250,248,245,.83) 80%,
          rgba(250,248,245,.93) 90%, #FAF8F5 100%);
      }

      @keyframes lg-drift-x {
        from { transform: translate3d(0,0,0); }
        to   { transform: translate3d(-50%,0,0); }
      }
      .lg-cloud, .lg-puff {
        position: absolute; top: 0; left: 0;
        width: 200%; height: 100%;
        background-repeat: repeat-x;
        background-size: 50% 100%;
        animation: lg-drift-x linear infinite;
        will-change: transform;
      }

      /* real cloud, three depths */
      .lg-cloud-1 {
        animation-duration: 260s;
        opacity: var(--cloud-1);
        background-image: ${cloudTile('0.0016 0.0042', 5, 3, 1.30)};
      }
      .lg-cloud-2 {
        animation-duration: 168s;
        opacity: var(--cloud-2);
        background-image: ${cloudTile('0.0028 0.0072', 5, 11, 1.18)};
      }
      .lg-cloud-3 {
        animation-duration: 104s;
        opacity: var(--cloud-3);
        background-image: ${cloudTile('0.0055 0.0130', 4, 27, 1.05)};
      }

      /* Soft mass under the texture. Fractal noise alone reads as
         mist; these give the clouds bodies for it to sit on. */
      .lg-puff-1 {
        animation-duration: 300s;
        background-image:
          radial-gradient(32% 30% at 14% 22%, var(--puff), transparent 70%),
          radial-gradient(26% 24% at 47% 40%, var(--puff), transparent 72%),
          radial-gradient(30% 26% at 78% 18%, var(--puff), transparent 70%);
      }
      .lg-puff-2 {
        animation-duration: 190s;
        background-image:
          radial-gradient(24% 20% at 28% 62%, var(--puff), transparent 74%),
          radial-gradient(20% 18% at 63% 74%, var(--puff), transparent 76%),
          radial-gradient(26% 22% at 92% 56%, var(--puff), transparent 74%);
      }

      /* ---- night: grey and white cloud on a slate ground ---- */
      [data-sky="night"] {
        color-scheme: dark;
        --sky-base: linear-gradient(180deg, #1B212A 0%, #2C323B 42%, #232935 78%, #1A1F27 100%);
        --sky-in: #FAF8F5;
        --cloud-1: .30;
        --cloud-2: .22;
        --cloud-3: .15;
        --puff: rgba(226,234,247,.10);
        --alert-high: #FF7A93;
        --alert-med:  #FF9B4A;
        --dim:        #9AA2B2;
        --glass: rgba(255,255,255,.055);
        --glass-hi: rgba(255,255,255,.095);
        --rim: rgba(255,255,255,.32);
        --rim-hi: rgba(255,255,255,.46);
        --hair: rgba(255,255,255,.18);
        --hair-soft: rgba(255,255,255,.10);
        --hair-strong: rgba(255,255,255,.34);
        --cast: rgba(0,0,0,.55);
        --sheet: rgba(38,44,54,.58);
        --scrim: rgba(14,17,23,.55);
        --gauge-ink: #FFFFFF;
        --gauge-halo: rgba(10,13,18,.85);
      }

      /* ---- sunset: kept deliberately deep so light type holds ---- */
      [data-sky="sunset"] {
        color-scheme: dark;
        --sky-base: linear-gradient(180deg, #241E3C 0%, #432B4E 30%, #74404F 58%, #96543F 82%, #7A4436 100%);
        --sky-in: #FAF8F5;
        --cloud-1: .34;
        --cloud-2: .26;
        --cloud-3: .18;
        --puff: rgba(255,208,170,.14);
        --alert-high: #FF8FA3;
        --alert-med:  #FFC46B;
        --dim:        #D9C3B4;
        --glass: rgba(255,255,255,.07);
        --glass-hi: rgba(255,255,255,.12);
        --rim: rgba(255,235,220,.36);
        --rim-hi: rgba(255,240,228,.52);
        --hair: rgba(255,235,220,.20);
        --hair-soft: rgba(255,235,220,.11);
        --hair-strong: rgba(255,235,220,.38);
        --cast: rgba(30,10,20,.5);
        --sheet: rgba(62,42,58,.62);
        --scrim: rgba(26,16,26,.55);
        --gauge-ink: #FFF7EE;
        --gauge-halo: rgba(32,14,26,.85);
      }

      /* ---- day: pale blue, white cloud, dark type ---- */
      [data-sky="day"] {
        color-scheme: light;
        --sky-base: linear-gradient(180deg, #4E93D6 0%, #7FB4E6 34%, #AFD2F0 68%, #D6E9F8 100%);
        --sky-in: #FAF8F5;
        --cloud-1: .92;
        --cloud-2: .72;
        --cloud-3: .50;
        --puff: rgba(255,255,255,.62);
        --alert-high: #B3123C;
        --alert-med:  #A85400;
        --dim:        #3F5266;
        /* On a bright sky the rim flips to white and the fill comes
           up: a 5%-white panel that reads as glass at night is
           simply invisible at noon. */
        --glass: rgba(255,255,255,.32);
        --glass-hi: rgba(255,255,255,.46);
        --rim: rgba(255,255,255,.78);
        --rim-hi: rgba(255,255,255,.95);
        --hair: rgba(18,38,66,.16);
        --hair-soft: rgba(18,38,66,.09);
        --hair-strong: rgba(18,38,66,.30);
        --cast: rgba(24,44,74,.28);
        --sheet: rgba(255,255,255,.72);
        --scrim: rgba(28,44,66,.40);
        --gauge-ink: #0F2438;
        --gauge-halo: rgba(255,255,255,.92);
      }
      @media (prefers-reduced-motion: reduce) {
        .lg-cloud { animation: none !important; }
      }

      /* Content rides above the backdrop. Both are explicit
         elements with explicit z-index, so no stacking context is
         created on any ancestor of the fixed modal. */
      .lg-canvas { position: relative; z-index: 1; }

      /* ---- dashboard data type ----
         Calibri Light where it exists, with a descending stack for
         everywhere it does not: Windows and Office-on-Mac have it,
         iOS and most Linux do not, and a missing font that falls
         back to Times would be far worse than not asking. Tabular
         figures stay on regardless so columns of numbers line up. */
      /* Everything under the sky, not just the figures — headings
         included. The display face is dropped here deliberately. */
      [data-sky], [data-sky] h1, [data-sky] h2, [data-sky] h3,
      [data-sky] h4, [data-sky] button, [data-sky] input, [data-sky] select,
      .lg-data, .lg-num {
        font-family: 'Calibri Light', Calibri, Carlito, 'Segoe UI Light', 'Segoe UI',
                     -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif;
      }
      .lg-data, .lg-num {
        font-variant-numeric: tabular-nums;
        letter-spacing: .005em;
      }
      /* Monospace survives only where it carries meaning: shell
         commands and filenames, which are things you retype. */
      [data-sky] pre, [data-sky] code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      /*
        :where() so this contributes zero specificity. Light is the
        default weight, but a Tailwind font-bold on the same element
        still wins — without that, every emphasised figure in the
        dashboard would silently flatten to 300 and the hierarchy
        would be gone.
      */
      :where(.lg-data), :where(.lg-num) { font-weight: 300; }

      /* ---- the material ----
         Completely transparent. There is no fill, no tint and no
         sheen: the card is a blurred window onto the ground behind
         it, described entirely by one hairline of light around its
         edge and the shadow it casts. On a dark surface that is
         enough — the eye reads the rim as an object boundary and
         stops needing a background to be told where the card is. */
      .lg-card {
        position: relative;
        /*
          Matched to the iOS folder container: a large continuous
          radius, a barely-there light fill, and a single crisp
          hairline of white around the whole edge. The hairline is
          the load-bearing part — it is what makes an almost
          invisible panel read as an object, and it is why there is
          no drop shadow. iOS does not shadow these; the ring alone
          separates the panel from the wallpaper.
        */
        border-radius: 28px;
        corner-shape: squircle;
        background: var(--glass, rgba(255,255,255,.055));
        -webkit-backdrop-filter: blur(26px) saturate(140%);
        backdrop-filter: blur(26px) saturate(140%);
        box-shadow:
          inset 0 0 0 1px var(--rim, rgba(255,255,255,.32)),
          0 8px 24px -18px var(--cast, rgba(0,0,0,.55));
        transition: transform .24s cubic-bezier(.2,.8,.3,1),
                    box-shadow .24s ease, background .24s ease;
      }
      .lg-card:hover {
        transform: translateY(-2px);
        background: var(--glass-hi, rgba(255,255,255,.095));
        box-shadow:
          inset 0 0 0 1px var(--rim-hi, rgba(255,255,255,.46)),
          0 14px 32px -18px var(--cast, rgba(0,0,0,.6));
      }
      .lg-card:focus-within {
        outline: 2px solid var(--accent, #7CC7F5);
        outline-offset: 2px;
      }

      /* the one place colour is allowed: the heading of each card */
      .lg-title { color: var(--accent, #E8EAF0); }

      /* a nested panel: same language, one step quieter, so it
         reads as inside the card rather than on top of it */
      .lg-inset {
        border-radius: 18px;
        corner-shape: squircle;
        background: var(--hair-soft);
        box-shadow: inset 0 0 0 1px var(--hair);
      }

      /* ---- rows ---- */
      .lg-row {
        border-radius: 12px;
        corner-shape: squircle;
        transition: background .16s ease, box-shadow .16s ease;
      }
      .lg-row:hover {
        background: var(--hair-soft);
        box-shadow: inset 0 0 0 1px var(--hair);
      }
      .lg-rowhead {
        border-radius: 14px;
        background: var(--hair-soft);
        box-shadow: inset 0 0 0 1px var(--hair);
        -webkit-backdrop-filter: blur(10px);
        backdrop-filter: blur(10px);
      }

      /* ---- small controls ---- */
      .lg-pill {
        border-radius: 999px;
        background: var(--glass);
        -webkit-backdrop-filter: blur(12px);
        backdrop-filter: blur(12px);
        box-shadow: inset 0 0 0 1px var(--rim);
        transition: transform .16s ease, box-shadow .16s ease, background .16s ease;
      }
      .lg-pill:hover {
        background: var(--glass-hi);
        transform: translateY(-1px);
        box-shadow: inset 0 0 0 1px var(--rim-hi);
      }
      .lg-field {
        border-radius: 999px;
        background: var(--glass);
        color: inherit;
        box-shadow: inset 0 0 0 1px var(--rim);
        transition: box-shadow .16s ease, background .16s ease;
      }
      .lg-field::placeholder { color: var(--dim); }
      .lg-field:focus {
        background: var(--glass-hi);
        box-shadow: inset 0 0 0 1.5px var(--accent, #5AC8FA);
      }
      [data-sky="day"] select.lg-field option { background: #FFFFFF; color: #17171A; }
      [data-sky="night"] select.lg-field option,
      [data-sky="sunset"] select.lg-field option { background: #1F2530; color: #EDEFF4; }
      .lg-dark select.lg-field option { background: #12141C; color: #E8EAF0; }

      /* ---- flipping the existing light-theme utilities ----
         Every section on this page was written against a cream
         background using ink-* text and paper backgrounds. Rather
         than rewrite twenty files, the tokens are remapped inside
         .lg-dark. Two classes beats one, so these win over
         Tailwind's originals without !important — which matters,
         because !important here would also override the deliberate
         colour set inline on individual cards. */
      /* Night and sunset are dark grounds, so the ink scale inverts.
         The dim end has to come up further than instinct suggests:
         on a #2C323B slate, #838B9C is only about 3.3:1 and fails
         for body text. Everything below sits at or above 4.5. */
      [data-sky="night"] .text-ink-950,
      [data-sky="night"] .text-ink-900,
      [data-sky="sunset"] .text-ink-950,
      [data-sky="sunset"] .text-ink-900 { color: #F7F9FD; }
      [data-sky="night"] .text-ink-800,
      [data-sky="sunset"] .text-ink-800 { color: #EBEEF4; }
      [data-sky="night"] .text-ink-700,
      [data-sky="sunset"] .text-ink-700 { color: #DBE0E9; }
      [data-sky="night"] .text-ink-600,
      [data-sky="sunset"] .text-ink-600 { color: #C9CFDB; }
      [data-sky="night"] .text-ink-500,
      [data-sky="sunset"] .text-ink-500 { color: #B6BDCB; }
      [data-sky="night"] .text-ink-400,
      [data-sky="sunset"] .text-ink-400 { color: #A4ACBC; }
      [data-sky="night"] .text-ink-300,
      [data-sky="sunset"] .text-ink-300 { color: #929AAB; }
      [data-sky="night"] .text-signal-500,
      [data-sky="night"] .text-signal-600,
      [data-sky="night"] .text-signal-700,
      [data-sky="sunset"] .text-signal-500,
      [data-sky="sunset"] .text-signal-600,
      [data-sky="sunset"] .text-signal-700 { color: #FF8FA3; }
      [data-sky="night"] pre, [data-sky="night"] code,
      [data-sky="sunset"] pre, [data-sky="sunset"] code { color: #E2E6EE; }

      /* Day keeps the original ink scale — it is already dark type
         on a light ground, which is what the daytime sky needs. All
         it wants is a touch more weight against pale blue. */
      [data-sky="day"] .text-ink-400 { color: #46586B; }
      [data-sky="day"] .text-ink-300 { color: #56687C; }

      [data-sky] .bg-paper, [data-sky] .bg-paper-dim { background-color: transparent; }
      [data-sky] .bg-signal-50 { background-color: color-mix(in srgb, var(--alert-high) 14%, transparent); }
      [data-sky] .bg-ink-100 { background-color: var(--hair-strong); }
      [data-sky] .border-ink-100 { border-color: var(--hair-soft); }
      [data-sky] .border-ink-200 { border-color: var(--hair); }
      [data-sky] .border-ink-950 { border-color: var(--hair-strong); }
      [data-sky] ::selection { background: color-mix(in srgb, var(--accent, #5AC8FA) 35%, transparent); }

      /* ---- the zoom sheet ---- */
      @keyframes lg-scrim-in { from { opacity: 0; } to { opacity: 1; } }
      /*
        Scale and fade together, with a curve that overshoots very
        slightly past 1 before settling. That tiny overshoot is what
        separates "a box appeared" from "a thing came forward" — it
        is how iOS presents a sheet, and the eye reads the absence
        of it as cheapness without being able to say why.
      */
      @keyframes lg-zoom-in {
        from { opacity: 0; transform: scale(.90) translateY(14px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
      .lg-scrim {
        animation: lg-scrim-in .24s ease both;
        background: var(--scrim, rgba(16,19,25,.55));
        -webkit-backdrop-filter: blur(24px);
        backdrop-filter: blur(24px);
      }
      .lg-sheet {
        animation: lg-zoom-in .36s cubic-bezier(.19,1.08,.30,1) both;
        transform-origin: center;
        border-radius: 32px;
        corner-shape: squircle;
        /* Carries slightly more fill than a card and the same
           hairline. A sheet floating over a scrolled page has to
           stop the text behind it reading through; the cards do
           not, because nothing moves behind them. */
        background: var(--sheet, rgba(44,50,59,.55));
        -webkit-backdrop-filter: blur(38px) saturate(150%);
        backdrop-filter: blur(38px) saturate(150%);
        box-shadow:
          inset 0 0 0 1px var(--rim-hi, rgba(255,255,255,.34)),
          0 40px 90px -30px rgba(0,0,0,.55);
      }

      .lg-num { font-variant-numeric: tabular-nums; }

      /*
        Where the browser cannot blur a backdrop, a transparent card
        sitting on a busy gradient becomes text on noise. Fall back
        to a near-opaque dark fill: it loses the effect and keeps
        the legibility, which is the right way round.
      */
      @supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
        [data-sky="night"] .lg-card,
        [data-sky="night"] .lg-rowhead { background: rgba(38,43,52,.92); }
        [data-sky="sunset"] .lg-card,
        [data-sky="sunset"] .lg-rowhead { background: rgba(62,42,58,.92); }
        [data-sky="day"] .lg-card,
        [data-sky="day"] .lg-rowhead { background: rgba(255,255,255,.88); }
        .lg-sheet { background: var(--sheet); }
      }

      @media (prefers-reduced-motion: reduce) {
        .lg-wave, .lg-rise, .lg-sheet, .lg-scrim,
        .lg-bob, .lg-bubble, .lg-cloud { animation: none !important; }
        .lg-card, .lg-row, .lg-pill { transition: none; }
        .lg-card:hover, .lg-pill:hover { transform: none; }
      }
    `}</style>
  )
}

/**
 * A headline number with a tinted, slightly translucent face.
 * Used sparingly — every tile being loud means none of them is.
 */
export function Tile({ label, value, sub, tone = 'ink', spark }: {
  label: string
  value: string
  sub?: string
  tone?: 'ink' | 'red' | 'green' | 'amber'
  spark?: number[]
}) {
  const skin = {
    ink:   { accent: '#A8BEFF', text: 'text-[#F0F2F7]' },
    red:   { accent: '#FF8FA3', text: 'text-[#FF8FA3]' },
    green: { accent: '#7FE3C4', text: 'text-[#7FE3C4]' },
    amber: { accent: '#FFB37A', text: 'text-[#FFB37A]' },
  }[tone]

  const peak = spark && spark.length ? Math.max(...spark, 1) : 1

  return (
    <div className="lg-card lg-rise px-3.5 py-3"
         style={{ '--accent': skin.accent } as React.CSSProperties}>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-500">{label}</div>
      <div className={`lg-num mt-1.5 text-[1.6rem] font-bold leading-none ${skin.text}`}
           style={{ letterSpacing: '-0.01em' }}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[10px] leading-snug text-ink-500">{sub}</div>}

      {spark && spark.length > 1 && (
        <svg viewBox={`0 0 100 22`} preserveAspectRatio="none"
             className="mt-2 h-5 w-full" aria-hidden="true">
          <path
            d={spark.map((v, i) =>
              `${i === 0 ? 'M' : 'L'}${(i / (spark.length - 1)) * 100},${22 - (v / peak) * 20}`
            ).join(' ')}
            fill="none" stroke="currentColor" strokeWidth="1.4"
            className={skin.text} vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  )
}

/** Section heading used to separate one report's dashboard from another's. */
export function SectionBanner({ title, subtitle, right }: {
  title: string; subtitle: string; right?: React.ReactNode
}) {
  return (
    <div className="relative mb-4 mt-9 flex flex-wrap items-end justify-between gap-3 pb-2.5 first:mt-0">
      {/*
        A rule that fades rather than stopping. A full-width 2px
        black bar was right on the old flat surface; against glass
        it reads as a scar, because nothing else on the page has a
        hard edge any more.
      */}
      <span aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
            style={{ background: 'linear-gradient(90deg, rgba(255,255,255,.42), rgba(255,255,255,.07) 55%, transparent)' }} />
      <div>
        <h2 className="text-xl font-bold leading-tight text-ink-950"
            style={{ letterSpacing: '-0.01em' }}>
          {title}
        </h2>
        <p className="mt-0.5 text-[11px] text-ink-500">{subtitle}</p>
      </div>
      {right}
    </div>
  )
}
