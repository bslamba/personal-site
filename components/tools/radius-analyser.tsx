'use client'

// ============================================================
// components/tools/radius-analyser.tsx
//
// Upload a Cisco ISE RADIUS Authentications export, press
// Analyse, get a dashboard.
//
// The file is never uploaded anywhere. Papa Parse streams it in
// a Web Worker, the aggregation runs on this machine, and the
// result lives in memory until the tab is closed. These exports
// contain usernames, MAC addresses and site names, and none of
// that should be sitting on someone else's server to produce a
// bar chart.
//
// LAYOUT
// Everything is on one page. Each panel shows the top few rows
// with proper column headers; clicking a panel opens the full
// table with sorting and search. Nothing is hidden behind tabs,
// because the point of a troubleshooting dashboard is to see the
// shape of the whole thing at once.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import {
  StoreBuilder, analyse, looksLikeRadius, detectColumns,
  DIMENSION_LABELS, toCsv,
  type Store, type Analysis, type Bucket, type Filter,
  type Dimension, type Finding,
} from '@/lib/tools/radius'

// ------------------------------------------------------------
// formatting
// ------------------------------------------------------------
const n = (v: number) => Math.round(v).toLocaleString()
const pc = (v: number, d = 1) => (v * 100).toFixed(d) + '%'
const ms = (v: number) => Math.round(v).toLocaleString() + 'ms'

function duration(msTotal: number): string {
  const s = Math.round(msTotal / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function clock(t: number): string {
  const d = new Date(t)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

function stamp(t: number): string {
  const d = new Date(t)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getUTCDate())} ${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })} ` +
         `${d.getUTCFullYear()}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

const rateTone = (r: number) =>
  r > 0.15 ? 'text-signal-500 font-bold'
    : r > 0.08 ? 'text-[#B45309] font-bold'
    : 'text-ink-400'

// ------------------------------------------------------------
// panel model
//
// One shape for every table on the page, so the column headers
// are impossible to forget and every panel behaves the same way.
// ------------------------------------------------------------

type Align = 'left' | 'right'

interface Column {
  head: string
  align: Align
  /** tailwind width class; the first column takes the remainder */
  width?: string
}

interface PanelRow {
  id: string
  /** 0–1, drives the grey volume bar behind the row */
  bar?: number
  /** 0–1 of that bar which is failure, drawn in red */
  barFail?: number
  cells: React.ReactNode[]
  /**
   * Sort keys, parallel to `cells`. Required because several cells
   * are React elements carrying colour, and an element cannot be
   * compared — stringifying one gives "[object Object]", which makes
   * every row equal and sorting silently do nothing.
   */
  sort: (number | string)[]
  onClick?: () => void
}

interface PanelData {
  title: string
  note?: string
  columns: Column[]
  rows: PanelRow[]
  /** shown when there are no rows */
  empty?: React.ReactNode
}

const PREVIEW_ROWS = 6

function Row({ row, columns, dense }: { row: PanelRow; columns: Column[]; dense: boolean }) {
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
                style={{ width: `${row.bar * 100}%` }} aria-hidden="true" />
          {row.barFail !== undefined && row.barFail > 0 && (
            <span className="pointer-events-none absolute inset-y-0 left-0 bg-signal-500/25"
                  style={{ width: `${row.bar * row.barFail * 100}%` }} aria-hidden="true" />
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

function Panel({ data, onExpand }: { data: PanelData; onExpand: (d: PanelData) => void }) {
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
        <div className="flex-1 px-3 py-5 text-[11px] text-ink-400">
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
          {data.rows.length > 0 ? `${n(data.rows.length)} value${data.rows.length === 1 ? '' : 's'}` : ''}
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
function DetailView({ data, onClose }: { data: PanelData; onClose: () => void }) {
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
        if (typeof av === 'number' && typeof bv === 'number') {
          cmp = av - bv
        } else {
          cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true })
        }
        return desc ? -cmp : cmp
      })
    }
    return list
  }, [data.rows, q, sortCol, desc])

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-ink-950/55 p-3 sm:p-8"
         onClick={onClose} role="dialog" aria-modal="true" aria-label={data.title}>
      <div className="flex max-h-full w-full max-w-4xl flex-col bg-paper shadow-2xl"
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
                className={`${i === 0 ? 'min-w-0 flex-1' : `shrink-0 ${c.width ?? 'w-16'}`} ${
                  c.align === 'right' ? 'text-right' : 'text-left'
                } text-[9.5px] font-bold uppercase tracking-[0.09em] ${
                  sortCol === i ? 'text-signal-500' : 'text-ink-500'
                } hover:text-signal-500`}
                title={`Sort by ${c.head}`}
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

