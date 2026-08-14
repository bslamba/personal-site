'use client'

// ============================================================
// components/tools/radius-analyser.tsx
//
// Cisco ISE report analyser. Drop one or more CSV exports, press
// Analyse, get a dashboard.
//
// Two report types are recognised and each gets its own section:
//
//   RADIUS Authentications   a list of events — who authenticated,
//                            against what, and why it failed
//   Key Performance Metrics  gauges sampled hourly per node —
//                            throughput, latency, load, suppression
//
// Both are handled on one page on purpose. The interesting question
// when troubleshooting is usually the overlap: a spike in failures
// at 11:40 means something quite different depending on whether
// node load also spiked at 11:40.
//
// Nothing is uploaded. Papa Parse streams each file in a Web
// Worker, the aggregation runs on this machine, and the result
// lives in memory until the tab is closed. These exports contain
// usernames, MAC addresses and site names, and none of that should
// be sitting on someone else's server to produce a bar chart.
// ============================================================

import { useCallback, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import {
  StoreBuilder, analyse, looksLikeRadius, detectColumns,
  DIMENSION_LABELS, toCsv, BUCKET_STEPS,
  type Store, type Analysis, type Bucket, type Filter,
  type Dimension, type Finding,
} from '@/lib/tools/radius'
import {
  KpmBuilder, analyseKpm, detectReportKind, kpmToCsv,
  type KpmData, type KpmAnalysis,
} from '@/lib/tools/kpm'
import type { WorkerOut } from '@/lib/tools/bundle-types'
import {
  Panel, DetailView, Kpi, SectionBanner, WidgetStyles, SkyBackdrop, SkyToggle, useSkyPhase,
  n, pc, ms, clock, stamp, duration, bytes, rateTone,
  type PanelData,
} from './panel'
import Guide, { useGuideStep } from './guide'
import KpmSection from './kpm-section'
import BundleSection, { isBundleReport, type BundleReport } from './bundle-section'
import SessionsSection from './sessions-section'
import DashboardSection from './dashboard-section'
import {
  DashboardBuilder, detectDashboardKind, dashboardToCsv,
  type DashboardAnalysis,
} from '@/lib/tools/dashboard'
import {
  SessionsBuilder, looksLikeSessions, sessionsToCsv,
  type SessionsAnalysis,
} from '@/lib/tools/sessions'

/** Short label for a bucket size, for the granularity control. */
function bucketLabel(msValue: number): string {
  if (msValue < 60_000) return `${msValue / 1000}s`
  if (msValue < 3_600_000) return `${msValue / 60_000}m`
  if (msValue < 86_400_000) return `${msValue / 3_600_000}h`
  return `${msValue / 86_400_000}d`
}

// ------------------------------------------------------------
// RADIUS panels
// ------------------------------------------------------------

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

function Timeline({ analysis, bucketChoice, onBucketChange }: {
  analysis: Analysis
  bucketChoice: number
  onBucketChange: (v: number) => void
}) {
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
    <section className="lg-card lg-rise" style={{ '--accent': '#0077BB' } as React.CSSProperties}>
      <header className="flex flex-wrap items-center justify-between gap-2 px-3 pb-1.5 pt-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-[13px] font-bold text-ink-950"
              style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}>
            Authentications over time
          </h3>
          <p className="text-[10.5px] text-ink-400">
            {n(data.length)} bars of {bucketLabel(analysis.bucketMs)} · grey = total ·
            red = failed · line = failure rate · peak {n(analysis.peakPerMinute)}/min
          </p>
        </div>

        <label className="flex shrink-0 items-center gap-1.5">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-400">
            Granularity
          </span>
          <select
            value={bucketChoice}
            onChange={e => onBucketChange(Number(e.target.value))}
            className="lg-field px-2.5 py-1 text-[11px] text-ink-800 outline-none"
          >
            <option value={0}>Auto</option>
            {BUCKET_STEPS
              .filter(s => {
                const count = analysis.windowMs / s
                return count >= 4 && count <= 1400
              })
              .map(s => <option key={s} value={s}>{bucketLabel(s)}</option>)}
          </select>
        </label>
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

/**
 * Shown when someone drops a .tar.gpg.
 *
 * The page used to decrypt these itself. It was measured at roughly
 * 6 KB/s — two and a half hours for a 344MB bundle — because OpenPGP
 * needs AES-CFB, the Web Crypto API has no CFB implementation, and so
 * the cipher runs in JavaScript ahead of a two-gigabyte decompression
 * stream. It is a structural limit, not a tuning problem. gpg does the
 * same work natively in about fifteen seconds.
 */
function DecryptFirst({ name }: { name: string }) {
  const [copied, setCopied] = useState(false)
  const isPublicKey = /-pk-/i.test(name)
  const command = `gpg --output bundle.tar --decrypt "${name}"`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked — the command is visible anyway */ }
  }

  if (isPublicKey) {
    return (
      <div className="mx-auto mt-5 max-w-xl border-l-2 border-signal-500 bg-signal-50 p-4 text-left">
        <p className="text-sm font-bold text-signal-700">This bundle cannot be opened by anyone but Cisco</p>
        <p className="mt-2 text-[13px] leading-relaxed text-signal-700">
          The <span className="font-mono">-pk-</span> in the filename means public-key
          encryption, which encrypts the bundle to Cisco&apos;s own key. Only Cisco TAC holds the
          matching private key. No tool, here or on your machine, will decrypt it.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-signal-700">
          Regenerate it with <strong>Shared Key</strong> encryption instead — under Operations →
          Troubleshooting → Download Logs, or from the CLI:
        </p>
        <pre className="mt-2 overflow-x-auto bg-paper p-2 font-mono text-[11px] text-ink-800">
backup-logs NAME repository REPO encryption-key plain YOURKEY</pre>
      </div>
    )
  }

  return (
    <div className="mx-auto mt-5 max-w-xl border border-ink-200 bg-paper p-4 text-left">
      <p className="text-sm font-bold text-ink-950" style={{ fontFamily: 'var(--font-heading)' }}>
        Decrypt this one first
      </p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-600">
        This page reads the archive, not the encryption. Run the command below — it takes about
        fifteen seconds using your machine&apos;s native crypto, and will ask for the shared key
        you set when creating the bundle. Then drop the resulting{' '}
        <span className="font-mono">bundle.tar</span> here.
      </p>

      <div className="mt-3 flex items-stretch gap-2">
        <pre className="flex-1 overflow-x-auto border border-ink-200 bg-paper-dim p-2.5 font-mono text-[11px] text-ink-800">
{command}</pre>
        <button onClick={copy}
                className="shrink-0 border border-ink-200 px-3 text-[10px] font-bold uppercase tracking-wider text-ink-500 hover:border-signal-500 hover:text-signal-500">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
        No <span className="font-mono">gpg</span> yet? macOS:{' '}
        <span className="font-mono">brew install gnupg</span>. Windows: install Gpg4win. Linux:
        usually already there. Use <span className="font-mono">--output</span> rather than a{' '}
        <span className="font-mono">&gt;</span> redirect — PowerShell writes redirected output as
        UTF-16 and silently corrupts the archive.
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
        The decrypted archive will be a few gigabytes. Delete it when you are done; the analysis
        lives in this tab, not in the file.
      </p>
    </div>
  )
}

