'use client'

// ============================================================
// components/tools/clearpass-analyser.tsx
//
// The ClearPass side of the tools page.
//
// The flow is three steps rather than the ISE tool's one, and the
// extra step is the point: sniff a few hundred rows, show the
// reader which column it thinks is which, and let them correct it
// before anything is computed. A dashboard built on a
// misidentified column is confidently wrong, which is the worst
// failure mode available to an analysis tool — worse than refusing
// to run.
//
// Everything below the mapping step reuses the ISE dashboard's
// furniture, so the two tools stay visually identical and there is
// one place to fix a table bug.
// ============================================================

import { useCallback, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import {
  Panel, DetailView, Tile, Donut, SectionBanner, WidgetStyles,
  SkyBackdrop, SkyToggle, useSkyPhase, useInkRotation, useInkPalette,
  ALERT_HIGH, n, pc, stamp, type PanelData,
} from './panel'
import {
  Accumulator, infer, ROLE_LABEL, DIMENSIONS,
  type ClearPassAnalysis, type Inference, type Mapping, type Role,
} from '@/lib/tools/clearpass'

type Phase = 'idle' | 'sniffing' | 'mapping' | 'reading' | 'ready' | 'error'

const SNIFF_ROWS = 400

/** Reads just enough of the first file to infer the columns. */
function sniff(file: File): Promise<Inference> {
  return new Promise((resolve, reject) => {
    const rows: string[][] = []
    let headers: string[] = []
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      chunkSize: 512 * 1024,
      chunk: (res, parser) => {
        for (const r of res.data) {
          if (!headers.length) { headers = r.map(h => (h ?? '').trim()); continue }
          rows.push(r)
        }
        if (rows.length >= SNIFF_ROWS) parser.abort()
      },
      complete: () => {
        if (!headers.length) reject(new Error('No header row found'))
        else resolve(infer(headers, rows))
      },
      error: err => reject(err),
    })
  })
}

