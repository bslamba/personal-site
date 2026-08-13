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

import { useEffect, useId, useMemo, useState } from 'react'

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
                  background: 'linear-gradient(90deg, rgba(120,100,80,.13), rgba(120,100,80,.02))',
                }} aria-hidden="true" />
          {row.barFail !== undefined && row.barFail > 0 && (
            <span className="pointer-events-none absolute inset-y-0 left-0 rounded-[12px]"
                  style={{
                    width: `${Math.min(100, row.bar * row.barFail * 100)}%`,
                    background: 'linear-gradient(90deg, rgba(204,51,17,.22), rgba(204,51,17,.04))',
                  }} aria-hidden="true" />
          )}
        </>
      )}
      {columns.map((c, i) => (
        <span
          key={i}
          className={`relative ${i === 0 ? 'min-w-0 flex-1 truncate' : `shrink-0 ${c.width ?? 'w-16'}`} ${
            c.align === 'right' ? 'text-right' : ''
          } ${dense ? 'text-[11px]' : 'text-xs'} ${
            i === 0 ? 'text-ink-900' : 'lg-num font-mono text-ink-600'
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
        <h3 className="text-[13px] font-bold leading-tight text-ink-950"
            style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}>
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
export function DetailView({ data, onClose, accent = '#0077BB' }: {
  data: PanelData; onClose: () => void; accent?: string
}) {
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
                style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.015em' }}>
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
  const colour = tone === 'red' ? 'text-[#CC3311]'
    : tone === 'green' ? 'text-[#0F7B4F]' : 'text-ink-950'
  const accent = tone === 'red' ? '#CC3311' : tone === 'green' ? '#009988' : '#5C5C64'
  return (
    <div className="lg-card lg-rise px-3 py-2.5"
         style={{ '--accent': accent } as React.CSSProperties}>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-500">{label}</div>
      <div className={`lg-num mt-1 text-[1.35rem] font-bold leading-none ${colour}`}
           style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>
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
export const SERIES_COLOURS = [
  '#D3002D', '#F5384F', '#FF6B80', '#B80027', '#7A0019',
  '#3A3A40', '#5C5C64', '#8A8A93', '#B5B5BC', '#D9D9DE',
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
export const NODE_COLOURS = [
  '#0077BB', // vibrant blue
  '#EE3377', // vibrant magenta
  '#009988', // vibrant teal
  '#EE7733', // vibrant orange
  '#33BBEE', // vibrant cyan
  '#CC3311', // vibrant red
  '#332288', // muted indigo
  '#117733', // muted green
  '#CCBB44', // bright yellow
  '#AA3377', // bright purple
  '#882255', // muted wine
  '#999933', // muted olive
]

export const nodeColour = (i: number) => NODE_COLOURS[i % NODE_COLOURS.length]

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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ECECEF" strokeWidth={stroke} />
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
                  stroke="#ECECEF" strokeWidth="1" />
            <text x={padL - 7} y={padT + ih * f + 3.5} textAnchor="end" fontSize="9" fill="#B5B5BC">
              {Math.round(max * (1 - f))}
            </text>
          </g>
        ))}

        {/* context first, so the highlighted lines sit on top */}
        {cold.map(s => (
          <path key={s.label} d={path(s)} fill="none" stroke="#D9D9DE" strokeWidth="1"
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
          <text key={i} x={x(i)} y={H - 7} textAnchor="middle" fontSize="9" fill="#8A8A93">{l}</text>
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
            <span className="h-1.5 w-4 rounded-sm bg-ink-200" />
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
      <path d={area} fill={colour} opacity="0.10" />
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
  value, max = 100, colour = '#0077BB', size = 92, unit = '%', caption, alert = false,
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
          <radialGradient id={`lgg${uid}`} cx="34%" cy="26%" r="72%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.60" />
            <stop offset="52%" stopColor="#FFFFFF" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#0B0B0F" stopOpacity="0.12" />
          </radialGradient>
        </defs>

        {/* the empty part of the sphere: a warm translucent well,
            not grey — grey on cream reads as a hole */}
        <circle cx="50" cy="50" r="45" fill="#7A6448" fillOpacity="0.07" />

        <g clipPath={`url(#lgc${uid})`}>
          <path className="lg-wave lg-wave-back" d={wave(2.4)}
                fill={colour} opacity="0.32" />
          <path className="lg-wave" d={wave(3.2)}
                fill={colour} opacity="0.80" />
        </g>

        {/* glass: specular highlight top-left, faint occlusion bottom-right */}
        <circle cx="50" cy="50" r="45" fill={`url(#lgg${uid})`} />
        <circle cx="50" cy="50" r="45" fill="none" strokeWidth="1.6"
                stroke={alert ? '#CC3311' : colour} strokeOpacity={alert ? 0.85 : 0.35} />

        {/* white stroke under the glyphs so the number stays legible
            whether it lands on liquid or on empty sphere */}
        <text x="50" y="52" textAnchor="middle" dominantBaseline="middle"
              fontSize="26" fontWeight="700" fill="#17171A"
              stroke="#FFFFFF" strokeWidth="4" paintOrder="stroke"
              style={{ fontVariantNumeric: 'tabular-nums' }}>
          {shown}
        </text>
        <text x="50" y="73" textAnchor="middle" fontSize="11" fontWeight="700"
              fill="#5C5C64" stroke="#FFFFFF" strokeWidth="3" paintOrder="stroke">
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
      /* ---- gauge motion ---- */
      @keyframes lg-drift {
        from { transform: translateX(0); }
        to   { transform: translateX(-100px); }
      }
      .lg-wave { animation: lg-drift 7s linear infinite; }
      .lg-wave-back { animation-duration: 11.5s; animation-direction: reverse; }

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

      /* ---- the canvas ----
         Transparent on purpose: the dashboard sits directly on the
         page's own cream, with no seam where one surface meets
         another. All it adds is the colour the glass needs
         something to refract. */
      .lg-canvas {
        position: relative;
        isolation: isolate;
        background: transparent;
      }
      .lg-canvas::before {
        content: '';
        position: absolute;
        /* Bleeds vertically but never horizontally: a negative
           inline inset on a centred container pushes past the
           viewport on narrow screens and produces a horizontal
           scrollbar that is very hard to trace back to a glow. */
        inset: -6rem 0;
        z-index: -1;
        pointer-events: none;
        background:
          radial-gradient(34rem 24rem at  6%  2%, rgba(0,119,187,.26),  transparent 62%),
          radial-gradient(30rem 22rem at 94%  7%, rgba(238,51,119,.20), transparent 62%),
          radial-gradient(27rem 20rem at 74% 44%, rgba(238,119,51,.17), transparent 62%),
          radial-gradient(32rem 23rem at 18% 72%, rgba(0,153,136,.20),  transparent 62%),
          radial-gradient(26rem 20rem at 90% 95%, rgba(170,51,119,.16), transparent 62%);
        filter: blur(42px) saturate(118%);
      }

      /* ---- the material ---- */
      .lg-card {
        position: relative;
        isolation: isolate;
        border-radius: 20px;
        /* Continuous corners where the browser has them. Chrome 139+
           only for now; everywhere else quietly keeps the plain
           radius, which is the correct way to spend a new property. */
        corner-shape: squircle;
        background: linear-gradient(180deg, rgba(255,255,255,.60), rgba(255,255,255,.34));
        -webkit-backdrop-filter: blur(20px) saturate(185%);
        backdrop-filter: blur(20px) saturate(185%);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.95),
          inset 0 0 0 .5px rgba(255,255,255,.55),
          inset 0 -16px 30px -22px rgba(120,100,80,.28),
          0 1px 1.5px rgba(74,60,45,.05),
          0 10px 22px -12px rgba(74,60,45,.15),
          0 28px 52px -30px rgba(74,60,45,.22);
        transition: transform .24s cubic-bezier(.2,.8,.3,1), box-shadow .24s ease;
      }
      /* the accent, as a bloom under the glass rather than a stripe */
      .lg-card::before {
        content: '';
        position: absolute; inset: 0; z-index: -1;
        border-radius: inherit;
        pointer-events: none;
        background:
          radial-gradient(122% 88% at 0% 0%,
            color-mix(in srgb, var(--accent, #0077BB) 30%, transparent), transparent 62%),
          radial-gradient(96% 74% at 100% 100%,
            color-mix(in srgb, var(--accent, #0077BB) 14%, transparent), transparent 66%);
        opacity: .9;
      }
      /*
        Specular sheen down the top-left bevel.
        Two constraints, both learned the hard way:
        it falls off within a fifth of the card so it lights the
        edge rather than washing the face, and content is lifted
        above it — a positioned pseudo-element paints above normal
        in-flow text, so without the z-index the title of every
        card would sit under a white veil.
      */
      .lg-card::after {
        content: '';
        position: absolute; inset: 0;
        border-radius: inherit;
        pointer-events: none;
        background: linear-gradient(133deg,
          rgba(255,255,255,.58) 0%,
          rgba(255,255,255,.10) 9%,
          rgba(255,255,255,0)   23%);
      }
      .lg-card > * { position: relative; z-index: 1; }
      .lg-card:hover {
        transform: translateY(-3px);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,1),
          inset 0 0 0 .5px rgba(255,255,255,.7),
          inset 0 -16px 30px -22px rgba(120,100,80,.24),
          0 2px 3px rgba(74,60,45,.06),
          0 18px 36px -14px rgba(74,60,45,.20),
          0 40px 70px -34px rgba(74,60,45,.28);
      }
      .lg-card:focus-within {
        outline: 2px solid color-mix(in srgb, var(--accent, #0077BB) 70%, transparent);
        outline-offset: 2px;
      }

      /* a recessed well inside a card — the inverse lighting */
      .lg-inset {
        border-radius: 14px;
        corner-shape: squircle;
        background: linear-gradient(180deg, rgba(120,100,80,.055), rgba(120,100,80,.02));
        box-shadow:
          inset 0 1px 2px rgba(74,60,45,.09),
          inset 0 -1px 0 rgba(255,255,255,.7);
      }

      /* ---- rows ---- */
      .lg-row {
        border-radius: 12px;
        corner-shape: squircle;
        transition: background .16s ease, box-shadow .16s ease;
      }
      .lg-row:hover {
        background: rgba(255,255,255,.52);
        box-shadow: inset 0 0 0 .5px rgba(255,255,255,.85);
      }
      .lg-rowhead {
        border-radius: 12px;
        background: rgba(255,255,255,.34);
        -webkit-backdrop-filter: blur(10px) saturate(150%);
        backdrop-filter: blur(10px) saturate(150%);
      }

      /* ---- small controls ---- */
      .lg-pill {
        border-radius: 999px;
        background: rgba(255,255,255,.55);
        -webkit-backdrop-filter: blur(12px) saturate(170%);
        backdrop-filter: blur(12px) saturate(170%);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.95),
          inset 0 0 0 .5px rgba(255,255,255,.6),
          0 2px 6px -2px rgba(74,60,45,.16);
        transition: transform .16s ease, box-shadow .16s ease, background .16s ease;
      }
      .lg-pill:hover {
        background: rgba(255,255,255,.75);
        transform: translateY(-1px);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,1),
          inset 0 0 0 .5px rgba(255,255,255,.8),
          0 5px 12px -3px rgba(74,60,45,.22);
      }
      .lg-field {
        border-radius: 999px;
        background: rgba(255,255,255,.5);
        box-shadow:
          inset 0 1px 2px rgba(74,60,45,.10),
          inset 0 0 0 .5px rgba(255,255,255,.6);
        transition: box-shadow .16s ease, background .16s ease;
      }
      .lg-field:focus {
        background: rgba(255,255,255,.8);
        box-shadow:
          inset 0 1px 2px rgba(74,60,45,.06),
          inset 0 0 0 1.5px color-mix(in srgb, var(--accent, #0077BB) 60%, transparent);
      }

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
        background: rgba(38,30,22,.30);
        -webkit-backdrop-filter: blur(26px) saturate(140%);
        backdrop-filter: blur(26px) saturate(140%);
      }
      .lg-sheet {
        animation: lg-zoom-in .36s cubic-bezier(.19,1.08,.30,1) both;
        transform-origin: center;
        border-radius: 26px;
        corner-shape: squircle;
        background: linear-gradient(180deg, rgba(255,255,255,.80), rgba(255,255,255,.66));
        -webkit-backdrop-filter: blur(34px) saturate(190%);
        backdrop-filter: blur(34px) saturate(190%);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,1),
          inset 0 0 0 .5px rgba(255,255,255,.7),
          0 30px 70px -20px rgba(30,22,14,.45),
          0 80px 140px -60px rgba(30,22,14,.55);
      }

      .lg-num { font-variant-numeric: tabular-nums; }

      /*
        Where the browser cannot blur a backdrop the material would
        become a washed-out translucent rectangle with unreadable
        text over it. Fall back to near-opaque instead: it loses the
        effect and keeps the legibility, which is the right way
        round.
      */
      @supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
        .lg-card, .lg-sheet, .lg-pill, .lg-rowhead {
          background: rgba(255,253,250,.94);
        }
        .lg-scrim { background: rgba(38,30,22,.62); }
      }

      @media (prefers-reduced-motion: reduce) {
        .lg-wave, .lg-rise, .lg-sheet, .lg-scrim { animation: none !important; }
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
    ink:   { accent: '#5C5C64', text: 'text-ink-950' },
    red:   { accent: '#CC3311', text: 'text-[#CC3311]' },
    green: { accent: '#009988', text: 'text-[#0F7B4F]' },
    amber: { accent: '#EE7733', text: 'text-[#B45309]' },
  }[tone]

  const peak = spark && spark.length ? Math.max(...spark, 1) : 1

  return (
    <div className="lg-card lg-rise px-3.5 py-3"
         style={{ '--accent': skin.accent } as React.CSSProperties}>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-500">{label}</div>
      <div className={`lg-num mt-1.5 text-[1.6rem] font-bold leading-none ${skin.text}`}
           style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>
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
            style={{ background: 'linear-gradient(90deg, rgba(23,23,26,.45), rgba(23,23,26,.06) 55%, transparent)' }} />
      <div>
        <h2 className="text-xl font-bold leading-tight text-ink-950"
            style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>
          {title}
        </h2>
        <p className="mt-0.5 text-[11px] text-ink-500">{subtitle}</p>
      </div>
      {right}
    </div>
  )
}