// ------------------------------------------------------------
// panel builders
// ------------------------------------------------------------

/** Standard four-column breakdown of a dimension. */
function dimensionPanel(
  title: string,
  buckets: Bucket[],
  valueHead: string,
  note: string | undefined,
  dimension: Dimension | undefined,
  onFilter: ((d: Dimension, k: string) => void) | undefined,
  empty?: React.ReactNode,
): PanelData {
  const rows = buckets.filter(b => b.key !== '(none)')
  const max = Math.max(1, ...rows.map(b => b.total))
  return {
    title,
    note,
    empty,
    columns: [
      { head: valueHead, align: 'left' },
      { head: 'Auths', align: 'right', width: 'w-16' },
      { head: 'Failed', align: 'right', width: 'w-14' },
      { head: 'Fail %', align: 'right', width: 'w-12' },
    ],
    rows: rows.map(b => ({
      id: b.key,
      bar: b.total / max,
      barFail: b.total ? b.fail / b.total : 0,
      onClick: dimension && onFilter ? () => onFilter(dimension, b.key) : undefined,
      cells: [
        b.key,
        n(b.total),
        b.fail ? n(b.fail) : '—',
        <span key="r" className={rateTone(b.failRate)}>{pc(b.failRate)}</span>,
      ],
      sort: [b.key, b.total, b.fail, b.failRate],
    })),
  }
}

// ------------------------------------------------------------
// charts
// ------------------------------------------------------------

function Kpi({ label, value, sub, tone = 'ink' }: {
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

function Timeline({ analysis }: { analysis: Analysis }) {
  const data = analysis.timeline
  if (data.length < 2) return null

  const W = 1200, H = 180, padL = 46, padR = 44, padT = 12, padB = 22
  const iw = W - padL - padR, ih = H - padT - padB
  const maxTotal = Math.max(1, ...data.map(d => d.total))
  const maxRate = Math.max(0.05, ...data.map(d => (d.total ? d.fail / d.total : 0)))
  const bw = iw / data.length
  const x = (i: number) => padL + i * bw
  const yVol = (v: number) => padT + ih - (v / maxTotal) * ih
  const yRate = (v: number) => padT + ih - (v / maxRate) * ih

  const line = data.map((d, i) => {
    const r = d.total ? d.fail / d.total : 0
    return `${i === 0 ? 'M' : 'L'}${(x(i) + bw / 2).toFixed(1)},${yRate(r).toFixed(1)}`
  }).join(' ')

  const ticks = [0, Math.floor(data.length / 4), Math.floor(data.length / 2),
                 Math.floor(data.length * 3 / 4), data.length - 1]

  return (
    <section className="border border-ink-200 bg-paper">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-200 px-3 py-2.5">
        <h3 className="text-[13px] font-bold text-ink-950"
            style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}>
          Authentications over time
        </h3>
        <p className="text-[10.5px] text-ink-400">
          One bar per {duration(analysis.bucketMs)} · grey bar = total · red bar = failed ·
          red line = failure rate · peak {n(analysis.peakPerMinute)}/min
        </p>
      </header>
      <div className="p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
             aria-label="Authentication volume and failure rate over time">
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <line key={f} x1={padL} x2={W - padR} y1={padT + ih * f} y2={padT + ih * f}
                  stroke="#ECECEF" strokeWidth="1" />
          ))}
          {data.map((d, i) => (
            <rect key={i} x={x(i) + bw * 0.12} width={Math.max(bw * 0.76, 0.6)}
                  y={yVol(d.total)} height={Math.max(padT + ih - yVol(d.total), 0)} fill="#D9D9DE" />
          ))}
          {data.map((d, i) => (
            <rect key={'f' + i} x={x(i) + bw * 0.12} width={Math.max(bw * 0.76, 0.6)}
                  y={yVol(d.fail)} height={Math.max(padT + ih - yVol(d.fail), 0)}
                  fill="#D3002D" opacity="0.5" />
          ))}
          <path d={line} fill="none" stroke="#D3002D" strokeWidth="1.8"
                strokeLinejoin="round" strokeLinecap="round" />

          <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize="10" fill="#8A8A93">{n(maxTotal)}</text>
          <text x={padL - 6} y={padT + ih} textAnchor="end" fontSize="10" fill="#8A8A93">0</text>
          <text x={padL - 6} y={padT - 2} textAnchor="end" fontSize="8" fill="#B5B5BC">auths</text>
          <text x={W - padR + 6} y={padT + 4} fontSize="10" fill="#D3002D">{pc(maxRate, 0)}</text>
          <text x={W - padR + 6} y={padT + ih} fontSize="10" fill="#D3002D">0%</text>
          <text x={W - padR + 6} y={padT - 2} fontSize="8" fill="#E58098">fail rate</text>

          {ticks.map(i => (
            <text key={i} x={x(i) + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#8A8A93">
              {clock(data[i].t)}
            </text>
          ))}
        </svg>
      </div>
    </section>
  )
}

