'use client'

// ============================================================
// components/tools/dashboard-section.tsx
//
// The seven CSVs from ISE's Manage → Export.
//
// This is the most visual of the sections because the data suits
// it: small, clean, already aggregated by ISE. Where the log
// analysers have to earn their conclusions from millions of lines,
// this one arrives ready to draw.
//
// Two rules govern the styling, and they pull against each other:
//
//   1. It should look like an instrument, not a spreadsheet.
//   2. Nothing decorative may make a number harder to read.
//
// Where they conflict, (2) wins. The blueprint grid sits at four
// percent opacity. The glass panels are 74% white, not 30%. Every
// gauge prints its own value rather than asking to be estimated
// from a waterline. A dashboard that photographs well and cannot
// be read at 9am on a bridge call has failed at its only job.
// ============================================================

import {
  Panel, Donut, MultiLine, Sparkline, LiquidGauge,
  SectionBanner, NODE_COLOURS, useInkRotation,
  ALERT_HIGH, ALERT_MED, DIM,
  n, pc, ms, type PanelData,
} from './panel'
import type { DashboardAnalysis, NodeSeries, Pair } from '@/lib/tools/dashboard'

// n() rounds to whole numbers, which is right for counts and wrong
// here — CPU across a healthy estate sits between 1 and 15%, where
// rounding away the decimal throws out most of the signal.
const metric = (v: number) => v >= 10 ? Math.round(v).toLocaleString() : v.toFixed(1)

const cssVar = (accent: string) => ({ '--accent': accent }) as React.CSSProperties

// ------------------------------------------------------------
// widget shells
// ------------------------------------------------------------

function Widget({ title, note, accent = NODE_COLOURS[0], className = '', right, children }: {
  title?: string
  note?: string
  accent?: string
  className?: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className={`lg-card lg-rise overflow-hidden ${className}`}
             style={cssVar(accent)}>
      {title && (
        <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-3.5">
          <div className="min-w-0">
            <h3 className="lg-title text-[13px] font-bold leading-tight"
                style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}>
              {title}
            </h3>
            {note && <p className="mt-0.5 text-[10.5px] leading-snug text-ink-500">{note}</p>}
          </div>
          {right}
        </header>
      )}
      <div className={title ? 'px-4 pb-4' : 'p-4'}>{children}</div>
    </section>
  )
}

/** A single headline number, with the shape it came from. */
function StatCard({ label, value, unit, sub, accent, spark, sparkMax }: {
  label: string
  value: string
  unit?: string
  sub?: string
  accent: string
  spark?: (number | null)[]
  sparkMax?: number
}) {
  return (
    <div className="lg-card lg-rise flex flex-col justify-between p-3.5"
         style={cssVar(accent)}>
      <p className="text-[9px] font-bold uppercase tracking-[0.11em] text-ink-400">{label}</p>
      <p className="mt-2 font-mono text-[24px] font-bold leading-none tabular-nums"
         style={{ color: accent }}>
        {value}
        {unit && <span className="ml-0.5 text-[12px] font-normal text-ink-400">{unit}</span>}
      </p>
      {spark && spark.length > 1 && (
        <div className="mt-2">
          <Sparkline values={spark} max={sparkMax ?? Math.max(1, ...spark.map(v => v ?? 0))}
                     colour={accent} height={22} />
        </div>
      )}
      {sub && <p className="mt-1.5 truncate text-[10px] text-ink-500">{sub}</p>}
    </div>
  )
}

/** A percentage as a filling sphere, in its own widget. */
function GaugeCard({ label, value, sub, accent, alert }: {
  label: string
  value: number
  sub?: string
  accent: string
  alert?: boolean
}) {
  return (
    <div className="lg-card lg-rise flex flex-col items-center justify-center gap-1.5 p-3.5"
         style={cssVar(alert ? ALERT_HIGH : accent)}>
      <LiquidGauge value={value} colour={alert ? ALERT_HIGH : accent} size={84} alert={alert} />
      <p className="lg-title text-center text-[9px] font-bold uppercase tracking-[0.11em]">
        {label}
      </p>
      {sub && <p className="text-center text-[10px] leading-tight text-ink-400">{sub}</p>}
    </div>
  )
}