/**
 * Progress for a support bundle archive.
 *
 * The bar tracks bytes consumed from the file. Because the archive is
 * already plaintext, that maps directly onto work done — no guessing at
 * a decompressed size, and no long opening stretch where nothing moves.
 */
function BundleProgress({ p, stage }: {
  p: { inBytes: number; inTotal: number; outBytes: number
       entry: string | null; files: number; lines: number; started: number }
  stage: string
}) {
  const pctDone = p.inTotal ? Math.min(100, (p.inBytes / p.inTotal) * 100) : 0
  const elapsed = (Date.now() - p.started) / 1000
  const rate = elapsed > 2 ? p.inBytes / elapsed : 0
  const remaining = rate > 0 ? (p.inTotal - p.inBytes) / rate : 0
  const mb = (v: number) => (v / 1048576).toFixed(0)

  return (
    <div className="mx-auto mt-5 max-w-lg">
      <div className="h-2 w-full overflow-hidden bg-ink-100">
        <div className="h-full bg-signal-500 transition-[width] duration-300"
             style={{ width: `${pctDone}%` }} />
      </div>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-xs text-ink-700">
          {pctDone.toFixed(1)}% · {mb(p.inBytes)} of {mb(p.inTotal)} MB
        </span>
        <span className="font-mono text-[11px] text-ink-400">
          {rate > 0 && `${(rate / 1048576).toFixed(1)} MB/s`}
          {remaining > 1 && elapsed > 5 && ` · about ${
            remaining > 90 ? `${Math.round(remaining / 60)} min` : `${Math.round(remaining)}s`
          } left`}
        </span>
      </div>

      <p className="mt-1 truncate font-mono text-[11px] text-ink-500">
        {stage}
        {p.entry && ` · ${p.entry.split('/').slice(-1)[0]}`}
      </p>

      {(p.files > 0 || p.outBytes > 0) && (
        <p className="mt-0.5 font-mono text-[11px] text-ink-400">
          {p.files} log{p.files === 1 ? '' : 's'} · {n(p.lines)} lines ·{' '}
          {mb(p.outBytes)} MB of archive walked
        </p>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
        Only the logs worth reading are parsed; everything else in the archive is skipped as it
        passes, which is why the megabytes climb faster than the line count.
      </p>
    </div>
  )
}

function FindingCard({ f, onFilter }: { f: Finding; onFilter: (d: Dimension, k: string) => void }) {
  return (
    <div className="lg-card lg-rise p-3" style={{ '--accent': '#CC3311' } as React.CSSProperties}>
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

export default function IseReportAnalyser() {
  // Drives the sky, and through it every contrast decision on the
  // page. Night until mounted — the server cannot know the
  // reader's local hour, and guessing it produces a hydration
  // mismatch rather than a wrong colour.
  const sky = useSkyPhase()

  // The guide's stage and the two things he points at.
  const stageRef = useRef<HTMLDivElement | null>(null)
  const chooseRef = useRef<HTMLLabelElement | null>(null)
  const analyseRef = useRef<HTMLButtonElement | null>(null)

  const [files, setFiles] = useState<File[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [rowsSeen, setRowsSeen] = useState(0)
  const [nowReading, setNowReading] = useState('')
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [filters, setFilters] = useState<Filter[]>([])
  const [bucketChoice, setBucketChoice] = useState(0)
  const [detail, setDetail] = useState<PanelData | null>(null)
  const [stage, setStage] = useState('')
  const [includeBulk, setIncludeBulk] = useState(false)
  const [bundleProgress, setBundleProgress] = useState<{
    inBytes: number; inTotal: number; outBytes: number
    entry: string | null; files: number; lines: number; started: number
  } | null>(null)
  const [, forceRender] = useState(0)

  const storeRef = useRef<Store | null>(null)
  const kpmRef = useRef<KpmData | null>(null)
  const bundleRef = useRef<BundleReport | null>(null)
  const sessionsRef = useRef<SessionsAnalysis | null>(null)
  const dashRef = useRef<DashboardAnalysis | null>(null)
  const dropRef = useRef<HTMLDivElement | null>(null)

  const analysis: Analysis | null = useMemo(() => {
    if (!storeRef.current) return null
    return analyse(storeRef.current, filters, { bucketMs: bucketChoice || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, phase, bucketChoice])

  const kpm: KpmAnalysis | null = useMemo(() => {
    if (!kpmRef.current) return null
    return analyseKpm(kpmRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const reset = () => {
    setPhase('idle'); setError(''); setWarnings([]); setFilters([])
    setBucketChoice(0)
    storeRef.current = null; kpmRef.current = null
    bundleRef.current = null; sessionsRef.current = null; dashRef.current = null
  }

  const addFiles = (incoming: FileList | File[] | null) => {
    if (!incoming) return
    const list = Array.from(incoming)
      .filter(f => /\.(csv|txt|tsv|json|gpg|pgp|tar)$/i.test(f.name) || f.type.includes('csv'))
    if (list.length === 0) return
    setFiles(prev => {
      const seen = new Set(prev.map(f => f.name + f.size))
      return [...prev, ...list.filter(f => !seen.has(f.name + f.size))]
    })
    reset()
  }

  const removeFile = (name: string, size: number) => {
    setFiles(prev => prev.filter(f => !(f.name === name && f.size === size)))
    reset()
  }

  /**
   * Parse one file into whichever builder its headers call for.
   * Resolves with a warning string when the file was skipped.
   */
  /**
   * A .json file is treated as a support-bundle report from
   * ise-bundle-analyse.mjs — the heavy parsing already happened on
   * the machine holding the bundle, so this only has to read it.
   */
  const parseBundleJson = async (f: File): Promise<string | null> => {
    try {
      const parsed: unknown = JSON.parse(await f.text())
      if (!isBundleReport(parsed)) {
        return `${f.name} — JSON, but not a support bundle report`
      }
      bundleRef.current = parsed
      return null
    } catch {
      return `${f.name} — could not be read as JSON`
    }
  }

  const parseOne = (
    f: File, radius: StoreBuilder, kpmBuilder: KpmBuilder, sessions: SessionsBuilder,
    doneBytes: number, totalBytes: number,
  ) => new Promise<string | null>((resolve, reject) => {
    let kind: 'radius' | 'kpm' | 'sessions' | null = null
    let decided = false

    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: 'greedy',
      worker: true,
      chunkSize: 4 * 1024 * 1024,

      chunk: (results, parser) => {
        if (!decided) {
          decided = true
          const headers = results.meta.fields ?? []
          // Sessions is checked first: its Server column would otherwise
          // satisfy the looser tests used by the other two.
          if (looksLikeSessions(headers)) {
            kind = 'sessions'
            sessions.setSource(headers, f.name)
          } else {
            kind = detectReportKind(headers, h => looksLikeRadius(detectColumns(h)))
            if (kind === 'radius') radius.setSource(headers, f.name)
            else if (kind === 'kpm') kpmBuilder.setSource(headers, f.name)
            else { parser.abort(); return }
          }
        }
        const seen = () => setRowsSeen(radius.count + kpmBuilder.count + sessions.count)
        if (kind === 'radius') {
          for (const rec of results.data) radius.push(rec)
          seen()
        } else if (kind === 'kpm') {
          for (const rec of results.data) kpmBuilder.push(rec)
          seen()
        } else if (kind === 'sessions') {
          for (const rec of results.data) sessions.push(rec)
          seen()
        }
        const cursor = (results.meta as { cursor?: number }).cursor ?? 0
        if (totalBytes) setProgress(Math.min(99, ((doneBytes + cursor) / totalBytes) * 100))
      },

      complete: () => resolve(
        kind ? null : `${f.name} — skipped, not a recognised ISE report`
      ),

      error: err => reject(new Error(`${f.name} — ${err.message || 'could not be read'}`)),
    })
  })

  /**
   * Read a support bundle archive in a Worker.
   * A bundle is gigabytes, so it is streamed: walk the tar, parse only
   * the logs that matter, discard the rest as it passes. Nothing is
   * uploaded and nothing is written down.
   */
  const runBundle = useCallback((f: File) => new Promise<string | null>(resolve => {
    const worker = new Worker(new URL('./bundle-worker.ts', import.meta.url), { type: 'module' })
    const started = Date.now()
    setBundleProgress({ inBytes: 0, inTotal: f.size, outBytes: 0, entry: null, files: 0, lines: 0, started })

    worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const m = ev.data
      if (m.type === 'stage') {
        setStage(m.stage)
      } else if (m.type === 'progress') {
        setBundleProgress({ ...m, started })
      } else if (m.type === 'done') {
        bundleRef.current = m.report
        setBundleProgress(null)
        worker.terminate()
        resolve(null)
      } else {
        setBundleProgress(null)
        worker.terminate()
        resolve(`${f.name} — ${m.message}`)
      }
    }
    worker.onerror = err => {
      setBundleProgress(null)
      worker.terminate()
      resolve(`${f.name} — ${err.message || 'the worker failed'}`)
    }

    worker.postMessage({ file: f, includeBulk })
  }), [includeBulk])

  const run = useCallback(async () => {
    if (files.length === 0) return
    setPhase('reading'); setProgress(0); setRowsSeen(0); setStage('')
    setError(''); setWarnings([]); setFilters([])
    storeRef.current = null; kpmRef.current = null; bundleRef.current = null

    const radius = new StoreBuilder()
    const kpmBuilder = new KpmBuilder()
    const sessions = new SessionsBuilder()
    const dash = new DashboardBuilder()
    const totalBytes = files.reduce((s, f) => s + f.size, 0)
    const notes: string[] = []
    let doneBytes = 0

    try {
      // Sequential on purpose. Parsing several 40MB files at once
      // would spawn a worker each and thrash memory for no gain —
      // the bottleneck is the aggregation, not the disk.
      for (const f of files) {
        setNowReading(f.name)

        // The ISE dashboard exports are small and are not really CSVs —
        // key/value pairs, stacked sections, per-node blocks. Sniff the
        // opening lines and parse them as text rather than feeding them
        // to a reader that expects a header row.
        if (/\.csv$/i.test(f.name) && f.size < 4_000_000) {
          const text = await f.text()
          const kind = detectDashboardKind(text)
          if (kind) {
            dash.add(kind, text, f.name)
            doneBytes += f.size
            if (totalBytes) setProgress(Math.min(99, (doneBytes / totalBytes) * 100))
            continue
          }
        }

        const note = /\.(gpg|pgp)$/i.test(f.name)
          ? `${f.name} — still encrypted. Decrypt it first, then drop the .tar here.`
          : /\.tar$/i.test(f.name)
            ? await runBundle(f)
            : /\.json$/i.test(f.name)
              ? await parseBundleJson(f)
              : await parseOne(f, radius, kpmBuilder, sessions, doneBytes, totalBytes)
        if (note) notes.push(note)
        doneBytes += f.size
        if (totalBytes) setProgress(Math.min(99, (doneBytes / totalBytes) * 100))
      }
    } catch (err) {
      setPhase('error')
      setError(err instanceof Error ? err.message : 'The files could not be read.')
      return
    }

    setNowReading('')

    if (radius.count === 0 && kpmBuilder.count === 0 && sessions.count === 0
        && dash.count === 0 && !bundleRef.current) {
      setPhase('error')
      setError(
        notes.length
          ? 'None of the selected files is recognised. This tool reads the RADIUS ' +
            'Authentications, Key Performance Metrics and Current Active Sessions CSV ' +
            'exports, and a decrypted support bundle archive.'
          : 'No rows were found in the selected files.'
      )
      setWarnings(notes)
      return
    }

    if (radius.count > 0) storeRef.current = radius.finish()
    if (kpmBuilder.count > 0) kpmRef.current = kpmBuilder.finish()
    if (sessions.count > 0) sessionsRef.current = sessions.finish()
    if (dash.count > 0) dashRef.current = dash.finish()

    setWarnings(notes)
    setProgress(100)
    setStage('')
    setPhase('ready')
    forceRender(v => v + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, runBundle])

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
    let body: string
    if (kind === 'csv') {
      const parts: string[] = []
      if (analysis) parts.push('# RADIUS AUTHENTICATIONS\n' + toCsv(analysis))
      if (kpm) parts.push('# KEY PERFORMANCE METRICS\n' + kpmToCsv(kpm))
      if (sessionsRef.current) parts.push('# ACTIVE SESSIONS\n' + sessionsToCsv(sessionsRef.current))
      if (dashRef.current) parts.push('# DASHBOARD EXPORT\n' + dashboardToCsv(dashRef.current))
      body = parts.join('\n\n')
    } else {
      body = JSON.stringify({
        generated: new Date().toISOString(),
        sources: files.map(f => f.name),
        filters,
        radius: analysis && {
          summary: {
            total: analysis.total, pass: analysis.pass, fail: analysis.fail,
            failRate: analysis.failRate,
            window: { start: analysis.windowStart, end: analysis.windowEnd },
            responseTime: analysis.rtPercentiles,
          },
          findings: analysis.findings,
          failures: analysis.failures,
          dimensions: analysis.dims,
        },
        kpm: kpm && {
          window: { start: kpm.windowStart, end: kpm.windowEnd },
          intervalMs: kpm.intervalMs,
          totals: kpm.totals,
          imbalanceRatio: kpm.imbalanceRatio,
          findings: kpm.findings,
          nodes: kpm.nodes,
          sites: kpm.sites,
          timeline: kpm.timeline,
        },
      }, null, 2)
    }

    const blob = new Blob([body], { type: kind === 'csv' ? 'text/csv' : 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ise-analysis-${new Date().toISOString().slice(0, 10)}.${kind}`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ---------- landing ----------
  const bundle = bundleRef.current
  const sessions = sessionsRef.current
  const dashboard = dashRef.current
  const needsKey = files.some(f => /\.(gpg|pgp)$/i.test(f.name))

  // Derived from what the page is actually doing, so the guide can
  // never claim a state the tool is not in.
  const guideStep = useGuideStep({
    hasFiles: files.length > 0,
    busy: phase === 'reading',
    ready: phase === 'ready',
  })

  if (phase !== 'ready' || (!analysis && !kpm && !bundle && !sessions && !dashboard)) {
    return (
      <div className="lg-sky" data-sky={sky}>
        <WidgetStyles />
        <SkyBackdrop />
        <div className="lg-canvas container-page pb-28 pt-32">

        <div className="mb-5 flex justify-end">
          <SkyToggle />
        </div>

        {/* `relative` makes this the stage the guide is positioned
            against, so his coordinates are independent of where the
            page has been scrolled to. */}
        <div className="relative" ref={stageRef}>
        <Guide step={guideStep} stageRef={stageRef}
               chooseRef={chooseRef} analyseRef={analyseRef} />
        <div
          ref={dropRef}
          onDragOver={e => { e.preventDefault(); dropRef.current?.classList.add('drop-live') }}
          onDragLeave={() => dropRef.current?.classList.remove('drop-live')}
          onDrop={e => {
            e.preventDefault()
            dropRef.current?.classList.remove('drop-live')
            addFiles(e.dataTransfer.files)
          }}
          className="tool-drop rounded-[28px] border-2 border-dashed border-white/30 bg-white/[.04] p-8 text-center transition-colors"
        >
          <p className="text-lg font-bold text-ink-950" style={{ fontFamily: 'var(--font-heading)' }}>
            Drop your ISE files here
          </p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-500">
            A decrypted <strong>support bundle</strong> (.tar), the{' '}
            <strong>RADIUS Authentications</strong>, <strong>Key Performance Metrics</strong> and{' '}
            <strong>Current Active Sessions</strong> CSV exports, or all seven files from{' '}
            <strong>Manage → Export</strong> on any ISE dashboard. Add as many as you like — each
            is detected automatically and merged into one dashboard. Everything is read in this
            browser and nothing is uploaded.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <label ref={chooseRef} className="btn-ghost cursor-pointer">
              {files.length ? 'Add more files' : 'Choose files'}
              <input type="file" accept=".csv,text/csv,.tsv,.txt,.json,.gpg,.pgp,.tar" multiple
                     className="sr-only"
                     onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            </label>
            <button ref={analyseRef} onClick={run}
                    disabled={files.length === 0 || phase === 'reading'}
                    className="btn-signal disabled:cursor-not-allowed disabled:opacity-40">
              {phase === 'reading'
                ? 'Analysing…'
                : files.length > 1 ? `Analyse ${files.length} files` : 'Analyse'}
            </button>
            {files.length > 0 && phase !== 'reading' && (
              <button onClick={() => { setFiles([]); reset() }}
                      className="text-xs font-bold uppercase tracking-wider text-ink-400 hover:text-signal-500">
                Clear
              </button>
            )}
          </div>

          {/* ---------- an encrypted bundle needs decrypting first ---------- */}
          {needsKey && <DecryptFirst name={files.find(f => /\.(gpg|pgp)$/i.test(f.name))!.name} />}

          {/* ---------- bulk log toggle, for archives ---------- */}
          {files.some(f => /\.tar$/i.test(f.name)) && (
            <label className="mx-auto mt-5 flex max-w-md cursor-pointer items-start gap-2 text-left">
              <input
                type="checkbox"
                checked={includeBulk}
                onChange={e => setIncludeBulk(e.target.checked)}
                className="mt-0.5 accent-[#D3002D]"
              />
              <span className="text-[11px] leading-relaxed text-ink-500">
                Also read the message-bus and GC logs.{' '}
                <span className="text-ink-400">
                  Off by default: <span className="font-mono">ise-messaging</span> alone is around
                  600MB across ten rotations. The one thing it reports — publishes failing —
                  already shows up in prrt-server.log.
                </span>
              </span>
            </label>
          )}

          {files.length > 0 && (
            <div className="mx-auto mt-5 max-w-2xl">
              <div className="flex flex-wrap justify-center gap-1.5">
                {files.map(f => (
                  <span key={f.name + f.size}
                        className="lg-pill inline-flex items-center gap-2 px-2.5 py-1 font-mono text-[11px] text-ink-700">
                    <span className="max-w-[22rem] truncate" title={f.name}>{f.name}</span>
                    <span className="text-ink-400">{bytes(f.size)}</span>
                    {phase !== 'reading' && (
                      <button onClick={() => removeFile(f.name, f.size)}
                              aria-label={`Remove ${f.name}`}
                              className="text-ink-400 hover:text-signal-500">×</button>
                    )}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-ink-400">
                {files.length} file{files.length === 1 ? '' : 's'} ·{' '}
                {bytes(files.reduce((s, f) => s + f.size, 0))} total
              </p>
            </div>
          )}

          {phase === 'reading' && bundleProgress && (
            <BundleProgress p={bundleProgress} stage={stage} />
          )}

          {phase === 'reading' && !bundleProgress && (
            <div className="mx-auto mt-5 max-w-md">
              <div className="h-1.5 w-full overflow-hidden bg-ink-100">
                <div className="h-full bg-signal-500 transition-[width] duration-150"
                     style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 font-mono text-xs text-ink-500">
                {stage || `${n(rowsSeen)} rows read${nowReading ? ` · ${nowReading}` : ''}`}
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div className="mx-auto mt-5 max-w-xl border border-signal-500 bg-signal-50 p-3 text-sm text-signal-700">
              <p>{error}</p>
              {warnings.map(w => <p key={w} className="mt-1 font-mono text-xs">{w}</p>)}
            </div>
          )}
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {[
            ['Where to get the files',
             'RADIUS Authentications: Operations → Reports → Endpoints and Users. Key Performance Metrics: Operations → Reports → Diagnostics. Support bundles: Operations → Troubleshooting → Download Logs, using Shared Key encryption.'],
            ['Why together',
             'Failures, node health and bundle logs answer parts of the same question. A spike at 11:40 reads differently depending on whether load spiked too, or OCSP was timing out.'],
            ['What it does not do',
             'Nothing leaves your browser, so nothing is stored, logged or sent. Close the tab and the analysis is gone.'],
          ].map(([h, b]) => (
            <div key={h} className="border-t-2 border-ink-950 pt-4">
              <p className="label text-signal-500">{h}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{b}</p>
            </div>
          ))}
        </div>
        </div>
        </div>
      </div>
    )
  }

  // ---------- dashboard ----------
  const a = analysis
  const F = (d: Dimension, k: string) => addFilter(d, k)

  let panels: PanelData[] = []
  let multiSource = false

  if (a) {
    const maxFailure = Math.max(1, ...a.failures.map(f => f.count))
    const maxCategory = Math.max(1, ...a.categories.map(c => c.total))
    const maxHist = Math.max(1, ...a.rtHistogram.map(r => r.count))
    const histTotal = a.rtHistogram.reduce((s, r) => s + r.count, 0)
    const maxSlow = Math.max(1, ...a.slowest.map(b => b.rtAvg))
    const maxNodeRt = Math.max(1, ...a.dims.server.map(b => b.rtAvg))
    multiSource = a.dims.source.filter(b => b.key !== '(none)').length > 1

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
      title: 'ISE node response times',
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

    const byFail = (list: Bucket[]) =>
      [...list].sort((x, y) => y.fail - x.fail).filter(b => b.fail > 0)

    panels = [
      ...(multiSource
        ? [dimensionPanel('Source files', a.dims.source, 'File',
            'Each file that contributed to this view. Filter to one to isolate its rows.',
            'source', F)]
        : []),
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
  }

  const healthy = a ? a.failRate < 0.05 : true
  // An export of exactly this size is almost certainly ISE's row cap
  // rather than a coincidence, and the totals would be misleading.
  const looksCapped = a ? a.rows % 100_000 === 0 && a.rows >= 100_000 : false

  return (
    <>
      <WidgetStyles />

      {/*
        Backdrop and content are siblings with explicit z-index, so
        no ancestor of the modal ever creates a stacking context —
        a fixed element trapped inside one renders beneath the site
        header, which is exactly the bug this layout avoids.
      */}
      <div className="lg-sky" data-sky={sky}>
      <SkyBackdrop />
      <div className="lg-canvas container-page pb-28 pt-32">

      <div className="mb-4 flex justify-end">
        <SkyToggle />
      </div>

      {/* ---------- toolbar ---------- */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-3">
        <div className="min-w-0">
          <p className="truncate lg-num text-[11px] text-ink-500">
            {files.length === 1 ? files[0].name : `${files.length} files: ${files.map(f => f.name).join(', ')}`}
          </p>
          <p className="text-xs text-ink-700">
            {a && <>{n(a.rows)} authentication rows</>}
            {a && (kpm || bundle) && ' · '}
            {kpm && <>{n(kpm.rows)} metric samples across {kpm.nodes.length} nodes</>}
            {kpm && (bundle || sessions) && ' · '}
            {sessions && <>{n(sessions.rows)} active sessions</>}
            {sessions && bundle && ' · '}
            {bundle && <>support bundle from {bundle.node ?? 'unknown node'}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => download('csv')} className="btn-ghost !px-3 !py-1.5 !text-[0.6rem]">Export CSV</button>
          <button onClick={() => download('json')} className="btn-ghost !px-3 !py-1.5 !text-[0.6rem]">Export JSON</button>
          <button onClick={() => { setFiles([]); reset() }} className="btn-ghost !px-3 !py-1.5 !text-[0.6rem]">New files</button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mb-3 border border-[#B45309] bg-[#FFF7ED] p-2.5 text-xs text-[#7C2D12]">
          {warnings.map(w => <p key={w} className="font-mono">{w}</p>)}
        </div>
      )}

      {looksCapped && (
        <p className="mb-3 border border-[#B45309] bg-[#FFF7ED] p-2.5 text-xs leading-relaxed text-[#7C2D12]">
          The authentication export contains exactly {n(a!.rows)} rows, which is ISE&apos;s
          export row limit rather than a coincidence. Rates and proportions below are sound,
          but absolute totals describe the exported sample, not the full time window.
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

      {/* ================= RADIUS ================= */}
      {a && (
        <>
          <SectionBanner
            title="RADIUS Authentications"
            subtitle={
              `${n(a.rows)} rows · ${stamp(a.windowStart)} to ${clock(a.windowEnd)} · ` +
              `${duration(a.windowMs)} covered`
            }
          />

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
            {multiSource
              ? <Kpi label="Source files" value={n(a.distinct.source)} sub="merged into one view" />
              : <Kpi label="Policy sets" value={n(a.distinct.policySet)} />}
          </div>

          <div className="mb-4">
            <Timeline analysis={a} bucketChoice={bucketChoice} onBucketChange={setBucketChoice} />
          </div>

          <section className="lg-card lg-rise mb-4 p-3">
            <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[13px] font-bold text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}>
                What stands out
              </h3>
              <p className="text-[10.5px] text-ink-400">
                Ranked by failures beyond what the overall rate predicts. Values covering most
                of the data are excluded — they are the baseline.
              </p>
            </div>
            {a.findings.length === 0 ? (
              <p className="lg-card p-3 text-[11.5px] text-ink-500">
                Nothing is statistically apart from the baseline. Failures are spread evenly
                rather than concentrated, which usually points at a general condition rather
                than a specific fault.
              </p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {a.findings.map((f, i) => <FindingCard key={i} f={f} onFilter={addFilter} />)}
              </div>
            )}
          </section>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {panels.map(p => <Panel key={p.title} data={p} onExpand={setDetail} />)}
          </div>
        </>
      )}

      {/* ================= KPM ================= */}
      {kpm && <KpmSection a={kpm} onExpand={setDetail} />}

      {/* ================= DASHBOARD EXPORT ================= */}
      {dashboard && <DashboardSection a={dashboard} onExpand={setDetail} />}

      {/* ================= ACTIVE SESSIONS ================= */}
      {sessions && <SessionsSection a={sessions} onExpand={setDetail} />}

      {/* ================= SUPPORT BUNDLE ================= */}
      {bundle && <BundleSection r={bundle} onExpand={setDetail} />}

      <p className="mt-6 max-w-3xl text-[11px] leading-relaxed text-ink-500">
        Every panel shows its top rows — open any of them for the full list with sorting and
        search. In the authentication section, clicking a row filters the entire dashboard to
        that value. These files were read inside your browser; nothing was uploaded, stored or
        logged, and reloading the tab discards them.
      </p>

      </div>
      </div>

      {detail && <DetailView data={detail} onClose={() => setDetail(null)} />}
    </>
  )
}
