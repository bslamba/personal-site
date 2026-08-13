'use client'

// ============================================================
// components/tools/dashboard-section.tsx
//
// The seven CSVs from ISE's Manage → Export.
//
// This is the most visual of the sections because the data suits
// it: small, clean, already aggregated by ISE. Where the log
// analysers have to earn their conclusions from millions of
// lines, this one arrives ready to draw — so it gets the donuts,
// the per-node latency lines and the tiles.
// ============================================================

import {
  Panel, Tile, Donut, MultiLine, Sparkline, SectionBanner, SERIES_COLOURS,
  n, pc, ms, type PanelData,
} from './panel'
import type { DashboardAnalysis, NodeSeries, Pair } from '@/lib/tools/dashboard'

const SEV: Record<string, { border: string; label: string; tone: string }> = {
  high:   { border: 'border-l-signal-500', label: 'High',   tone: 'text-signal-500' },
  medium: { border: 'border-l-[#B45309]',  label: 'Medium', tone: 'text-[#B45309]' },
  info:   { border: 'border-l-ink-300',    label: 'Note',   tone: 'text-ink-400' },
}

function Finding({ f }: { f: DashboardAnalysis['findings'][number] }) {
  const s = SEV[f.severity] ?? SEV.info
  return (
    <div className={`border border-ink-200 border-l-2 ${s.border} bg-paper/80 p-3 backdrop-blur-sm`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-bold leading-tight text-ink-950"
           style={{ fontFamily: 'var(--font-heading)' }}>
          {f.headline}
        </p>
        <span className={`text-[9.5px] font-bold uppercase tracking-[0.09em] ${s.tone}`}>{s.label}</span>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-600">{f.detail}</p>
    </div>
  )
}

/** A card wrapper with the faint tinted face used across this section. */
function Card({ title, note, children, wide }: {
  title: string; note?: string; children: React.ReactNode; wide?: boolean
}) {
  return (
    <section className={`overflow-hidden border border-ink-200 bg-paper ${wide ? 'lg:col-span-2' : ''}`}>
      <header className="border-b border-ink-100 px-3.5 py-2.5"
              style={{ background: 'linear-gradient(180deg,rgba(23,23,26,.03),transparent)' }}>
        <h3 className="text-[13px] font-bold leading-tight text-ink-950"
            style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}>
          {title}
        </h3>
        {note && <p className="mt-0.5 text-[10.5px] leading-snug text-ink-400">{note}</p>}
      </header>
      <div className="p-3.5">{children}</div>
    </section>
  )
}

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

/**
 * One metric inside a node card: the two numbers that matter, then
 * the shape they came from.
 *
 * The numbers lead because they are what gets quoted in a ticket;
 * the sparkline is there to say whether the average is a flat line
 * or the residue of one bad hour. `max` arrives from the caller and
 * is shared by every node, so a tall line always means a high value
 * rather than a well-chosen axis.
 */
// n() rounds to whole numbers, which is right for counts and wrong
// here — CPU across this estate sits between 1 and 15%, where
// rounding away the decimal throws out most of the signal.
const metric = (v: number) => v >= 10 ? Math.round(v).toLocaleString() : v.toFixed(1)

function MetricRow({ label, avg, peak, unit, values, max, colour, alert }: {
  label: string
  avg: number
  peak: number
  unit: string
  values: (number | null)[]
  max: number
  colour: string
  alert?: boolean
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-400">{label}</span>
        <span className="font-mono text-[10px] tabular-nums text-ink-400">
          peak <span className={alert ? 'font-bold text-signal-500' : 'text-ink-600'}>
            {metric(peak)}{unit}
          </span>
        </span>
      </div>
      <div className="mt-0.5 flex items-end gap-2">
        <span className={`font-mono text-[17px] font-bold leading-none tabular-nums ${
          alert ? 'text-signal-500' : 'text-ink-950'
        }`}>
          {metric(avg)}<span className="text-[10px] font-normal text-ink-400">{unit}</span>
        </span>
        <span className="mb-0.5 flex-1">
          <Sparkline values={values} max={max} colour={colour} height={26} />
        </span>
      </div>
    </div>
  )
}

/**
 * Small multiples — one card per node, every card on the same
 * scales.
 *
 * This replaces a single chart carrying eleven lines. Beyond about
 * five series every line crosses every other and the reader can
 * follow none of them; the fix is not better colours but more
 * charts. Repeating a small panel keeps each node readable and
 * still lets the eye sweep the grid for the one that differs,
 * which is the actual question being asked.
 */