const SEV: Record<string, { accent: string; label: string }> = {
  high:   { accent: ALERT_HIGH, label: 'High' },
  medium: { accent: ALERT_MED,  label: 'Medium' },
  info:   { accent: DIM,        label: 'Note' },
}

function Finding({ f }: { f: DashboardAnalysis['findings'][number] }) {
  const s = SEV[f.severity] ?? SEV.info
  return (
    <div className="lg-card lg-rise p-3" style={cssVar(s.accent)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="lg-title text-[13px] font-bold leading-tight"
           style={{ fontFamily: 'var(--font-heading)' }}>
          {f.headline}
        </p>
        <span className="text-[9px] font-bold uppercase tracking-[0.1em]"
              style={{ color: s.accent }}>
          {s.label}
        </span>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-600">{f.detail}</p>
    </div>
  )
}

// ------------------------------------------------------------
// the ranked list widget
// ------------------------------------------------------------

/**
 * A table without table furniture.
 *
 * Ranked data does not need column headers repeated in every
 * panel — it needs the eye to land on the top row and the bar
 * lengths to do the comparing. The bar sits behind the text
 * rather than in its own column, which buys back roughly a third
 * of the width for labels that are otherwise all truncated.
 */
function RankWidget({ title, note, rows, accent, tint, unit, onOpen, take = 7 }: {
  title: string
  note: string
  rows: Pair[]
  accent: string
  tint: (i: number) => string
  unit?: string
  onOpen?: () => void
  take?: number
}) {
  if (rows.length === 0) return null
  const max = Math.max(1, ...rows.map(r => r.count))
  const total = rows.reduce((a, r) => a + r.count, 0)
  const shown = rows.slice(0, take)

  return (
    <Widget title={title} note={note} accent={accent}>
      <ol className="space-y-0.5">
        {shown.map((r, i) => (
          <li key={r.label}
              className="lg-row relative flex items-center gap-2.5 px-2 py-[7px]">
            <span className="pointer-events-none absolute inset-y-0 left-0 rounded-[10px]"
                  style={{
                    width: `${(r.count / max) * 100}%`,
                    background: `linear-gradient(90deg, ${accent}33, ${accent}08)`,
                  }}
                  aria-hidden="true" />
            <span className="relative w-4 shrink-0 text-center font-mono text-[9.5px] font-bold text-ink-300">
              {i + 1}
            </span>
            <span className="relative h-2 w-2 shrink-0 rounded-full"
                  style={{ background: tint(i) }} aria-hidden="true" />
            <span className="relative min-w-0 flex-1 truncate text-[11.5px] text-ink-800"
                  title={r.label}>
              {r.label}
            </span>
            <span className="relative shrink-0 font-mono text-[11.5px] font-bold tabular-nums"
                  style={{ color: tint(i) }}>
              {n(r.count)}{unit}
            </span>
            <span className="relative w-11 shrink-0 text-right font-mono text-[10px] tabular-nums text-ink-400">
              {total ? pc(r.count / total) : '—'}
            </span>
          </li>
        ))}
      </ol>
      {rows.length > take && onOpen && (
        <button onClick={onOpen}
                className="lg-pill mt-2.5 px-3 py-1 text-[9.5px] font-bold uppercase tracking-[0.1em]"
                style={{ color: accent }}>
          {rows.length - take} more — open
        </button>
      )}
    </Widget>
  )
}

// ------------------------------------------------------------
// per-node widgets
// ------------------------------------------------------------

/**
 * One card per node, all on shared scales.
 *
 * This replaces a chart that carried eleven lines on one axis.
 * Past about five series every line crosses every other and the
 * reader can follow none of them; the fix is not better colours
 * but more charts. Repeating a small panel keeps each node
 * readable and still lets the eye sweep for the one that differs,
 * which is the actual question being asked.
 *
 * CPU and memory get liquid gauges because they are genuinely
 * percentages of a bounded thing. Latency does not — it has no
 * ceiling to be a fraction of — so it stays a number and a curve.
 * Drawing it as a gauge would mean inventing a maximum and
 * implying a full tank meant something.
 */
function NodeGrid({ nodes, hours, tint }: {
  nodes: NodeSeries[]; hours: string[]; tint: (i: number) => string
}) {
  if (nodes.length === 0) return null

  const at = (nd: NodeSeries, key: 'latency' | 'cpu' | 'memory') =>
    hours.map(h => nd.samples.find(s => s.t === h)?.[key] ?? null)

  const latMax = Math.max(1, ...nodes.map(nd => nd.peakLatency))
  const fleetLatency = nodes.reduce((s, nd) => s + nd.avgLatency, 0) / nodes.length

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[15px] font-bold text-ink-900"
            style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.015em' }}>
          Every node, side by side
        </h3>
        <p className="text-[10.5px] text-ink-500">
          Slowest first. Latency curves share one scale to {n(latMax)} ms, so a taller line
          really is a higher number.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {nodes.map((nd, i) => {
          const colour = tint(i)
          const slow = nd.avgLatency > fleetLatency * 1.5 && nd.avgLatency > 20
          const hotCpu = nd.peakCpu >= 80
          const hotMem = nd.peakMemory >= 85

          return (
            <section key={nd.name}
                     className="lg-card lg-rise overflow-hidden"
                     style={cssVar(slow ? ALERT_HIGH : colour)}>
              <header className="flex items-center gap-2 px-3.5 pb-2 pt-3.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: colour, boxShadow: `0 0 0 3px ${colour}33` }}
                      aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-bold"
                      style={{ color: colour }}>
                  {nd.name}
                </span>
                {nd.role && (
                  <span className="lg-pill shrink-0 px-2 py-0.5
                                   text-[8.5px] font-bold uppercase tracking-[0.09em] text-ink-400">
                    {nd.role}
                  </span>
                )}
              </header>

              <div className="flex items-center gap-3 px-3.5 pb-3.5">
                <div className="flex shrink-0 gap-2">
                  <LiquidGauge value={nd.avgCpu} colour={hotCpu ? ALERT_HIGH : colour} size={64}
                               caption="CPU" alert={hotCpu} />
                  <LiquidGauge value={nd.avgMemory} colour={hotMem ? ALERT_HIGH : colour} size={64}
                               caption="Memory" alert={hotMem} />
                </div>

                <div className="lg-inset min-w-0 flex-1 px-2.5 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-400">
                      Latency
                    </span>
                    <span className="font-mono text-[9.5px] tabular-nums text-ink-400">
                      peak <span className={slow ? 'font-bold' : 'text-ink-600'}
                                 style={slow ? { color: ALERT_HIGH } : undefined}>
                        {metric(nd.peakLatency)}
                      </span>
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[20px] font-bold leading-none tabular-nums"
                     style={{ color: slow ? ALERT_HIGH : colour }}>
                    {metric(nd.avgLatency)}
                    <span className="text-[10px] font-normal text-ink-400"> ms</span>
                  </p>
                  <div className="mt-1">
                    <Sparkline values={at(nd, 'latency')} max={latMax} colour={colour} height={26} />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-white/[.07]
                              px-3.5 py-1.5 font-mono text-[9.5px] tabular-nums text-ink-400">
                <span>peak cpu <span className={hotCpu ? 'font-bold' : 'text-ink-700'}
                                     style={hotCpu ? { color: ALERT_HIGH } : undefined}>
                  {metric(nd.peakCpu)}%
                </span></span>
                <span>peak mem <span className={hotMem ? 'font-bold' : 'text-ink-700'}
                                     style={hotMem ? { color: ALERT_HIGH } : undefined}>
                  {metric(nd.peakMemory)}%
                </span></span>
                <span>{nd.samples.length} samples</span>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

// ------------------------------------------------------------

/** Collapse a long tail into "everything else" so a donut stays readable. */
function toSlices(rows: Pair[], take = 6) {
  const top = rows.slice(0, take)
  const rest = rows.slice(take).reduce((a, r) => a + r.count, 0)
  const slices = top.map(r => ({ label: r.label, value: r.count }))
  if (rest > 0) slices.push({ label: `${rows.length - take} others`, value: rest })
  return slices
}

const pairPanel = (title: string, note: string, head: string, rows: Pair[], countHead: string): PanelData => {
  const max = Math.max(1, ...rows.map(r => r.count))
  const total = rows.reduce((a, r) => a + r.count, 0)
  return {
    title, note,
    columns: [
      { head, align: 'left' },
      { head: countHead, align: 'right', width: 'w-24' },
      { head: 'Share', align: 'right', width: 'w-12' },
    ],
    rows: rows.map(r => ({
      id: r.label,
      bar: r.count / max,
      cells: [r.label, n(r.count), pc(total ? r.count / total : 0)],
      sort: [r.label, r.count, total ? r.count / total : 0],
    })),
  }
}

export default function DashboardSection({ a, onExpand }: {
  a: DashboardAnalysis
  onExpand: (d: PanelData) => void
}) {
  // The palette is dealt from a different starting card on each
  // load, so nothing on the page is permanently "the blue one".
  const tint = useInkRotation()

  const withSamples = a.nodes.filter(nd => nd.samples.length > 1)

  // Node series aligned to one shared hour axis — a node missing an
  // hour gets a null so the line breaks rather than lying.
  const latencySeries = withSamples.map(nd => ({
    label: nd.name,
    values: a.latencyHours.map(h => nd.samples.find(s => s.t === h)?.latency ?? null),
  }))
  const hourLabels = a.latencyHours.map(h => h.slice(11, 16))

  // One colour per node, fixed here and reused by every chart, so a
  // node keeps its identity as the eye moves down the page.
  const colourByNode = new Map(withSamples.map((nd, i) => [nd.name, tint(i)]))
  const colourOf = (label: string) => colourByNode.get(label) ?? DIM

  // Only nodes that actually depart from the pack get drawn in
  // colour on the combined chart. The rest become grey context —
  // present, so the envelope is visible, but not competing.
  const spikiest = [...withSamples]
    .sort((x, y) => y.peakLatency - x.peakLatency)
    .slice(0, 3)
    .map(nd => nd.name)

  const successRate = a.totals.authentications
    ? (1 - a.totals.failures / a.totals.authentications) * 100
    : 0
  const connectedShare = (a.totals.connected + a.totals.disconnected)
    ? (a.totals.connected / (a.totals.connected + a.totals.disconnected)) * 100
    : 0
  const activeShare = a.totals.endpointsTotal
    ? (a.totals.endpointsActive / a.totals.endpointsTotal) * 100
    : 0
  const fleetCpu = withSamples.length
    ? withSamples.reduce((s, nd) => s + nd.avgCpu, 0) / withSamples.length : 0
  const fleetMem = withSamples.length
    ? withSamples.reduce((s, nd) => s + nd.avgMemory, 0) / withSamples.length : 0
  const worstMem = withSamples.reduce(
    (w, nd) => nd.peakMemory > (w?.peakMemory ?? -1) ? nd : w,
    undefined as NodeSeries | undefined)

  const fleetLatencySpark = a.latencyHours.map(h => {
    const vals = withSamples
      .map(nd => nd.samples.find(s => s.t === h)?.latency)
      .filter((v): v is number => v !== undefined)
    return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null
  })

  // Held as a named const rather than read back out of the array.
  // TypeScript drops the narrowing from `panels[0] ? … : …` once the
  // truthy branch becomes a closure, so the indexed form compiles as
  // possibly-undefined — the same trap as the `freeHeader` null
  // earlier in this project.
  const failurePanel: PanelData | null = a.failureReasons.length ? (() => {
    const max = Math.max(1, ...a.failureReasons.map(f => f.count))
    return {
      title: 'Failure reasons',
      note: 'Every reason ISE reported, with its message code.',
      columns: [
        { head: 'Reason', align: 'left' as const },
        { head: 'Code', align: 'right' as const, width: 'w-14' },
        { head: 'Count', align: 'right' as const, width: 'w-20' },
        { head: 'Share', align: 'right' as const, width: 'w-12' },
      ],
      rows: a.failureReasons.map(f => ({
        id: f.code + f.text,
        bar: f.count / max,
        barFail: 1,
        cells: [
          f.text,
          <span key="c" className="text-signal-500">{f.code || '—'}</span>,
          n(f.count),
          pc(a.totals.failures ? f.count / a.totals.failures : 0),
        ],
        sort: [f.text, Number(f.code) || 0, f.count, f.count],
      })),
    }
  })() : null

  // Failure reasons deliberately absent — it has a rank widget above
  // with an "open sortable" button, and printing it twice on one
  // page is clutter rather than thoroughness.
  const panels: PanelData[] = []
  if (a.metrics.length) {
    panels.push(pairPanel('Dashboard metrics', 'The headline counters as ISE reports them.',
      'Metric', a.metrics, 'Value'))
  }

  const alarmMax = Math.max(1, ...a.alarms.map(al => al.occurrences))

  return (
    <>
      {/* WidgetStyles is rendered once by the analyser root, which
          is the only thing that mounts this section. */}
      <SectionBanner
        title="ISE Dashboard Export"
        subtitle={
          `${a.files.length} file${a.files.length === 1 ? '' : 's'} · ` +
          `${withSamples.length} node${withSamples.length === 1 ? '' : 's'} with metrics · ` +
          `${a.latencyHours.length} hourly samples`
        }
      />

      {/* No canvas of its own — the analyser root already supplies
          one, and nesting two sets of blooms would double the tint
          under these cards and leave a visible seam where the
          dashboard starts. */}
      <div>

        {/* ---------- gauges: the four bounded percentages ---------- */}
        <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <GaugeCard label="Authentication success" value={successRate}
                     accent={tint(0)} alert={successRate < 90}
                     sub={`${n(a.totals.failures)} failed of ${n(a.totals.authentications)}`} />
          <GaugeCard label="Endpoints connected" value={connectedShare}
                     accent={tint(1)}
                     sub={`${n(a.totals.connected)} up · ${n(a.totals.disconnected)} down`} />
          <GaugeCard label="Fleet average CPU" value={fleetCpu}
                     accent={tint(2)} alert={fleetCpu >= 70}
                     sub={`mean of ${withSamples.length} node${withSamples.length === 1 ? '' : 's'}`} />
          <GaugeCard label="Fleet average memory" value={fleetMem}
                     accent={tint(3)} alert={fleetMem >= 85}
                     sub={worstMem ? `worst ${worstMem.name} at ${metric(worstMem.peakMemory)}%` : undefined} />
        </div>

        {/* ---------- counts and durations, which are not percentages ---------- */}
        <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Average latency" value={metric(a.totals.avgLatency)} unit="ms"
                    accent={tint(4)} spark={fleetLatencySpark}
                    sub={`across ${withSamples.length} nodes`} />
          <StatCard label="Peak latency" value={metric(a.totals.peakLatency)} unit="ms"
                    accent={tint(5)} sub={a.totals.slowestNode ?? undefined} />
          <StatCard label="Authentications" value={n(a.totals.authentications)}
                    accent={tint(6)} sub="in the export window" />
          <StatCard label="Failures" value={n(a.totals.failures)}
                    accent={a.totals.failures > 0 ? ALERT_HIGH : tint(7)}
                    sub={a.totals.authentications
                      ? pc(a.totals.failures / a.totals.authentications, 2) + ' of total'
                      : undefined} />
          <StatCard label="Total endpoints" value={n(a.totals.endpointsTotal)}
                    accent={tint(8)}
                    sub={`${n(a.totals.endpointsActive)} active · ${pc(activeShare / 100)}`} />
          <StatCard label="Alarms firing" value={n(a.alarms.reduce((s, x) => s + x.occurrences, 0))}
                    accent={tint(9)}
                    sub={`${a.alarms.length} distinct type${a.alarms.length === 1 ? '' : 's'}`} />
        </div>

        {/* ---------- findings ---------- */}
        {a.findings.length > 0 && (
          <div className="mb-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[15px] font-bold text-ink-900"
                  style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.015em' }}>
                What stands out
              </h3>
              <p className="text-[10.5px] text-ink-500">
                Latency spread, resource pressure, alarms and profiling coverage.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {a.findings.map((f, i) => <Finding key={i} f={f} />)}
            </div>
          </div>
        )}

        {/* ---------- per-node small multiples ---------- */}
        <div className="mb-3">
          <NodeGrid nodes={withSamples} hours={a.latencyHours} tint={tint} />
        </div>

        {/* ---------- the combined latency chart ---------- */}
        {latencySeries.length > 0 && (
          <div className="mb-3">
            <Widget
              accent={tint(10)}
              title="Authentication latency — where it spikes"
              note={`${a.latencyHours.length} hourly samples. The three nodes with the highest peaks are named; the remaining ${Math.max(0, latencySeries.length - 3)} sit behind them in grey so normal is visible. A spike shared by several nodes points at a common dependency; a spike on one points at that node.`}
            >
              <MultiLine labels={hourLabels} series={latencySeries} unit="milliseconds"
                         height={230} emphasise={spikiest} colourOf={colourOf} />
            </Widget>
          </div>
        )}

        {/* ---------- alarms ---------- */}
        {a.alarms.length > 0 && (
          <div className="mb-3">
            <Widget
              accent={tint(11)}
              title="Alarms"
              note="Ranked by how often each has fired. Severity is as ISE numbers it — 1 critical, 2 warning, 3 information."
            >
              <div className="space-y-0.5">
                {a.alarms.slice(0, 12).map(al => {
                  const c = al.severity === 1 ? ALERT_HIGH
                    : al.severity === 2 ? ALERT_MED : DIM
                  return (
                    <div key={al.name}
                         className="lg-row relative flex items-center gap-2.5 px-2 py-[7px]">
                      <span className="pointer-events-none absolute inset-y-0 left-0 rounded-[10px]"
                            style={{
                              width: `${(al.occurrences / alarmMax) * 100}%`,
                              background: `linear-gradient(90deg, ${c}33, ${c}08)`,
                            }}
                            aria-hidden="true" />
                      <span className="relative h-5 w-[3px] shrink-0 rounded-full"
                            style={{ background: c }} aria-hidden="true" />
                      <span className="relative min-w-0 flex-1 truncate text-[11.5px] text-ink-800"
                            title={al.name}>
                        {al.name}
                      </span>
                      <span className="relative shrink-0 font-mono text-[11.5px] font-bold tabular-nums"
                            style={{ color: c }}>
                        {n(al.occurrences)}
                      </span>
                      <span className="relative hidden w-32 shrink-0 text-right font-mono
                                       text-[10px] tabular-nums text-ink-400 sm:block">
                        {al.lastOccurred}
                      </span>
                    </div>
                  )
                })}
              </div>
              {a.alarms.length > 12 && (
                <button
                  onClick={() => onExpand({
                    title: 'All alarms',
                    note: 'Every alarm in the export, sortable.',
                    columns: [
                      { head: 'Alarm', align: 'left' },
                      { head: 'Severity', align: 'right', width: 'w-20' },
                      { head: 'Occurrences', align: 'right', width: 'w-24' },
                      { head: 'Last occurred', align: 'right', width: 'w-36' },
                    ],
                    rows: a.alarms.map(al => ({
                      id: al.name,
                      bar: al.occurrences / alarmMax,
                      barFail: al.severity <= 2 ? 1 : 0,
                      cells: [al.name, al.severity, n(al.occurrences), al.lastOccurred],
                      sort: [al.name, al.severity, al.occurrences, -al.minutesAgo],
                    })),
                  })}
                  className="lg-pill mt-2.5 px-3 py-1 text-[9.5px] font-bold uppercase tracking-[0.1em]"
                  style={{ color: tint(11) }}
                >
                  {a.alarms.length - 12} more — open
                </button>
              )}
            </Widget>
          </div>
        )}

        {/* ---------- ranked breakdowns ---------- */}
        <div className="mb-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          <RankWidget title="Network devices" note="Authentications handled by each device."
                      accent={tint(0)} tint={tint} rows={a.networkDevices}
                      onOpen={() => onExpand(pairPanel('Network devices',
                        'Authentications handled by each device.', 'Device', a.networkDevices, 'Auths'))} />
          <RankWidget title="Endpoint profiles" note="What profiling identified across the estate."
                      accent={tint(2)} tint={tint} rows={a.endpointProfiles}
                      onOpen={() => onExpand(pairPanel('Endpoint profiles',
                        'What profiling identified.', 'Profile', a.endpointProfiles, 'Endpoints'))} />
          <RankWidget title="Identity stores" note="Where identities were verified."
                      accent={tint(4)} tint={tint} rows={a.identityStores}
                      onOpen={() => onExpand(pairPanel('Identity stores',
                        'Where identities were verified.', 'Identity store', a.identityStores, 'Auths'))} />
          <RankWidget title="Identity groups" note="Which group each authentication resolved to."
                      accent={tint(6)} tint={tint} rows={a.identityGroups}
                      onOpen={() => onExpand(pairPanel('Identity groups',
                        'Which group each authentication resolved to.', 'Identity group',
                        a.identityGroups, 'Auths'))} />
          <RankWidget title="Failure reasons" note="Top reasons by count, with ISE message codes."
                      accent={ALERT_HIGH} tint={tint}
                      rows={a.failureReasons.map(f => ({
                        label: f.code ? `${f.code} · ${f.text}` : f.text, count: f.count,
                      }))}
                      onOpen={failurePanel ? () => onExpand(failurePanel) : undefined} />
        </div>

        {/* ---------- donuts ---------- */}
        <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {a.endpointStatus.length > 0 && (
            <Widget title="Endpoint connectivity" note="Connected against disconnected, right now."
                    accent={tint(1)}>
              <Donut colours={NODE_COLOURS} size={150}
                     slices={a.endpointStatus.map(s => ({ label: s.label, value: s.count }))}
                     centreValue={n(a.totals.connected)} centreLabel="connected" />
            </Widget>
          )}

          {a.failureReasons.length > 0 && (
            <Widget title="Failures by reason" note="Top reasons, remainder grouped."
                    accent={ALERT_HIGH}>
              <Donut colours={NODE_COLOURS} size={150}
                     slices={toSlices(a.failureReasons.map(f => ({
                       label: f.code || f.text.slice(0, 28), count: f.count,
                     })), 6)}
                     centreValue={n(a.totals.failures)} centreLabel="failures" />
            </Widget>
          )}

          {a.endpointProfiles.length > 0 && (
            <Widget title="Endpoint profiles" note="What profiling has identified."
                    accent={tint(3)}>
              <Donut colours={NODE_COLOURS} size={150} slices={toSlices(a.endpointProfiles, 6)}
                     centreValue={n(a.endpointProfiles.reduce((s, p) => s + p.count, 0))}
                     centreLabel="endpoints" />
            </Widget>
          )}

          {a.identityStores.length > 0 && (
            <Widget title="Identity stores" note="Where authentications were verified."
                    accent={tint(5)}>
              <Donut colours={NODE_COLOURS} size={150} slices={toSlices(a.identityStores, 6)}
                     centreValue={n(a.totals.authentications)} centreLabel="auths" />
            </Widget>
          )}

          {a.networkDevices.length > 0 && (
            <Widget title="Network devices" note="Share of authentications per device."
                    accent={tint(7)}>
              <Donut colours={NODE_COLOURS} size={150} slices={toSlices(a.networkDevices, 7)}
                     centreValue={n(a.networkDevices.length)} centreLabel="devices" />
            </Widget>
          )}

          {a.alarmsBySeverity.length > 0 && (
            <Widget title="Alarms by severity" note="Occurrences, not distinct alarm types."
                    accent={tint(9)}>
              <Donut colours={[ALERT_HIGH, ALERT_MED, DIM, '#6C7484']} size={150}
                     slices={a.alarmsBySeverity.map(s => ({ label: s.label, value: s.occurrences }))}
                     centreValue={n(a.alarms.reduce((s, x) => s + x.occurrences, 0))}
                     centreLabel="occurrences" />
            </Widget>
          )}
        </div>

        {/* ---------- the sortable node table, kept ---------- */}
        {withSamples.length > 0 && (
          <div className="mb-3">
            <Panel
              onExpand={onExpand}
              accent={tint(8)}
              data={{
                title: 'Node summary',
                note: 'Averages and peaks across the sampled window, slowest first. Sortable — click any column head.',
                columns: [
                  { head: 'Node', align: 'left' },
                  { head: 'Role', align: 'right', width: 'w-24' },
                  { head: 'Avg latency', align: 'right', width: 'w-24' },
                  { head: 'Peak', align: 'right', width: 'w-20' },
                  { head: 'Avg CPU', align: 'right', width: 'w-20' },
                  { head: 'Peak CPU', align: 'right', width: 'w-20' },
                  { head: 'Avg mem', align: 'right', width: 'w-20' },
                  { head: 'Peak mem', align: 'right', width: 'w-20' },
                ],
                rows: a.nodes.map((nd, i) => ({
                  id: nd.name,
                  bar: a.totals.peakLatency ? nd.avgLatency / a.totals.peakLatency : 0,
                  cells: [
                    <span key="nm" className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: tint(i) }} />
                      <span style={{ color: tint(i) }}>{nd.name}</span>
                      <span className="text-ink-400">{nd.type}</span>
                    </span>,
                    nd.role,
                    ms(nd.avgLatency),
                    ms(nd.peakLatency),
                    `${metric(nd.avgCpu)}%`,
                    <span key="pc" className={nd.peakCpu >= 80 ? 'font-bold' : ''}
                          style={nd.peakCpu >= 80 ? { color: ALERT_HIGH } : undefined}>
                      {metric(nd.peakCpu)}%
                    </span>,
                    `${metric(nd.avgMemory)}%`,
                    <span key="pm" className={nd.peakMemory >= 85 ? 'font-bold' : ''}
                          style={nd.peakMemory >= 85 ? { color: ALERT_HIGH } : undefined}>
                      {metric(nd.peakMemory)}%
                    </span>,
                  ],
                  sort: [nd.name, nd.role, nd.avgLatency, nd.peakLatency,
                         nd.avgCpu, nd.peakCpu, nd.avgMemory, nd.peakMemory],
                })),
              }}
            />
          </div>
        )}

        {/* ---------- anything left over ---------- */}
        {panels.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {panels.map(p => <Panel key={p.title} data={p} onExpand={onExpand} />)}
          </div>
        )}
      </div>
    </>
  )
}