export default function ClearPassAnalyser() {
  const sky = useSkyPhase()
  const tint = useInkRotation()
  const palette = useInkPalette()

  const [files, setFiles] = useState<File[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [inference, setInference] = useState<Inference | null>(null)
  const [mapping, setMapping] = useState<Mapping>({})
  const [progress, setProgress] = useState(0)
  const [analysis, setAnalysis] = useState<ClearPassAnalysis | null>(null)
  const [detail, setDetail] = useState<PanelData | null>(null)
  const dropRef = useRef<HTMLDivElement | null>(null)

  const addFiles = useCallback(async (list: FileList | null) => {
    if (!list?.length) return
    const incoming = Array.from(list).filter(f => /\.(csv|tsv|txt)$/i.test(f.name))
    if (!incoming.length) { setError('Only CSV or TSV exports for now.'); setPhase('error'); return }
    const next = [...files, ...incoming]
    setFiles(next)
    setError('')
    setPhase('sniffing')
    try {
      const inf = await sniff(next[0])
      setInference(inf)
      setMapping(inf.mapping)
      setPhase('mapping')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file')
      setPhase('error')
    }
  }, [files])

  const run = useCallback(async () => {
    if (!inference) return
    setPhase('reading')
    setProgress(0)
    const acc = new Accumulator(mapping)
    const totalBytes = files.reduce((s, f) => s + f.size, 0)
    // Bytes finished in *previous* files. Papa's cursor is per-file,
    // so progress across a multi-file set has to carry a running
    // base or the bar resets to zero on every new file.
    let base = 0

    for (const file of files) {
      await new Promise<void>((resolve, reject) => {
        let first = true
        Papa.parse<string[]>(file, {
          skipEmptyLines: true,
          worker: true,
          chunkSize: 1024 * 1024,
          chunk: res => {
            for (const r of res.data) {
              if (first) { first = false; continue }   // header row
              acc.push(r)
            }
            setProgress(Math.min(0.99, (base + (res.meta.cursor ?? 0)) / Math.max(1, totalBytes)))
          },
          complete: () => { base += file.size; resolve() },
          error: err => reject(err),
        })
      })
    }

    setAnalysis(acc.finish(files.map(f => f.name), inference.headers))
    setProgress(1)
    setPhase('ready')
  }, [files, mapping, inference])

  const reset = () => {
    setFiles([]); setInference(null); setMapping({}); setAnalysis(null)
    setPhase('idle'); setError(''); setProgress(0)
  }

  // ---------- panels ----------
  const panels = useMemo<PanelData[]>(() => {
    if (!analysis) return []
    const out: PanelData[] = []

    if (analysis.errors.length) {
      const max = Math.max(1, ...analysis.errors.map(e => e.total))
      out.push({
        title: 'Failure reasons',
        note: 'Every distinct reason in the export, most frequent first.',
        columns: [
          { head: 'Reason', align: 'left' },
          { head: 'Count', align: 'right', width: 'w-20' },
          { head: 'Share', align: 'right', width: 'w-14' },
        ],
        rows: analysis.errors.map(e => ({
          id: e.key,
          bar: e.total / max,
          barFail: 1,
          cells: [e.key, n(e.total), pc(analysis.totals.fail ? e.total / analysis.totals.fail : 0)],
          sort: [e.key, e.total, e.total],
        })),
      })
    }

    for (const role of DIMENSIONS) {
      const rows = analysis.dims[role]
      if (!rows?.length) continue
      const max = Math.max(1, ...rows.map(r => r.total))
      out.push({
        title: ROLE_LABEL[role],
        note: `${n(rows.length)} distinct value${rows.length === 1 ? '' : 's'}, ranked by volume with the failure share behind each bar.`,
        columns: [
          { head: ROLE_LABEL[role], align: 'left' },
          { head: 'Total', align: 'right', width: 'w-20' },
          { head: 'Failed', align: 'right', width: 'w-20' },
          { head: 'Fail %', align: 'right', width: 'w-16' },
        ],
        rows: rows.map(b => {
          const rate = b.total ? b.fail / b.total : 0
          return {
            id: b.key,
            bar: b.total / max,
            barFail: b.total ? b.fail / b.total : 0,
            cells: [
              b.key, n(b.total), n(b.fail),
              <span key="r" style={rate > 0.5 ? { color: ALERT_HIGH, fontWeight: 700 } : undefined}>
                {pc(rate)}
              </span>,
            ],
            sort: [b.key, b.total, b.fail, rate],
          }
        }),
      })
    }
    return out
  }, [analysis])

  // ================= landing / mapping =================
  if (phase !== 'ready' || !analysis) {
    return (
      <div className="lg-sky" data-sky={sky}>
        <WidgetStyles />
        <SkyBackdrop />
        <div className="lg-canvas container-page pb-28 pt-32">

          <div className="mb-5 flex justify-end"><SkyToggle /></div>

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
            <p className="text-lg font-bold text-ink-950">Drop your ClearPass export here</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-500">
              An <strong>Access Tracker</strong> export or an <strong>Insight</strong> report, as CSV.
              The columns are worked out from the file itself, so it does not matter which ones you
              ticked or which ClearPass version produced it. Everything is read in this browser and
              nothing is uploaded.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <label className="btn-ghost cursor-pointer">
                {files.length ? 'Add more files' : 'Choose files'}
                <input type="file" accept=".csv,.tsv,.txt,text/csv" multiple className="sr-only"
                       onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
              </label>
              {phase === 'mapping' && (
                <button onClick={run} className="btn-signal">
                  {files.length > 1 ? `Analyse ${files.length} files` : 'Analyse'}
                </button>
              )}
              {files.length > 0 && (
                <button onClick={reset}
                        className="text-xs font-bold uppercase tracking-wider text-ink-400 hover:text-signal-500">
                  Clear
                </button>
              )}
            </div>

            {files.length > 0 && (
              <p className="mt-4 lg-num text-[11px] text-ink-400">
                {files.map(f => f.name).join(' · ')}
              </p>
            )}
            {phase === 'sniffing' && (
              <p className="mt-4 text-[12px] text-ink-500">Reading the first few hundred rows…</p>
            )}
            {phase === 'reading' && (
              <div className="mx-auto mt-5 max-w-md">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full bg-signal-500 transition-[width] duration-300"
                       style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <p className="mt-2 lg-num text-[11px] text-ink-400">
                  {Math.round(progress * 100)}%
                </p>
              </div>
            )}
            {phase === 'error' && (
              <p className="mt-4 text-[12px] text-signal-500">{error}</p>
            )}
          </div>

          {/* ---------- the mapping step ---------- */}
          {inference && phase !== 'reading' && (
            <section className="lg-card lg-rise mt-6 p-5"
                     style={{ '--accent': tint(0) } as React.CSSProperties}>
              <h3 className="lg-title text-[15px] font-bold" style={{ letterSpacing: '-0.008em' }}>
                What I think your columns are
              </h3>
              <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-ink-500">
                Worked out from the header text and, where that is ambiguous, from what the values
                actually look like — a column of MAC addresses is a MAC column whatever it is
                called. Correct anything that is wrong before pressing Analyse; a dashboard built
                on a misidentified column is confidently wrong, which is worse than one that
                refuses to run.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(Object.keys(ROLE_LABEL) as Role[]).map((role, i) => {
                  const chosen = mapping[role]
                  const cands = inference.candidates[role] ?? []
                  const required = role === 'status'
                  return (
                    <label key={role} className="lg-inset block px-3 py-2.5">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[9.5px] font-bold uppercase tracking-[0.1em]"
                              style={{ color: tint(i) }}>
                          {ROLE_LABEL[role]}
                        </span>
                        {required && (
                          <span className="text-[9px] font-bold uppercase tracking-[0.08em]"
                                style={{ color: chosen === undefined ? ALERT_HIGH : undefined }}>
                            {chosen === undefined ? 'needed' : 'ok'}
                          </span>
                        )}
                      </span>
                      <select
                        className="lg-field mt-1.5 w-full px-3 py-1.5 text-[12px] outline-none"
                        value={chosen ?? ''}
                        onChange={e => {
                          const v = e.target.value
                          setMapping(m => {
                            const next = { ...m }
                            if (v === '') delete next[role]
                            else next[role] = Number(v)
                            return next
                          })
                        }}
                      >
                        <option value="">— not present —</option>
                        {inference.headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            {h || `column ${idx + 1}`}
                            {cands.find(c => c.index === idx) ? '  ·  likely' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                })}
              </div>

              {mapping.status === undefined && (
                <p className="mt-4 text-[12px]" style={{ color: ALERT_HIGH }}>
                  Pick the column that says whether each request was accepted or rejected — without
                  it there is nothing to count as a failure, and every panel would just be a
                  frequency table.
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    )
  }

  // ================= dashboard =================
  const a = analysis
  const denom = a.totals.pass + a.totals.fail
  const failRate = denom ? a.totals.fail / denom : 0
  const maxT = Math.max(1, ...a.timeline.map(b => b.total))

  return (
    <>
      <div className="lg-sky" data-sky={sky}>
        <WidgetStyles />
        <SkyBackdrop />
        <div className="lg-canvas container-page pb-28 pt-32">

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="lg-num truncate text-[11px] text-ink-500">{a.files.join(' · ')}</p>
            <div className="flex items-center gap-2">
              <SkyToggle />
              <button onClick={reset} className="lg-pill px-3 py-1 text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-700">
                New files
              </button>
            </div>
          </div>

          <SectionBanner
            title="Aruba ClearPass"
            subtitle={
              `${n(a.rows)} rows · ` +
              (a.window
                ? `${stamp(a.window.from)} → ${stamp(a.window.to)}`
                : 'no usable timestamp column')
            }
          />

          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Tile label="Requests" value={n(a.totals.total)} sub="rows read" />
            <Tile label="Accepted" value={n(a.totals.pass)} tone="green"
                  sub={denom ? pc(a.totals.pass / denom) + ' of decided' : undefined} />
            <Tile label="Rejected" value={n(a.totals.fail)} tone="red"
                  sub={denom ? pc(failRate) + ' of decided' : undefined} />
            <Tile label="Distinct reasons" value={n(a.errors.length)}
                  sub={a.errors[0] ? a.errors[0].key.slice(0, 42) : undefined} />
            <Tile label="Unrecognised status" value={n(a.totals.unknown)}
                  tone={a.totals.unknown > a.rows * 0.2 ? 'amber' : 'ink'}
                  sub="rows this tool could not judge" />
          </div>

          {a.findings.length > 0 && (
            <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {a.findings.map((f, i) => (
                <div key={i} className="lg-card lg-rise p-3"
                     style={{ '--accent': f.severity === 'high' ? ALERT_HIGH : tint(i + 2) } as React.CSSProperties}>
                  <p className="lg-title text-[13px] font-bold leading-tight">{f.headline}</p>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-600">{f.detail}</p>
                </div>
              ))}
            </div>
          )}

          {a.timeline.length > 1 && (
            <section className="lg-card lg-rise mb-3 p-4"
                     style={{ '--accent': tint(1) } as React.CSSProperties}>
              <h3 className="lg-title text-[13px] font-bold" style={{ letterSpacing: '-0.005em' }}>
                Requests over time
              </h3>
              <p className="mt-0.5 text-[10.5px] text-ink-500">
                {n(a.timeline.length)} bars · grey is total, red is failed.
              </p>
              <svg viewBox={`0 0 ${a.timeline.length * 3} 100`} preserveAspectRatio="none"
                   className="mt-3 h-40 w-full" role="img" aria-label="Requests over time">
                {a.timeline.map((b, i) => (
                  <g key={b.t}>
                    <rect x={i * 3} y={100 - (b.total / maxT) * 100} width="2.2"
                          height={(b.total / maxT) * 100} fill="var(--hair-strong)" />
                    <rect x={i * 3} y={100 - (b.fail / maxT) * 100} width="2.2"
                          height={(b.fail / maxT) * 100} fill={ALERT_HIGH} />
                  </g>
                ))}
              </svg>
            </section>
          )}

          <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {denom > 0 && (
              <section className="lg-card lg-rise p-4" style={{ '--accent': tint(3) } as React.CSSProperties}>
                <h3 className="lg-title text-[13px] font-bold">Accepted against rejected</h3>
                <div className="mt-3">
                  <Donut colours={palette} size={168}
                         slices={[
                           { label: 'Accepted', value: a.totals.pass },
                           { label: 'Rejected', value: a.totals.fail },
                         ]}
                         centreValue={pc(failRate)} centreLabel="failed" />
                </div>
              </section>
            )}
            {a.errors.length > 0 && (
              <section className="lg-card lg-rise p-4" style={{ '--accent': ALERT_HIGH } as React.CSSProperties}>
                <h3 className="lg-title text-[13px] font-bold">Failures by reason</h3>
                <div className="mt-3">
                  <Donut colours={palette} size={168}
                         slices={a.errors.slice(0, 6).map(e => ({
                           label: e.key.slice(0, 28), value: e.total,
                         }))}
                         centreValue={n(a.totals.fail)} centreLabel="failures" />
                </div>
              </section>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {panels.map((p, i) => (
              <Panel key={p.title} data={p} onExpand={setDetail} accent={tint(i)} />
            ))}
          </div>

          <p className="mt-6 max-w-3xl text-[11px] leading-relaxed text-ink-500">
            Columns were inferred from your file, not assumed. Open any panel for the full sortable
            list. These files were read inside your browser; nothing was uploaded, stored or
            logged, and reloading the tab discards them.
          </p>
        </div>
      </div>

      {detail && <DetailView data={detail} onClose={() => setDetail(null)} />}
    </>
  )
}