function NodeGrid({ nodes, hours }: { nodes: NodeSeries[]; hours: string[] }) {
  if (nodes.length === 0) return null

  const at = (nd: NodeSeries, key: 'latency' | 'cpu' | 'memory') =>
    hours.map(h => nd.samples.find(s => s.t === h)?.[key] ?? null)

  // Shared ceilings. Comparability across cards is the whole point,
  // so these are computed once over every node rather than per card.
  const latMax = Math.max(1, ...nodes.map(nd => nd.peakLatency))
  const cpuMax = Math.max(1, ...nodes.map(nd => nd.peakCpu))
  const memMax = Math.max(1, ...nodes.map(nd => nd.peakMemory))

  const fleetLatency = nodes.reduce((s, nd) => s + nd.avgLatency, 0) / nodes.length

  return (
    <div className="mb-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[13px] font-bold text-ink-950"
            style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}>
          Every node, side by side
        </h3>
        <p className="text-[10.5px] text-ink-400">
          Slowest first. All cards share one scale per metric, so a taller line really is a
          higher number — latency to {n(latMax)} ms, CPU to {n(cpuMax)}%, memory to {n(memMax)}%.
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {nodes.map((nd, i) => {
          const slow = nd.avgLatency > fleetLatency * 1.5 && nd.avgLatency > 20
          return (
            <section key={nd.name}
                     className={`overflow-hidden border bg-paper ${
                       slow ? 'border-signal-500/40' : 'border-ink-200'
                     }`}>
              <header className="flex items-center gap-2 border-b border-ink-100 px-3 py-2"
                      style={{ background: 'linear-gradient(180deg,rgba(23,23,26,.03),transparent)' }}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: SERIES_COLOURS[i % SERIES_COLOURS.length] }}
                      aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] font-bold text-ink-950">
                  {nd.name}
                </span>
                {nd.role && (
                  <span className="shrink-0 border border-ink-200 px-1.5 py-0.5 text-[8.5px]
                                   font-bold uppercase tracking-[0.08em] text-ink-500">
                    {nd.role}
                  </span>
                )}
              </header>

              <div className="space-y-2.5 p-3">
                <MetricRow label="Latency" unit=" ms" avg={nd.avgLatency} peak={nd.peakLatency}
                           values={at(nd, 'latency')} max={latMax}
                           colour={SERIES_COLOURS[i % SERIES_COLOURS.length]} alert={slow} />
                <MetricRow label="CPU" unit="%" avg={nd.avgCpu} peak={nd.peakCpu}
                           values={at(nd, 'cpu')} max={cpuMax} colour="#5C5C64"
                           alert={nd.peakCpu >= 80} />
                <MetricRow label="Memory" unit="%" avg={nd.avgMemory} peak={nd.peakMemory}
                           values={at(nd, 'memory')} max={memMax} colour="#8A8A93"
                           alert={nd.peakMemory >= 85} />
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

export default function DashboardSection({ a, onExpand }: {
  a: DashboardAnalysis
  onExpand: (d: PanelData) => void
}) {
  const withSamples = a.nodes.filter(nd => nd.samples.length > 1)

  // Node series aligned to one shared hour axis — a node missing an
  // hour gets a null so the line breaks rather than lying.
  const latencySeries = withSamples.map(nd => ({
    label: nd.name,
    values: a.latencyHours.map(h => nd.samples.find(s => s.t === h)?.latency ?? null),
  }))
  const hourLabels = a.latencyHours.map(h => h.slice(11, 16))

  // Only the nodes that actually depart from the pack are drawn in
  // colour on the combined chart. Everything else becomes grey
  // context — present, so the reader can see the envelope, but not
  // competing for attention with the lines that matter.
  const spikiest = [...withSamples]
    .sort((x, y) => y.peakLatency - x.peakLatency)
    .slice(0, 3)
    .map(nd => nd.name)

  const panels: PanelData[] = []
  if (a.failureReasons.length) {
    const max = Math.max(1, ...a.failureReasons.map(f => f.count))
    panels.push({
      title: 'Failure reasons',
      note: 'Every reason ISE reported, with its message code.',
      columns: [
        { head: 'Reason', align: 'left' },
        { head: 'Code', align: 'right', width: 'w-14' },
        { head: 'Count', align: 'right', width: 'w-20' },
        { head: 'Share', align: 'right', width: 'w-12' },
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
    })
  }
  if (a.networkDevices.length) {
    panels.push(pairPanel('Network devices', 'Authentications handled by each device.',
      'Device', a.networkDevices, 'Auths'))
  }
  if (a.identityGroups.length) {
    panels.push(pairPanel('Identity groups', 'Which group each authentication resolved to.',
      'Identity group', a.identityGroups, 'Auths'))
  }
  if (a.endpointProfiles.length) {
    panels.push(pairPanel('Endpoint profiles', 'What profiling identified across the estate.',
      'Profile', a.endpointProfiles, 'Endpoints'))
  }
  if (a.identityStores.length) {
    panels.push(pairPanel('Identity stores', 'Where identities were verified.',
      'Identity store', a.identityStores, 'Auths'))
  }
  if (a.metrics.length) {
    panels.push(pairPanel('Dashboard metrics', 'The headline counters as ISE reports them.',
      'Metric', a.metrics, 'Value'))
  }

  const alarmMax = Math.max(1, ...a.alarms.map(al => al.occurrences))

  return (
    <>
      <SectionBanner
        title="ISE Dashboard Export"
        subtitle={
          `${a.files.length} file${a.files.length === 1 ? '' : 's'} · ` +
          `${withSamples.length} node${withSamples.length === 1 ? '' : 's'} with metrics · ` +
          `${a.latencyHours.length} hourly samples`
        }
      />

      {/* ---------- tiles ---------- */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <Tile label="Average latency" value={ms(a.totals.avgLatency)}
              tone={a.totals.avgLatency > 150 ? 'amber' : 'ink'}
              sub={`across ${withSamples.length} nodes`}
              spark={withSamples[0]?.samples.map(s => s.latency)} />
        <Tile label="Peak latency" value={ms(a.totals.peakLatency)}
              tone={a.totals.peakLatency > 500 ? 'red' : 'ink'}
              sub={a.totals.slowestNode ?? undefined} />
        <Tile label="Authentications" value={n(a.totals.authentications)}
              sub="in the export window" />
        <Tile label="Failures" value={n(a.totals.failures)} tone="red"
              sub={a.totals.authentications
                ? pc(a.totals.failures / a.totals.authentications, 2) + ' of total'
                : undefined} />
        <Tile label="Total endpoints" value={n(a.totals.endpointsTotal)}
              sub={`${n(a.totals.endpointsActive)} active`} />
        <Tile label="Connected now" value={n(a.totals.connected)} tone="green"
              sub={`${n(a.totals.disconnected)} disconnected`} />
      </div>

      {/* ---------- findings ---------- */}
      {a.findings.length > 0 && (
        <section className="mb-4 border border-ink-200 p-3"
                 style={{ background: 'linear-gradient(180deg,rgba(23,23,26,.035),transparent)' }}>
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-bold text-ink-950"
                style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}>
              What stands out
            </h3>
            <p className="text-[10.5px] text-ink-400">
              Latency spread, resource pressure, alarms and profiling coverage.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {a.findings.map((f, i) => <Finding key={i} f={f} />)}
          </div>
        </section>
      )}

      {/* ---------- the latency chart ---------- */}
      {latencySeries.length > 0 && (
        <div className="mb-4">
          <Card
            title="Authentication latency — where it spikes"
            note={`${a.latencyHours.length} hourly samples. The three nodes with the highest peaks are named; the remaining ${Math.max(0, latencySeries.length - 3)} sit behind them in grey so you can see what normal looks like. A spike shared by several nodes points at a common dependency; a spike on one points at that node.`}
          >
            <MultiLine labels={hourLabels} series={latencySeries} unit="milliseconds"
                       height={230} emphasise={spikiest} />
          </Card>
        </div>
      )}

      {/* ---------- donuts ---------- */}
      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {a.endpointStatus.length > 0 && (
          <Card title="Endpoint connectivity" note="Connected against disconnected, right now.">
            <Donut
              slices={a.endpointStatus.map(s => ({ label: s.label, value: s.count }))}
              centreValue={n(a.totals.connected)}
              centreLabel="connected"
            />
          </Card>
        )}

        {a.failureReasons.length > 0 && (
          <Card title="Failures by reason" note="Top reasons, remainder grouped.">
            <Donut
              slices={toSlices(a.failureReasons.map(f => ({
                label: f.code || f.text.slice(0, 28), count: f.count,
              })), 6)}
              centreValue={n(a.totals.failures)}
              centreLabel="failures"
            />
          </Card>
        )}

        {a.endpointProfiles.length > 0 && (
          <Card title="Endpoint profiles" note="What profiling has identified.">
            <Donut
              slices={toSlices(a.endpointProfiles, 6)}
              centreValue={n(a.endpointProfiles.reduce((s, p) => s + p.count, 0))}
              centreLabel="endpoints"
            />
          </Card>
        )}

        {a.identityStores.length > 0 && (
          <Card title="Identity stores" note="Where authentications were verified.">
            <Donut
              slices={toSlices(a.identityStores, 6)}
              centreValue={n(a.totals.authentications)}
              centreLabel="auths"
            />
          </Card>
        )}

        {a.networkDevices.length > 0 && (
          <Card title="Network devices" note="Share of authentications per device.">
            <Donut slices={toSlices(a.networkDevices, 7)} centreLabel="devices"
                   centreValue={n(a.networkDevices.length)} />
          </Card>
        )}

        {a.alarmsBySeverity.length > 0 && (
          <Card title="Alarms by severity" note="Occurrences, not distinct alarm types.">
            <Donut
              slices={a.alarmsBySeverity.map(s => ({ label: s.label, value: s.occurrences }))}
              centreValue={n(a.alarms.reduce((s, x) => s + x.occurrences, 0))}
              centreLabel="occurrences"
            />
          </Card>
        )}
      </div>

      {/* ---------- alarms ---------- */}
      {a.alarms.length > 0 && (
        <div className="mb-4">
          <Card
            title="Alarms"
            note="Ranked by how often each has fired. Severity is as ISE numbers it — 1 critical, 2 warning, 3 information."
            wide
          >
            <div className="space-y-1.5">
              {a.alarms.slice(0, 14).map(al => {
                const tone = al.severity === 1 ? 'signal-500'
                  : al.severity === 2 ? '[#B45309]' : 'ink-300'
                return (
                  <div key={al.name} className="relative flex items-center gap-3 px-2 py-1.5">
                    <span className="pointer-events-none absolute inset-y-0 left-0 rounded-sm"
                          style={{
                            width: `${(al.occurrences / alarmMax) * 100}%`,
                            background: al.severity === 1
                              ? 'linear-gradient(90deg,rgba(211,0,45,.16),rgba(211,0,45,.03))'
                              : al.severity === 2
                                ? 'linear-gradient(90deg,rgba(180,83,9,.15),rgba(180,83,9,.03))'
                                : 'linear-gradient(90deg,rgba(23,23,26,.07),rgba(23,23,26,.01))',
                          }}
                          aria-hidden="true" />
                    <span className={`relative h-6 w-1 shrink-0 rounded-sm bg-${tone}`} />
                    <span className="relative min-w-0 flex-1 truncate text-[12px] text-ink-900">
                      {al.name}
                    </span>
                    <span className="relative w-20 shrink-0 text-right font-mono text-[11px] text-ink-700">
                      {n(al.occurrences)}
                    </span>
                    <span className="relative w-32 shrink-0 text-right font-mono text-[10.5px] text-ink-400">
                      {al.lastOccurred}
                    </span>
                  </div>
                )
              })}
            </div>
            {a.alarms.length > 14 && (
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
                className="mt-3 text-[10px] font-bold uppercase tracking-[0.09em] text-signal-500 hover:underline"
              >
                {a.alarms.length - 14} more — open
              </button>
            )}
          </Card>
        </div>
      )}

      {/* ---------- small multiples, one card per node ---------- */}
      <NodeGrid nodes={withSamples} hours={a.latencyHours} />

      {/* ---------- per-node summary ---------- */}
      {withSamples.length > 0 && (
        <div className="mb-4">
          <Panel
            onExpand={onExpand}
            data={{
              title: 'Node summary',
              note: 'Averages and peaks across the sampled window, slowest first.',
              columns: [
                { head: 'Node', align: 'left' },
                { head: 'Role', align: 'right', width: 'w-24' },
                { head: 'Avg latency', align: 'right', width: 'w-24' },
                { head: 'Peak', align: 'right', width: 'w-20' },
                { head: 'Avg CPU', align: 'right', width: 'w-20' },
                { head: 'Peak mem', align: 'right', width: 'w-20' },
              ],
              rows: a.nodes.map((nd, i) => ({
                id: nd.name,
                bar: a.totals.peakLatency ? nd.avgLatency / a.totals.peakLatency : 0,
                cells: [
                  <span key="nm" className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-sm"
                          style={{ background: SERIES_COLOURS[i % SERIES_COLOURS.length] }} />
                    <span>{nd.name}</span>
                    <span className="text-ink-400">{nd.type}</span>
                  </span>,
                  nd.role,
                  ms(nd.avgLatency),
                  ms(nd.peakLatency),
                  `${nd.avgCpu}%`,
                  <span key="m" className={nd.peakMemory >= 85 ? 'text-signal-500 font-bold' : ''}>
                    {nd.peakMemory}%
                  </span>,
                ],
                sort: [nd.name, nd.role, nd.avgLatency, nd.peakLatency, nd.avgCpu, nd.peakMemory],
              })),
            }}
          />
        </div>
      )}

      {/* ---------- the rest ---------- */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {panels.map(p => <Panel key={p.title} data={p} onExpand={onExpand} />)}
      </div>
    </>
  )
}
