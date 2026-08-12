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
// ============================================================

import { useCallback, useMemo, useRef, useState } from 'react'
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

// ------------------------------------------------------------
// primitives
// ------------------------------------------------------------

function Kpi({ label, value, sub, tone = 'ink' }: {
  label: string; value: string; sub?: string; tone?: 'ink' | 'red' | 'green'
}) {
  const colour = tone === 'red' ? 'text-signal-500'
    : tone === 'green' ? 'text-[#0F7B4F]' : 'text-ink-950'
  return (
    <div className="border border-ink-200 bg-paper p-4">
      <div className="label text-ink-400">{label}</div>
      <div className={`mt-2 text-[1.75rem] font-bold leading-none ${colour}`}
           style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-xs text-ink-500">{sub}</div>}
    </div>
  )
}

function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="mb-4 mt-10 first:mt-0">
      <h3 className="text-lg font-bold text-ink-950"
          style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}>
        {children}
      </h3>
      {note && <p className="mt-1 text-sm text-ink-500">{note}</p>}
    </div>
  )
}

/**
 * The workhorse. One row per value: a bar showing total volume with
 * the failed portion filled in red, so relative size and relative
 * health read at the same time. Clicking a row filters the whole
 * dashboard to that value.
 */
function BarList({
  title, note, buckets, dimension, onFilter, limit = 12, showRate = true,
}: {
  title: string
  note?: string
  buckets: Bucket[]
  dimension?: Dimension
  onFilter?: (d: Dimension, key: string) => void
  limit?: number
  showRate?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const rows = buckets.filter(b => b.key !== '(none)')
  const shown = expanded ? rows : rows.slice(0, limit)
  const max = Math.max(1, ...rows.map(b => b.total))

  if (rows.length === 0) {
    return (
      <div className="mb-8">
        <SectionTitle note={note}>{title}</SectionTitle>
        <p className="border border-dashed border-ink-200 p-4 text-sm text-ink-400">
          Not populated in this export.
        </p>
      </div>
    )
  }

  return (
    <div className="mb-8">
      <SectionTitle note={note}>{title}</SectionTitle>
      <div className="border border-ink-200">
        {shown.map((b, i) => {
          const w = (b.total / max) * 100
          const failW = b.total > 0 ? (b.fail / b.total) * 100 : 0
          const clickable = Boolean(dimension && onFilter)
          return (
            <div
              key={b.key}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={() => clickable && onFilter!(dimension!, b.key)}
              onKeyDown={e => {
                if (clickable && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault(); onFilter!(dimension!, b.key)
                }
              }}
              className={`relative flex items-center gap-3 px-3 py-2 ${
                i > 0 ? 'border-t border-ink-100' : ''
              } ${clickable ? 'cursor-pointer hover:bg-paper-dim' : ''}`}
            >
              {/* volume bar, sitting behind the text */}
              <span
                className="pointer-events-none absolute inset-y-0 left-0 bg-ink-100"
                style={{ width: `${w}%` }}
                aria-hidden="true"
              />
              <span
                className="pointer-events-none absolute inset-y-0 left-0 bg-signal-500/25"
                style={{ width: `${(w * failW) / 100}%` }}
                aria-hidden="true"
              />

              <span className="relative min-w-0 flex-1 truncate text-sm text-ink-900" title={b.key}>
                {b.key}
              </span>
              <span className="relative w-20 shrink-0 text-right font-mono text-xs text-ink-700">
                {n(b.total)}
              </span>
              {showRate && (
                <>
                  <span className="relative w-16 shrink-0 text-right font-mono text-xs text-ink-500">
                    {n(b.fail)}
                  </span>
                  <span className={`relative w-14 shrink-0 text-right font-mono text-xs font-bold ${
                    b.failRate > 0.15 ? 'text-signal-500'
                      : b.failRate > 0.08 ? 'text-[#B45309]' : 'text-ink-400'
                  }`}>
                    {pc(b.failRate)}
                  </span>
                </>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-ink-400">
        <span>
          {showRate ? 'Columns: total · failed · failure rate' : 'Total'}
          {dimension && onFilter ? ' · click a row to filter' : ''}
        </span>
        {rows.length > limit && (
          <button onClick={() => setExpanded(v => !v)}
                  className="font-medium text-signal-500 hover:underline">
            {expanded ? 'Show fewer' : `Show all ${rows.length}`}
          </button>
        )}
      </div>
    </div>
  )
}

/** Volume bars with a failure-rate line over the top. */
function Timeline({ analysis }: { analysis: Analysis }) {
  const data = analysis.timeline
  if (data.length < 2) return null

  const W = 1000, H = 240, padL = 48, padR = 44, padT = 16, padB = 28
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

  const ticks = [0, Math.floor(data.length / 2), data.length - 1]

  return (
    <div className="mb-8">
      <SectionTitle note={`One bar per ${duration(analysis.bucketMs)}. Grey is volume, the red line is failure rate.`}>
        Authentications over time
      </SectionTitle>
      <div className="border border-ink-200 bg-paper p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
             aria-label="Authentication volume and failure rate over time">
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <line key={f} x1={padL} x2={W - padR}
                  y1={padT + ih * f} y2={padT + ih * f}
                  stroke="#ECECEF" strokeWidth="1" />
          ))}

          {data.map((d, i) => (
            <rect key={i} x={x(i) + bw * 0.12} width={Math.max(bw * 0.76, 0.6)}
                  y={yVol(d.total)} height={Math.max(padT + ih - yVol(d.total), 0)}
                  fill="#D9D9DE" />
          ))}
          {data.map((d, i) => (
            <rect key={'f' + i} x={x(i) + bw * 0.12} width={Math.max(bw * 0.76, 0.6)}
                  y={yVol(d.fail)} height={Math.max(padT + ih - yVol(d.fail), 0)}
                  fill="#D3002D" opacity="0.5" />
          ))}

          <path d={line} fill="none" stroke="#D3002D" strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round" />

          <text x={padL - 8} y={padT + 4} textAnchor="end" fontSize="11" fill="#8A8A93">
            {n(maxTotal)}
          </text>
          <text x={padL - 8} y={padT + ih} textAnchor="end" fontSize="11" fill="#8A8A93">0</text>
          <text x={W - padR + 8} y={padT + 4} fontSize="11" fill="#D3002D">{pc(maxRate, 0)}</text>
          <text x={W - padR + 8} y={padT + ih} fontSize="11" fill="#D3002D">0%</text>

          {ticks.map(i => (
            <text key={i} x={x(i) + bw / 2} y={H - 8} textAnchor="middle"
                  fontSize="11" fill="#8A8A93">
              {clock(data[i].t)}
            </text>
          ))}
        </svg>
      </div>
      <p className="mt-2 text-xs text-ink-400">
        Times shown in the file&apos;s own timezone. Peak {n(analysis.peakPerMinute)} authentications per minute.
      </p>
    </div>
  )
}

function Histogram({ analysis }: { analysis: Analysis }) {
  const rows = analysis.rtHistogram
  const total = rows.reduce((a, b) => a + b.count, 0)
  const max = Math.max(1, ...rows.map(r => r.count))
  if (total === 0) return null

  return (
    <div className="mb-8">
      <SectionTitle note="How long ISE took to answer. A long tail here is worth chasing before users report it.">
        Response time distribution
      </SectionTitle>
      <div className="border border-ink-200">
        {rows.map((r, i) => (
          <div key={i} className={`relative flex items-center gap-3 px-3 py-1.5 ${
            i > 0 ? 'border-t border-ink-100' : ''}`}>
            <span className="pointer-events-none absolute inset-y-0 left-0 bg-ink-100"
                  style={{ width: `${(r.count / max) * 100}%` }} aria-hidden="true" />
            <span className="relative w-28 shrink-0 font-mono text-xs text-ink-700">
              {r.to === Infinity ? `${r.from}ms +` : `${r.from}–${r.to}ms`}
            </span>
            <span className="relative flex-1" />
            <span className="relative w-20 text-right font-mono text-xs text-ink-700">{n(r.count)}</span>
            <span className="relative w-14 text-right font-mono text-xs text-ink-400">
              {pc(r.count / total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FindingCard({ f, onFilter }: { f: Finding; onFilter: (d: Dimension, k: string) => void }) {
  return (
    <div className="border-l-2 border-signal-500 bg-paper p-4 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold text-ink-950" style={{ fontFamily: 'var(--font-heading)' }}>
          {f.headline}
        </p>
        <span className="label text-ink-400">{f.label}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{f.detail}</p>
      <button
        onClick={() => onFilter(f.dimension, f.key)}
        className="mt-3 text-xs font-bold uppercase tracking-wider text-signal-500 hover:underline"
      >
        Filter the dashboard to this →
      </button>
    </div>
  )
}

// ------------------------------------------------------------
// main
// ------------------------------------------------------------

type Phase = 'idle' | 'reading' | 'ready' | 'error'
type Tab = 'overview' | 'failures' | 'infra' | 'identity' | 'perf' | 'data'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'failures', label: 'Failures' },
  { id: 'infra',    label: 'Infrastructure' },
  { id: 'identity', label: 'Identity & policy' },
  { id: 'perf',     label: 'Performance' },
  { id: 'data',     label: 'Data quality' },
]

export default function RadiusAnalyser() {
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [rowsSeen, setRowsSeen] = useState(0)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [filters, setFilters] = useState<Filter[]>([])
  const [, forceRender] = useState(0)

  const storeRef = useRef<Store | null>(null)
  const dropRef = useRef<HTMLDivElement | null>(null)

  const analysis: Analysis | null = useMemo(() => {
    if (!storeRef.current) return null
    return analyse(storeRef.current, filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, phase])

  const pick = (f: File | null) => {
    setFile(f)
    setPhase('idle')
    setError('')
    setFilters([])
    storeRef.current = null
  }

  const run = useCallback(() => {
    if (!file) return
    setPhase('reading')
    setProgress(0)
    setRowsSeen(0)
    setError('')
    setFilters([])
    storeRef.current = null

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
          const map = detectColumns(headers)
          if (!looksLikeRadius(map)) {
            parser.abort()
            setPhase('error')
            setError(
              'This does not look like a RADIUS Authentications export. ' +
              'Columns found: ' + headers.slice(0, 14).join(', ') +
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
        setProgress(100)
        setPhase('ready')
        setTab('overview')
        forceRender(v => v + 1)
      },

      error: err => {
        setPhase('error')
        setError(err.message || 'The file could not be read.')
      },
    })
  }, [file])

  const addFilter = useCallback((dimension: Dimension, key: string) => {
    setFilters(prev => {
      const existing = prev.find(f => f.dimension === dimension)
      if (existing && existing.key === key) {
        return prev.filter(f => f.dimension !== dimension)
      }
      return [...prev.filter(f => f.dimension !== dimension), { dimension, key }]
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const download = (kind: 'csv' | 'json') => {
    if (!analysis) return
    const body = kind === 'csv' ? toCsv(analysis) : JSON.stringify({
      generated: new Date().toISOString(),
      source: file?.name,
      filters,
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

  // ---------- upload panel ----------
  const uploader = (
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
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={e => pick(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          onClick={run}
          disabled={!file || phase === 'reading'}
          className="btn-signal disabled:cursor-not-allowed disabled:opacity-40"
        >
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
          <p className="mt-2 font-mono text-xs text-ink-500">
            {n(rowsSeen)} rows read
          </p>
        </div>
      )}

      {phase === 'error' && (
        <p className="mx-auto mt-5 max-w-xl border border-signal-500 bg-signal-50 p-3 text-sm text-signal-700">
          {error}
        </p>
      )}
    </div>
  )

  if (!analysis || phase !== 'ready') {
    return (
      <div className="container-page py-12">
        {uploader}
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

  const a = analysis
  const healthy = a.failRate < 0.05

  return (
    <div className="container-page py-10">

      {/* ---------- toolbar ---------- */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-4">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-ink-500">{file?.name}</p>
          <p className="text-sm text-ink-700">
            {n(a.rows)} rows · {stamp(a.windowStart)} to {clock(a.windowEnd)} · {duration(a.windowMs)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => download('csv')} className="btn-ghost !px-4 !py-2 !text-[0.65rem]">
            Export CSV
          </button>
          <button onClick={() => download('json')} className="btn-ghost !px-4 !py-2 !text-[0.65rem]">
            Export JSON
          </button>
          <button onClick={() => { pick(null); setPhase('idle') }}
                  className="btn-ghost !px-4 !py-2 !text-[0.65rem]">
            New file
          </button>
        </div>
      </div>

      {a.truncated && (
        <p className="mb-4 border border-[#B45309] bg-[#FFF7ED] p-3 text-sm text-[#7C2D12]">
          This file exceeded the row limit and was truncated. The figures below cover the first
          rows only.
        </p>
      )}

      {/* ---------- active filters ---------- */}
      {filters.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="label text-ink-400">Filtered to</span>
          {filters.map(f => (
            <button
              key={f.dimension}
              onClick={() => setFilters(prev => prev.filter(x => x.dimension !== f.dimension))}
              className="inline-flex items-center gap-2 border border-signal-500 bg-signal-50 px-3 py-1 text-xs text-signal-700 hover:bg-signal-100"
            >
              <span className="font-medium">{DIMENSION_LABELS[f.dimension]}:</span>
              <span className="font-mono">{f.key}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
          <button onClick={() => setFilters([])}
                  className="text-xs font-bold uppercase tracking-wider text-ink-400 hover:text-signal-500">
            Clear all
          </button>
        </div>
      )}

      {/* ---------- tabs ---------- */}
      <div className="mb-8 flex flex-wrap gap-1 border-b border-ink-200">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-[0.7rem] font-bold uppercase tracking-[0.12em] transition-colors ${
              tab === t.id
                ? 'border-b-2 border-signal-500 text-ink-950'
                : 'border-b-2 border-transparent text-ink-400 hover:text-ink-700'
            }`}
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ================= OVERVIEW ================= */}
      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <Kpi label="Authentications" value={n(a.total)}
                 sub={`${a.perSecond.toFixed(1)} per second`} />
            <Kpi label="Passed" value={n(a.pass)} tone="green"
                 sub={pc(1 - a.failRate) + ' of total'} />
            <Kpi label="Failed" value={n(a.fail)} tone="red"
                 sub={pc(a.failRate) + ' of total'} />
            <Kpi label="Failure rate" value={pc(a.failRate, 2)}
                 tone={healthy ? 'green' : 'red'}
                 sub={healthy ? 'within normal range' : 'above 5% — worth investigating'} />
            <Kpi label="Median response" value={ms(a.rtPercentiles.p50)}
                 sub={`p95 ${ms(a.rtPercentiles.p95)}`} />
            <Kpi label="Unique endpoints" value={n(a.distinct.mac)} />
            <Kpi label="Unique users" value={n(a.distinct.user)} />
            <Kpi label="Network devices" value={n(a.distinct.device)} />
            <Kpi label="ISE nodes" value={n(a.distinct.server)} />
            <Kpi label="Distinct failure reasons" value={n(a.failures.length)} />
          </div>

          <Timeline analysis={a} />

          <SectionTitle note="Ranked by how many failures each is responsible for beyond what the overall rate would predict. Values covering most of the data are excluded — they are the baseline.">
            What stands out
          </SectionTitle>
          {a.findings.length === 0 ? (
            <p className="border border-ink-200 p-5 text-sm text-ink-500">
              Nothing is statistically apart from the baseline. Failures are spread evenly
              rather than concentrated in one site, device or method — which usually points
              at a general condition rather than a specific fault.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {a.findings.map((f, i) => <FindingCard key={i} f={f} onFilter={addFilter} />)}
            </div>
          )}

          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            <BarList title="Failure reasons by family" buckets={a.categories} showRate={false}
                     note="ISE message codes grouped by subsystem." />
            <BarList title="Network devices" buckets={a.dims.device}
                     dimension="device" onFilter={addFilter} />
          </div>
        </>
      )}

      {/* ================= FAILURES ================= */}
      {tab === 'failures' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Total failures" value={n(a.fail)} tone="red" />
            <Kpi label="Distinct reasons" value={n(a.failures.length)} />
            <Kpi label="Largest single reason"
                 value={a.failures[0] ? pc(a.failures[0].share) : '—'}
                 sub={a.failures[0]?.code ? `code ${a.failures[0].code}` : undefined} />
            <Kpi label="Certificate-related"
                 value={n(a.categories
                   .filter(c => /certificate|PEAP handshake|TLS/i.test(c.key))
                   .reduce((s, c) => s + c.total, 0))}
                 sub="EAP-TLS, PEAP and TLS session codes" />
          </div>

          <SectionTitle note="Every distinct failure reason, with the ISE message code and the network device that produced the most of them.">
            Failure reasons in full
          </SectionTitle>
          <div className="overflow-x-auto border border-ink-200">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-paper-dim text-left">
                  {['Code', 'Family', 'Reason', 'Count', 'Share', 'Most affected device'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-ink-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {a.failures.map((f, i) => (
                  <tr key={i} className="border-b border-ink-100 last:border-0 hover:bg-paper-dim">
                    <td className="px-3 py-2.5 font-mono text-xs text-signal-500">{f.code || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-500">{f.category}</td>
                    <td className="px-3 py-2.5 text-ink-800">{f.text}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{n(f.count)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-ink-500">{pc(f.share)}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-600">
                      {f.topDevice}
                      {f.topDeviceCount > 0 && (
                        <span className="ml-1 font-mono text-ink-400">({n(f.topDeviceCount)})</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            <BarList title="Endpoints failing most" buckets={[...a.dims.mac].sort((x, y) => y.fail - x.fail).filter(b => b.fail > 0)}
                     dimension="mac" onFilter={addFilter} limit={15}
                     note="A single MAC failing repeatedly is usually one broken supplicant or an expired certificate." />
            <BarList title="Users failing most" buckets={[...a.dims.user].sort((x, y) => y.fail - x.fail).filter(b => b.fail > 0)}
                     dimension="user" onFilter={addFilter} limit={15}
                     note="Repeated failures for one identity point at credentials, group membership or an AD account state." />
          </div>
        </>
      )}

      {/* ================= INFRASTRUCTURE ================= */}
      {tab === 'infra' && (
        <>
          <BarList title="ISE nodes (PSN)" buckets={a.dims.server}
                   dimension="server" onFilter={addFilter}
                   note="Volume should be roughly even across nodes behind a load balancer. A large skew usually means an uneven RADIUS server list on the network devices." />
          <BarList title="Network devices" buckets={a.dims.device}
                   dimension="device" onFilter={addFilter} limit={20}
                   note="Switches, wireless controllers and anything else sending RADIUS. This is where a site-specific fault shows up." />
          <BarList title="NAD IP addresses" buckets={a.dims.nasIp}
                   dimension="nasIp" onFilter={addFilter} limit={20} />
          <div className="grid gap-8 lg:grid-cols-2">
            <BarList title="Device type" buckets={a.dims.deviceType}
                     dimension="deviceType" onFilter={addFilter} />
            <BarList title="Location" buckets={a.dims.location}
                     dimension="location" onFilter={addFilter} />
          </div>
          {a.hasSsid ? (
            <BarList title="SSID" buckets={a.dims.ssid} dimension="ssid" onFilter={addFilter} limit={20}
                     note="Taken from Called-Station-ID." />
          ) : (
            <div className="mb-8">
              <SectionTitle>SSID</SectionTitle>
              <p className="border border-dashed border-ink-200 p-4 text-sm leading-relaxed text-ink-500">
                This export has no SSID data. On wireless, the SSID travels in the
                <span className="font-mono"> Called-Station-ID </span>
                attribute, which the standard RADIUS Authentications report template does not
                include. To get SSID breakdowns, export from
                <strong> Operations → RADIUS → Live Logs </strong>
                instead, or add Called-Station-ID to a custom report. This tool detects the
                column automatically and will show the breakdown when it is present.
              </p>
            </div>
          )}
        </>
      )}

      {/* ================= IDENTITY ================= */}
      {tab === 'identity' && (
        <>
          <div className="grid gap-8 lg:grid-cols-2">
            <BarList title="Authentication protocol" buckets={a.dims.protocol}
                     dimension="protocol" onFilter={addFilter}
                     note="EAP-TLS, PEAP and the rest. A protocol failing at 100% almost always means it is not permitted in the Allowed Protocols list." />
            <BarList title="Authentication method" buckets={a.dims.method}
                     dimension="method" onFilter={addFilter} />
            <BarList title="Credential check" buckets={a.dims.credential}
                     dimension="credential" onFilter={addFilter} />
            <BarList title="Identity store" buckets={a.dims.identityStore}
                     dimension="identityStore" onFilter={addFilter} />
          </div>
          <BarList title="Policy set" buckets={a.dims.policySet}
                   dimension="policySet" onFilter={addFilter} />
          <BarList title="Authorization rule" buckets={a.dims.authzRule}
                   dimension="authzRule" onFilter={addFilter} limit={15} />
          <div className="grid gap-8 lg:grid-cols-2">
            <BarList title="Authorization profile" buckets={a.dims.authzProfile}
                     dimension="authzProfile" onFilter={addFilter} />
            <BarList title="Identity group" buckets={a.dims.identityGroup}
                     dimension="identityGroup" onFilter={addFilter} />
          </div>
          <BarList title="Endpoint profile" buckets={a.dims.endpointProfile}
                   dimension="endpointProfile" onFilter={addFilter}
                   note="Endpoints showing as Unknown are not being profiled — worth checking probe configuration if the share is high." />
        </>
      )}

      {/* ================= PERFORMANCE ================= */}
      {tab === 'perf' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Mean" value={ms(a.rtPercentiles.avg)} />
            <Kpi label="Median" value={ms(a.rtPercentiles.p50)} />
            <Kpi label="90th" value={ms(a.rtPercentiles.p90)} />
            <Kpi label="95th" value={ms(a.rtPercentiles.p95)} />
            <Kpi label="99th" value={ms(a.rtPercentiles.p99)}
                 tone={a.rtPercentiles.p99 > 1000 ? 'red' : 'ink'} />
            <Kpi label="Slowest" value={ms(a.rtPercentiles.max)}
                 tone={a.rtPercentiles.max > 5000 ? 'red' : 'ink'} />
          </div>

          <Histogram analysis={a} />

          <BarList
            title="Slowest network devices"
            buckets={a.slowest.map(b => ({ ...b, total: Math.round(b.rtAvg) }))}
            showRate={false}
            note="Ranked by mean response time in milliseconds, across devices with at least 30 authentications. A slow NAD often means a WAN path problem rather than an ISE problem."
          />

          <SectionTitle note="Mean response time per ISE node. A single slow node points at that node; all of them slow points at an identity store.">
            Response time by ISE node
          </SectionTitle>
          <div className="overflow-x-auto border border-ink-200">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-paper-dim text-left">
                  {['ISE node', 'Authentications', 'Mean response', 'Failure rate'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-ink-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {a.dims.server.filter(b => b.key !== '(none)').map(b => (
                  <tr key={b.key} className="border-b border-ink-100 last:border-0">
                    <td className="px-3 py-2.5 font-mono text-xs text-ink-800">{b.key}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{n(b.total)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">
                      {b.rtCount ? ms(b.rtAvg) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{pc(b.failRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ================= DATA QUALITY ================= */}
      {tab === 'data' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Rows read" value={n(a.rows)} />
            <Kpi label="Columns in file" value={n(Object.keys(a.dims).length)} />
            <Kpi label="Columns with no data" value={n(a.emptyColumns.length)} />
            <Kpi label="Time window" value={duration(a.windowMs)} />
          </div>

          <SectionTitle note="Present in the export but empty on every row. These are populated by ISE only in certain deployments — pxGrid, MDM integration, TrustSec or wired port detail.">
            Columns carrying no data
          </SectionTitle>
          {a.emptyColumns.length === 0 ? (
            <p className="border border-ink-200 p-4 text-sm text-ink-500">
              Every column in the file contains data.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {a.emptyColumns.map(c => (
                <span key={c} className="border border-ink-200 bg-paper-dim px-3 py-1.5 font-mono text-xs text-ink-500">
                  {c}
                </span>
              ))}
            </div>
          )}

          <SectionTitle note="How many distinct values each dimension holds after filtering.">
            Cardinality
          </SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(DIMENSION_LABELS) as Dimension[])
              .filter(d => a.distinct[d] > 0)
              .sort((x, y) => a.distinct[y] - a.distinct[x])
              .map(d => (
                <div key={d} className="flex items-baseline justify-between border-b border-ink-100 py-2">
                  <span className="text-sm text-ink-700">{DIMENSION_LABELS[d]}</span>
                  <span className="font-mono text-xs text-ink-500">{n(a.distinct[d])}</span>
                </div>
              ))}
          </div>

          <SectionTitle>Privacy</SectionTitle>
          <p className="max-w-3xl text-sm leading-relaxed text-ink-600">
            This file was read entirely inside your browser. It was not uploaded to this site,
            to Vercel, or to any storage. Nothing was logged. Closing or reloading this tab
            discards the analysis, and the only thing that leaves the machine is whatever you
            choose to export.
          </p>
        </>
      )}
    </div>
  )
}
