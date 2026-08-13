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
  Panel, Tile, Donut, MultiLine, SectionBanner, SERIES_COLOURS,
  n, pc, ms, type PanelData,
} from './panel'
import type { DashboardAnalysis, Pair } from '@/lib/tools/dashboard'

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
  const cpuSeries = withSamples.map(nd => ({
    label: nd.name,
    values: a.latencyHours.map(h => nd.samples.find(s => s.t === h)?.cpu ?? null),
  }))
  const memSeries = withSamples.map(nd => ({
    label: nd.name,
    values: a.latencyHours.map(h => nd.samples.find(s => s.t === h)?.memory ?? null),
  }))
  const hourLabels = a.latencyHours.map(h => h.slice(11, 16))

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
            title="Authentication latency by node"
            note={`One line per node across ${a.latencyHours.length} hourly samples. Lines that move together point at a shared dependency; one line apart points at that node.`}
          >
            <MultiLine labels={hourLabels} series={latencySeries} unit="milliseconds" height={260} />
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

      {/* ---------- cpu and memory ---------- */}
      {(cpuSeries.length > 0 || memSeries.length > 0) && (
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          {cpuSeries.length > 0 && (
            <Card title="CPU by node" note="Percentage, hourly.">
              <MultiLine labels={hourLabels} series={cpuSeries} unit="percent" height={200} />
            </Card>
          )}
          {memSeries.length > 0 && (
            <Card title="Memory by node" note="Percentage, hourly.">
              <MultiLine labels={hourLabels} series={memSeries} unit="percent" height={200} />
            </Card>
          )}
        </div>
      )}

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
