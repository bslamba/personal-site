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