function FindingCard({ f, onFilter }: { f: Finding; onFilter: (d: Dimension, k: string) => void }) {
  return (
    <div className="border border-ink-200 border-l-2 border-l-signal-500 bg-paper p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-bold leading-tight text-ink-950"
           style={{ fontFamily: 'var(--font-heading)' }}>
          {f.headline}
        </p>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-400">{f.label}</span>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-600">{f.detail}</p>
      <button onClick={() => onFilter(f.dimension, f.key)}
              className="mt-2 text-[10px] font-bold uppercase tracking-[0.09em] text-signal-500 hover:underline">
        Filter to this →
      </button>
    </div>
  )
}

// ------------------------------------------------------------
// main
// ------------------------------------------------------------

type Phase = 'idle' | 'reading' | 'ready' | 'error'

export default function RadiusAnalyser() {
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [rowsSeen, setRowsSeen] = useState(0)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<Filter[]>([])
  const [detail, setDetail] = useState<PanelData | null>(null)
  const [, forceRender] = useState(0)

  const storeRef = useRef<Store | null>(null)
  const dropRef = useRef<HTMLDivElement | null>(null)

  const analysis: Analysis | null = useMemo(() => {
    if (!storeRef.current) return null
    return analyse(storeRef.current, filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, phase])

  const pick = (f: File | null) => {
    setFile(f); setPhase('idle'); setError(''); setFilters([]); storeRef.current = null
  }

  const run = useCallback(() => {
    if (!file) return
    setPhase('reading'); setProgress(0); setRowsSeen(0); setError('')
    setFilters([]); storeRef.current = null

    let builder: StoreBuilder | null = null
    let headerChecked = false

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      worker: true,
      chunkSize: 4 * 1024 * 1024,

      chunk: (results, parser) => {
        if (!headerChecked) {
          headerChecked = true
          const headers = results.meta.fields ?? []
          if (!looksLikeRadius(detectColumns(headers))) {
            parser.abort()
            setPhase('error')
            setError(
              'This does not look like a RADIUS Authentications export. Columns found: ' +
              headers.slice(0, 14).join(', ') +
              (headers.length > 14 ? ` … and ${headers.length - 14} more.` : '')
            )
            return
          }
          builder = new StoreBuilder(headers)
        }
        if (!builder) return
        for (const rec of results.data) builder.push(rec)
        setRowsSeen(builder.count)
        const cursor = (results.meta as { cursor?: number }).cursor ?? 0
        if (file.size) setProgress(Math.min(99, (cursor / file.size) * 100))
      },

      complete: () => {
        if (!builder) return
        storeRef.current = builder.finish()
        setProgress(100); setPhase('ready'); forceRender(v => v + 1)
      },

      error: err => { setPhase('error'); setError(err.message || 'The file could not be read.') },
    })
  }, [file])

  const addFilter = useCallback((dimension: Dimension, key: string) => {
    setDetail(null)
    setFilters(prev => {
      const existing = prev.find(f => f.dimension === dimension)
      if (existing && existing.key === key) return prev.filter(f => f.dimension !== dimension)
      return [...prev.filter(f => f.dimension !== dimension), { dimension, key }]
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const download = (kind: 'csv' | 'json') => {
    if (!analysis) return
    const body = kind === 'csv' ? toCsv(analysis) : JSON.stringify({
      generated: new Date().toISOString(),
      source: file?.name, filters,
      summary: {
        total: analysis.total, pass: analysis.pass, fail: analysis.fail,
        failRate: analysis.failRate,
        window: { start: analysis.windowStart, end: analysis.windowEnd },
        responseTime: analysis.rtPercentiles,
      },
      findings: analysis.findings,
      failures: analysis.failures,
      dimensions: analysis.dims,
    }, null, 2)

    const blob = new Blob([body], { type: kind === 'csv' ? 'text/csv' : 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `radius-analysis-${new Date().toISOString().slice(0, 10)}.${kind}`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ---------- landing ----------
  if (!analysis || phase !== 'ready') {
    return (
      <div className="container-page py-12">
        <div
          ref={dropRef}
          onDragOver={e => { e.preventDefault(); dropRef.current?.classList.add('drop-live') }}
          onDragLeave={() => dropRef.current?.classList.remove('drop-live')}
          onDrop={e => {
            e.preventDefault()
            dropRef.current?.classList.remove('drop-live')
            const f = e.dataTransfer.files?.[0]
            if (f) pick(f)
          }}
          className="tool-drop border-2 border-dashed border-ink-200 bg-paper p-8 text-center transition-colors"
        >
          <p className="text-lg font-bold text-ink-950" style={{ fontFamily: 'var(--font-heading)' }}>
            Drop the CSV here
          </p>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-ink-500">
            A Cisco ISE <strong>RADIUS Authentications</strong> export. The file stays on this
            computer — it is read in your browser and never uploaded.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <label className="btn-ghost cursor-pointer">
              Choose file
              <input type="file" accept=".csv,text/csv" className="sr-only"
                     onChange={e => pick(e.target.files?.[0] ?? null)} />
            </label>
            <button onClick={run} disabled={!file || phase === 'reading'}
                    className="btn-signal disabled:cursor-not-allowed disabled:opacity-40">
              {phase === 'reading' ? 'Analysing…' : 'Analyse'}
            </button>
          </div>

          {file && (
            <p className="mt-4 font-mono text-xs text-ink-600">
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
            </p>
          )}

          {phase === 'reading' && (
            <div className="mx-auto mt-5 max-w-md">
              <div className="h-1.5 w-full overflow-hidden bg-ink-100">
                <div className="h-full bg-signal-500 transition-[width] duration-150"
                     style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 font-mono text-xs text-ink-500">{n(rowsSeen)} rows read</p>
            </div>
          )}

          {phase === 'error' && (
            <p className="mx-auto mt-5 max-w-xl border border-signal-500 bg-signal-50 p-3 text-sm text-signal-700">
              {error}
            </p>
          )}
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {[
            ['Where to get the file', 'In ISE: Operations → Reports → Reports → Endpoints and Users → RADIUS Authentications. Set your time range, then Export.'],
            ['What it reads', 'Pass and fail counts, failure reasons with ISE codes, ISE nodes, network devices, policy sets, protocols, identity stores, endpoints and response times.'],
            ['What it does not do', 'Nothing leaves your browser, so nothing is stored, logged or sent. Close the tab and the analysis is gone.'],
          ].map(([h, b]) => (
            <div key={h} className="border-t-2 border-ink-950 pt-4">
              <p className="label text-signal-500">{h}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{b}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ---------- dashboard ----------
  const a = analysis
  const healthy = a.failRate < 0.05
  const F = (d: Dimension, k: string) => addFilter(d, k)

  const maxFailure = Math.max(1, ...a.failures.map(f => f.count))
  const maxCategory = Math.max(1, ...a.categories.map(c => c.total))
  const maxHist = Math.max(1, ...a.rtHistogram.map(r => r.count))
  const histTotal = a.rtHistogram.reduce((s, r) => s + r.count, 0)
  const maxSlow = Math.max(1, ...a.slowest.map(b => b.rtAvg))
  const maxNodeRt = Math.max(1, ...a.dims.server.map(b => b.rtAvg))

  const failureReasons: PanelData = {
    title: 'Failure reasons',
    note: 'Every distinct reason with its ISE message code, and the device producing most of them.',
    columns: [
      { head: 'Reason', align: 'left' },
      { head: 'Code', align: 'right', width: 'w-12' },
      { head: 'Count', align: 'right', width: 'w-14' },
      { head: 'Share', align: 'right', width: 'w-12' },
      { head: 'Worst device', align: 'right', width: 'w-40' },
    ],
    rows: a.failures.map(f => ({
      id: (f.code || '') + f.text,
      bar: f.count / maxFailure,
      barFail: 1,
      cells: [
        f.text,
        <span key="c" className="text-signal-500">{f.code || '—'}</span>,
        n(f.count),
        pc(f.share),
        <span key="d" className="truncate text-ink-500">{f.topDevice || '—'}</span>,
      ],
      sort: [f.text, Number(f.code) || 0, f.count, f.share, f.topDevice || ''],
    })),
    empty: 'No failures in this selection.',
  }

  const failureFamilies: PanelData = {
    title: 'Failure families',
    note: 'ISE message codes grouped by subsystem — which part of the exchange is breaking.',
    columns: [
      { head: 'Family', align: 'left' },
      { head: 'Failures', align: 'right', width: 'w-16' },
      { head: 'Share', align: 'right', width: 'w-12' },
    ],
    rows: a.categories.map(c => ({
      id: c.key,
      bar: c.total / maxCategory,
      barFail: 1,
      cells: [c.key, n(c.total), pc(a.fail ? c.total / a.fail : 0)],
      sort: [c.key, c.total, a.fail ? c.total / a.fail : 0],
    })),
    empty: 'No failures in this selection.',
  }

  const responseHistogram: PanelData = {
    title: 'Response time distribution',
    note: 'How long ISE took to answer. A long tail here is worth chasing before users report it.',
    columns: [
      { head: 'Response time', align: 'left' },
      { head: 'Auths', align: 'right', width: 'w-16' },
      { head: 'Share', align: 'right', width: 'w-12' },
    ],
    rows: a.rtHistogram.map(r => ({
      id: `${r.from}`,
      bar: r.count / maxHist,
      cells: [
        r.to === Infinity ? `${r.from}ms and above` : `${r.from} – ${r.to}ms`,
        n(r.count),
        pc(histTotal ? r.count / histTotal : 0),
      ],
      // sorted by the lower edge, so the buckets stay in numeric order
      sort: [r.from, r.count, histTotal ? r.count / histTotal : 0],
    })),
  }

  const slowestDevices: PanelData = {
    title: 'Slowest network devices',
    note: 'Mean response time, devices with 30+ authentications. Slow here often means WAN path, not ISE.',
    columns: [
      { head: 'Network device', align: 'left' },
      { head: 'Mean', align: 'right', width: 'w-16' },
      { head: 'Auths', align: 'right', width: 'w-16' },
      { head: 'Fail %', align: 'right', width: 'w-12' },
    ],
    rows: a.slowest.map(b => ({
      id: b.key,
      bar: b.rtAvg / maxSlow,
      onClick: () => F('device', b.key),
      cells: [b.key, ms(b.rtAvg), n(b.total),
        <span key="r" className={rateTone(b.failRate)}>{pc(b.failRate)}</span>],
      sort: [b.key, b.rtAvg, b.total, b.failRate],
    })),
  }

  const nodePerformance: PanelData = {
    title: 'ISE node performance',
    note: 'One slow node points at that node. All of them slow points at the identity store.',
    columns: [
      { head: 'ISE node', align: 'left' },
      { head: 'Auths', align: 'right', width: 'w-16' },
      { head: 'Mean', align: 'right', width: 'w-16' },
      { head: 'Fail %', align: 'right', width: 'w-12' },
    ],
    rows: a.dims.server.filter(b => b.key !== '(none)').map(b => ({
      id: b.key,
      bar: b.rtCount ? b.rtAvg / maxNodeRt : 0,
      onClick: () => F('server', b.key),
      cells: [b.key, n(b.total), b.rtCount ? ms(b.rtAvg) : '—',
        <span key="r" className={rateTone(b.failRate)}>{pc(b.failRate)}</span>],
      sort: [b.key, b.total, b.rtAvg, b.failRate],
    })),
  }

  const emptyCols: PanelData = {
    title: 'Columns with no data',
    note: 'Present in the export but empty on every row — ISE populates these only in certain deployments.',
    columns: [{ head: 'Column name', align: 'left' }],
    rows: a.emptyColumns.map(c => ({ id: c, cells: [c], sort: [c] })),
    empty: 'Every column in the file contains data.',
  }

  const byFail = (list: Bucket[]) => [...list].sort((x, y) => y.fail - x.fail).filter(b => b.fail > 0)

  const panels: PanelData[] = [
    failureReasons,
    failureFamilies,
    dimensionPanel('ISE nodes', a.dims.server, 'ISE node (PSN)',
      'Volume should be even behind a load balancer. Skew means an uneven RADIUS server list on the NADs.',
      'server', F),
    dimensionPanel('Network devices', a.dims.device, 'Network device',
      'Switches and wireless controllers. Where a site-specific fault shows up first.', 'device', F),
    dimensionPanel('NAD IP addresses', a.dims.nasIp, 'NAS IP address', undefined, 'nasIp', F),
    dimensionPanel('Device types', a.dims.deviceType, 'Device type', undefined, 'deviceType', F),
    dimensionPanel('Locations', a.dims.location, 'Location', undefined, 'location', F),
    dimensionPanel('SSIDs', a.dims.ssid, 'SSID', 'Taken from Called-Station-ID.', 'ssid', F,
      <>
        This export has no SSID data. On wireless the SSID travels in the
        <span className="font-mono"> Called-Station-ID </span> attribute, which the standard
        RADIUS Authentications report template omits. Export from <strong>Operations →
        RADIUS → Live Logs</strong> instead, or add that column to a custom report — this
        panel fills itself in automatically when the column is present.
      </>),
    dimensionPanel('Authentication protocols', a.dims.protocol, 'Protocol',
      'A protocol failing at 100% almost always means it is not permitted in Allowed Protocols.',
      'protocol', F),
    dimensionPanel('Authentication methods', a.dims.method, 'Method', undefined, 'method', F),
    dimensionPanel('Credential checks', a.dims.credential, 'Credential check', undefined, 'credential', F),
    dimensionPanel('Identity stores', a.dims.identityStore, 'Identity store', undefined, 'identityStore', F),
    dimensionPanel('Policy sets', a.dims.policySet, 'Policy set', undefined, 'policySet', F),
    dimensionPanel('Authorization rules', a.dims.authzRule, 'Authorization rule', undefined, 'authzRule', F),
    dimensionPanel('Authorization profiles', a.dims.authzProfile, 'Authorization profile', undefined, 'authzProfile', F),
    dimensionPanel('Identity groups', a.dims.identityGroup, 'Identity group', undefined, 'identityGroup', F),
    dimensionPanel('Endpoint profiles', a.dims.endpointProfile, 'Endpoint profile',
      'A high share of Unknown means profiling probes are not seeing these endpoints.',
      'endpointProfile', F),
    dimensionPanel('Endpoints failing most', byFail(a.dims.mac), 'Endpoint MAC',
      'One MAC failing repeatedly is usually a single broken supplicant or an expired certificate.',
      'mac', F, 'No failing endpoints in this selection.'),
    dimensionPanel('Users failing most', byFail(a.dims.user), 'User name',
      'Repeated failures for one identity point at credentials, group membership or account state.',
      'user', F, 'No failing users in this selection.'),
    dimensionPanel('Service types', a.dims.serviceType, 'Service type', undefined, 'serviceType', F),
    responseHistogram,
    slowestDevices,
    nodePerformance,
    emptyCols,
  ]

  return (
    <div className="container-page py-8">

      {/* ---------- toolbar ---------- */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-[11px] text-ink-500">{file?.name}</p>
          <p className="text-xs text-ink-700">
            {n(a.rows)} rows · {stamp(a.windowStart)} to {clock(a.windowEnd)} · {duration(a.windowMs)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => download('csv')} className="btn-ghost !px-3 !py-1.5 !text-[0.6rem]">Export CSV</button>
          <button onClick={() => download('json')} className="btn-ghost !px-3 !py-1.5 !text-[0.6rem]">Export JSON</button>
          <button onClick={() => { pick(null); setPhase('idle') }} className="btn-ghost !px-3 !py-1.5 !text-[0.6rem]">New file</button>
        </div>
      </div>

      {a.truncated && (
        <p className="mb-3 border border-[#B45309] bg-[#FFF7ED] p-2.5 text-xs text-[#7C2D12]">
          This file exceeded the row limit and was truncated. Figures cover the first rows only.
        </p>
      )}

      {/* ---------- filters ---------- */}
      {filters.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-400">Filtered to</span>
          {filters.map(f => (
            <button key={f.dimension}
                    onClick={() => setFilters(prev => prev.filter(x => x.dimension !== f.dimension))}
                    className="inline-flex items-center gap-1.5 border border-signal-500 bg-signal-50 px-2.5 py-1 text-[11px] text-signal-700 hover:bg-signal-100">
              <span className="font-medium">{DIMENSION_LABELS[f.dimension]}:</span>
              <span className="font-mono">{f.key}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
          <button onClick={() => setFilters([])}
                  className="text-[10px] font-bold uppercase tracking-[0.09em] text-ink-400 hover:text-signal-500">
            Clear all
          </button>
        </div>
      )}

      {/* ---------- KPIs ---------- */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        <Kpi label="Authentications" value={n(a.total)} sub={`${a.perSecond.toFixed(1)}/sec`} />
        <Kpi label="Passed" value={n(a.pass)} tone="green" sub={pc(1 - a.failRate)} />
        <Kpi label="Failed" value={n(a.fail)} tone="red" sub={pc(a.failRate)} />
        <Kpi label="Failure rate" value={pc(a.failRate, 2)} tone={healthy ? 'green' : 'red'}
             sub={healthy ? 'within normal range' : 'above 5%'} />
        <Kpi label="Median response" value={ms(a.rtPercentiles.p50)} sub={`p95 ${ms(a.rtPercentiles.p95)}`} />
        <Kpi label="99th percentile" value={ms(a.rtPercentiles.p99)}
             tone={a.rtPercentiles.p99 > 1000 ? 'red' : 'ink'} sub={`max ${ms(a.rtPercentiles.max)}`} />
        <Kpi label="Endpoints" value={n(a.distinct.mac)} />
        <Kpi label="Users" value={n(a.distinct.user)} />
        <Kpi label="Network devices" value={n(a.distinct.device)} />
        <Kpi label="ISE nodes" value={n(a.distinct.server)} />
        <Kpi label="Failure reasons" value={n(a.failures.length)} />
        <Kpi label="Policy sets" value={n(a.distinct.policySet)} />
      </div>

      {/* ---------- timeline ---------- */}
      <div className="mb-4"><Timeline analysis={a} /></div>

      {/* ---------- findings ---------- */}
      <section className="mb-4 border border-ink-200 bg-paper-dim p-3">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-bold text-ink-950"
              style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}>
            What stands out
          </h3>
          <p className="text-[10.5px] text-ink-400">
            Ranked by failures beyond what the overall rate predicts. Values covering most of the
            data are excluded — they are the baseline.
          </p>
        </div>
        {a.findings.length === 0 ? (
          <p className="border border-ink-200 bg-paper p-3 text-[11.5px] text-ink-500">
            Nothing is statistically apart from the baseline. Failures are spread evenly rather
            than concentrated, which usually points at a general condition rather than a
            specific fault.
          </p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {a.findings.map((f, i) => <FindingCard key={i} f={f} onFilter={addFilter} />)}
          </div>
        )}
      </section>

      {/* ---------- every panel ---------- */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {panels.map(p => <Panel key={p.title} data={p} onExpand={setDetail} />)}
      </div>

      <p className="mt-6 max-w-3xl text-[11px] leading-relaxed text-ink-400">
        Every panel shows its top {PREVIEW_ROWS} rows — open any of them for the full list with
        sorting and search. Clicking a row filters the entire dashboard to that value. This file
        was read inside your browser; nothing was uploaded, stored or logged, and reloading the
        tab discards it.
      </p>

      {detail && <DetailView data={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
