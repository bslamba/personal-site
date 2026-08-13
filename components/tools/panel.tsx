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

import { useEffect, useMemo, useState } from 'react'

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
      className={`relative flex items-center gap-2 border-t border-ink-100 ${
        dense ? 'px-2.5 py-[5px]' : 'px-3 py-1.5'
      } ${clickable ? 'cursor-pointer hover:bg-signal-50' : ''}`}
    >
      {row.bar !== undefined && (
        <>
          <span className="pointer-events-none absolute inset-y-0 left-0 bg-ink-100"
                style={{ width: `${Math.min(100, row.bar * 100)}%` }} aria-hidden="true" />
          {row.barFail !== undefined && row.barFail > 0 && (
            <span className="pointer-events-none absolute inset-y-0 left-0 bg-signal-500/25"
                  style={{ width: `${Math.min(100, row.bar * row.barFail * 100)}%` }} aria-hidden="true" />
          )}
        </>
      )}
      {columns.map((c, i) => (
        <span
          key={i}
          className={`relative ${i === 0 ? 'min-w-0 flex-1 truncate' : `shrink-0 ${c.width ?? 'w-16'}`} ${
            c.align === 'right' ? 'text-right' : ''
          } ${dense ? 'text-[11px]' : 'text-xs'} ${i === 0 ? 'text-ink-900' : 'font-mono text-ink-600'}`}
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
    <div className={`flex items-center gap-2 bg-paper-dim ${dense ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}>
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

export function Panel({ data, onExpand }: {
  data: PanelData; onExpand: (d: PanelData) => void
}) {
  const shown = data.rows.slice(0, PREVIEW_ROWS)
  const more = data.rows.length - shown.length

  return (
    <section className="flex flex-col border border-ink-200 bg-paper">
      <header className="border-b border-ink-200 px-3 py-2.5">
        <h3 className="text-[13px] font-bold leading-tight text-ink-950"
            style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}>
          {data.title}
        </h3>
        {data.note && <p className="mt-0.5 text-[10.5px] leading-snug text-ink-400">{data.note}</p>}
      </header>

      {data.rows.length === 0 ? (
        <div className="flex-1 px-3 py-5 text-[11px] leading-relaxed text-ink-400">
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

      <footer className="flex items-center justify-between border-t border-ink-100 px-3 py-1.5">
        <span className="text-[10px] text-ink-400">
          {data.rows.length > 0 ? `${n(data.rows.length)} row${data.rows.length === 1 ? '' : 's'}` : ''}
        </span>
        {data.rows.length > 0 && (
          <button
            onClick={() => onExpand(data)}
            className="text-[10px] font-bold uppercase tracking-[0.09em] text-signal-500 hover:underline"
          >
            {more > 0 ? `${n(more)} more — open` : 'Open'}
          </button>
        )}
      </footer>
    </section>
  )
}

/** Full-screen view of one panel: every row, searchable and sortable. */
export function DetailView({ data, onClose }: { data: PanelData; onClose: () => void }) {
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
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-ink-950/55 p-3 sm:p-8"
         onClick={onClose} role="dialog" aria-modal="true" aria-label={data.title}>
      <div className="flex max-h-full w-full max-w-5xl flex-col bg-paper shadow-2xl"
           onClick={e => e.stopPropagation()}>

        <header className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-ink-950"
                style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}>
              {data.title}
            </h3>
            {data.note && <p className="mt-1 text-xs leading-relaxed text-ink-500">{data.note}</p>}
          </div>
          <button onClick={onClose}
                  className="shrink-0 border border-ink-200 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-500 hover:border-signal-500 hover:text-signal-500">
            Close
          </button>
        </header>

        <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-2.5">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Filter these rows…"
            className="w-full border border-ink-200 bg-paper px-3 py-1.5 text-xs text-ink-900 outline-none focus:border-signal-500"
          />
          <span className="shrink-0 font-mono text-[11px] text-ink-400">{n(rows.length)}</span>
        </div>

        <div className="overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-ink-200 bg-paper-dim px-5 py-2">
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
                } text-[9.5px] font-bold uppercase tracking-[0.09em] ${
                  sortCol === i ? 'text-signal-500' : 'text-ink-500'
                } hover:text-signal-500`}
              >
                {c.head}
                <span className={sortCol === i ? '' : 'text-ink-300'}>
                  {sortCol === i ? (desc ? ' ↓' : ' ↑') : ' ⇅'}
                </span>
              </button>
            ))}
          </div>
          <div className="px-5 pb-5">
            {rows.map(r => <Row key={r.id} row={r} columns={data.columns} dense={false} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Kpi({ label, value, sub, tone = 'ink' }: {
  label: string; value: string; sub?: string; tone?: 'ink' | 'red' | 'green'
}) {
  const colour = tone === 'red' ? 'text-signal-500'
    : tone === 'green' ? 'text-[#0F7B4F]' : 'text-ink-950'
  return (
    <div className="border border-ink-200 bg-paper px-3 py-2.5">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-400">{label}</div>
      <div className={`mt-1 text-[1.35rem] font-bold leading-none ${colour}`}
           style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[10px] leading-snug text-ink-400">{sub}</div>}
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

export interface Slice { label: string; value: number }

/**
 * Donut with the total in the middle.
 *
 * Drawn with stroke-dasharray on circles rather than arc paths —
 * far less arithmetic, no rounding seams between segments, and
 * it animates cleanly if that is ever wanted.
 */
export function Donut({ slices, total, centreLabel, centreValue, size = 168 }: {
  slices: Slice[]
  total?: number
  centreLabel?: string
  centreValue?: string
  size?: number
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
              stroke={SERIES_COLOURS[i % SERIES_COLOURS.length]}
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
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: SERIES_COLOURS[i % SERIES_COLOURS.length] }} />
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
export function MultiLine({ labels, series, unit = '', height = 240, emphasise }: {
  labels: string[]
  series: Series[]
  unit?: string
  height?: number
  emphasise?: string[]
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
          const colour = SERIES_COLOURS[si % SERIES_COLOURS.length]
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
            <span className="h-1.5 w-4 rounded-sm"
                  style={{ background: SERIES_COLOURS[i % SERIES_COLOURS.length] }} />
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
    ink:   { bg: 'linear-gradient(145deg,rgba(23,23,26,.045),rgba(23,23,26,.008))', text: 'text-ink-950', edge: 'border-ink-200' },
    red:   { bg: 'linear-gradient(145deg,rgba(211,0,45,.11),rgba(211,0,45,.02))',   text: 'text-signal-500', edge: 'border-signal-500/35' },
    green: { bg: 'linear-gradient(145deg,rgba(15,123,79,.11),rgba(15,123,79,.02))', text: 'text-[#0F7B4F]', edge: 'border-[#0F7B4F]/30' },
    amber: { bg: 'linear-gradient(145deg,rgba(180,83,9,.11),rgba(180,83,9,.02))',   text: 'text-[#B45309]', edge: 'border-[#B45309]/30' },
  }[tone]

  const peak = spark && spark.length ? Math.max(...spark, 1) : 1

  return (
    <div className={`relative overflow-hidden border ${skin.edge} px-3.5 py-3 backdrop-blur-sm`}
         style={{ background: skin.bg }}>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-400">{label}</div>
      <div className={`mt-1.5 text-[1.6rem] font-bold leading-none ${skin.text}`}
           style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[10px] leading-snug text-ink-400">{sub}</div>}

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
    <div className="mb-4 mt-8 flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink-950 pb-2 first:mt-0">
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
