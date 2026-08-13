'use client'

// ============================================================
// components/tools/kpm-section.tsx
//
// Dashboard for the Cisco ISE Key Performance Metrics report.
//
// Different data to the RADIUS side — gauges sampled hourly per
// node rather than a list of events — so it gets its own charts.
// It reuses the shared Panel furniture so tables behave identically
// across both reports.
// ============================================================

import {
  Panel, Kpi, SectionBanner, n, ms, pc, clock, duration,
  type PanelData,
} from './panel'
import type { KpmAnalysis, KpmNode, KpmFinding } from '@/lib/tools/kpm'

const SEVERITY: Record<KpmFinding['severity'], { border: string; label: string; tone: string }> = {
  high:   { border: 'border-l-signal-500',   label: 'High',   tone: 'text-signal-500' },
  medium: { border: 'border-l-[#B45309]',    label: 'Medium', tone: 'text-[#B45309]' },
  info:   { border: 'border-l-ink-300',      label: 'Note',   tone: 'text-ink-400' },
}

function FindingCard({ f }: { f: KpmFinding }) {
  const s = SEVERITY[f.severity]
  return (
    <div className={`border border-ink-200 border-l-2 ${s.border} bg-paper p-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-bold leading-tight text-ink-950"
           style={{ letterSpacing: '-0.005em' }}>
          {f.headline}
        </p>
        <span className={`text-[9.5px] font-bold uppercase tracking-[0.09em] ${s.tone}`}>
          {s.label}
        </span>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-600">{f.detail}</p>
    </div>
  )
}

/**
 * Requests per hour across the deployment, with mean system load on
 * a second axis. Load rising with volume is normal; load rising
 * while volume is flat is the thing worth noticing.
 */
function KpmTimeline({ a }: { a: KpmAnalysis }) {
  const data = a.timeline
  if (data.length < 2) return null

  const W = 1200, H = 190, padL = 62, padR = 52, padT = 14, padB = 24
  const iw = W - padL - padR, ih = H - padT - padB
  const maxReq = Math.max(1, ...data.map(d => d.requests))
  const maxLoad = Math.max(10, ...data.map(d => d.loadAvg))
  const bw = iw / data.length
  const x = (i: number) => padL + i * bw
  const yReq = (v: number) => padT + ih - (v / maxReq) * ih
  const yLoad = (v: number) => padT + ih - (v / maxLoad) * ih

  const loadLine = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${(x(i) + bw / 2).toFixed(1)},${yLoad(d.loadAvg).toFixed(1)}`)
    .join(' ')

  const step = Math.max(1, Math.ceil(data.length / 8))
  const ticks = data.map((_, i) => i).filter(i => i % step === 0 || i === data.length - 1)

  return (
    <section className="lg-card lg-rise mb-4">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 px-3 py-2">
        <h3 className="text-[13px] font-bold text-ink-950"
            style={{ letterSpacing: '-0.005em' }}>
          Deployment throughput and load
        </h3>
        <p className="text-[10.5px] text-ink-400">
          {data.length} samples every {duration(a.intervalMs)} · bars = RADIUS requests per hour
          summed across all nodes · line = mean system load · busiest single node peaked at{' '}
          {a.totals.tpsPeakNode.toFixed(1)} tps
        </p>
      </header>
      <div className="p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
             aria-label="RADIUS requests per hour and mean system load over time">
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <line key={f} x1={padL} x2={W - padR} y1={padT + ih * f} y2={padT + ih * f}
                  stroke="#ECECEF" strokeWidth="1" />
          ))}
          {data.map((d, i) => (
            <rect key={i} x={x(i) + bw * 0.18} width={Math.max(bw * 0.64, 1)}
                  y={yReq(d.requests)} height={Math.max(padT + ih - yReq(d.requests), 0)}
                  fill="#B5B5BC" />
          ))}
          <path d={loadLine} fill="none" stroke="#D3002D" strokeWidth="1.8"
                strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <circle key={'c' + i} cx={x(i) + bw / 2} cy={yLoad(d.loadAvg)} r="2.2" fill="#D3002D" />
          ))}

          <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize="10" fill="#8A8A93">{n(maxReq)}</text>
          <text x={padL - 6} y={padT + ih} textAnchor="end" fontSize="10" fill="#8A8A93">0</text>
          <text x={padL - 6} y={padT - 3} textAnchor="end" fontSize="8" fill="#B5B5BC">req/hr</text>
          <text x={W - padR + 6} y={padT + 4} fontSize="10" fill="#D3002D">{maxLoad.toFixed(0)}</text>
          <text x={W - padR + 6} y={padT + ih} fontSize="10" fill="#D3002D">0</text>
          <text x={W - padR + 6} y={padT - 3} fontSize="8" fill="#E58098">load</text>

          {ticks.map(i => (
            <text key={i} x={x(i) + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#8A8A93">
              {clock(data[i].ts)}
            </text>
          ))}
        </svg>
      </div>
    </section>
  )
}

/**
 * One tiny chart per node, all on the same vertical scale so their
 * relative size is honest. Twenty-four of these say more about how
 * load is distributed than any single ranked table can.
 */
function Sparklines({ a }: { a: KpmAnalysis }) {
  const nodes = a.nodes.filter(x => x.series.length > 1)
  if (nodes.length === 0) return null
  const globalMax = Math.max(1, ...nodes.flatMap(x => x.series))

  const spark = (node: KpmNode) => {
    const W = 100, H = 26
    const pts = node.series
    const step = pts.length > 1 ? W / (pts.length - 1) : W
    const y = (v: number) => H - (Math.max(0, v) / globalMax) * (H - 2) - 1
    const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
    const area = `${line} L${W},${H} L0,${H} Z`
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-full" preserveAspectRatio="none" aria-hidden="true">
        <path d={area} fill="#D3002D" opacity="0.12" />
        <path d={line} fill="none" stroke="#D3002D" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      </svg>
    )
  }

  return (
    <section className="lg-card lg-rise mb-4">
      <header className="border-b border-ink-200 px-3 py-2.5">
        <h3 className="text-[13px] font-bold text-ink-950"
            style={{ letterSpacing: '-0.005em' }}>
          Requests per hour, node by node
        </h3>
        <p className="mt-0.5 text-[10.5px] text-ink-400">
          All charts share one vertical scale, so height is comparable across nodes.
          A flat line at the bottom means a node taking no load.
        </p>
      </header>
      <div className="grid grid-cols-2 gap-px bg-ink-100 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {a.nodes.map(node => (
          <div key={node.server} className="bg-paper p-2">
            <p className="truncate font-mono text-[10px] text-ink-700" title={node.server}>
              {node.server}
            </p>
            <p className="mt-0.5 flex items-baseline justify-between text-[9.5px] text-ink-400">
              <span>{node.role}</span>
              <span className="font-mono">{n(node.requestsAvg)}/hr</span>
            </p>
            <div className="mt-1">{spark(node)}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function buildKpmPanels(a: KpmAnalysis): PanelData[] {
  const maxReq = Math.max(1, ...a.nodes.map(x => x.requestsAvg))
  const maxLoad = Math.max(1, ...a.nodes.map(x => x.loadMax))
  const maxLat = Math.max(0.001, ...a.nodes.map(x => x.latencyAvg))
  const maxNoise = Math.max(1, ...a.nodes.map(x => x.noiseTotal))
  const maxSiteReq = Math.max(1, ...a.sites.map(s => s.requestsAvg))

  const nodeLoad: PanelData = {
    title: 'RADIUS load by node',
    note: 'Mean and peak requests per hour, and what share of the deployment each node carried.',
    columns: [
      { head: 'ISE node', align: 'left' },
      { head: 'Role', align: 'right', width: 'w-12' },
      { head: 'Req/hr avg', align: 'right', width: 'w-20' },
      { head: 'Req/hr peak', align: 'right', width: 'w-20' },
      { head: 'Share', align: 'right', width: 'w-12' },
    ],
    rows: a.nodes.map(x => ({
      id: x.server,
      bar: x.requestsAvg / maxReq,
      cells: [x.server, x.role, n(x.requestsAvg), n(x.requestsMax), pc(x.share)],
      sort: [x.server, x.role, x.requestsAvg, x.requestsMax, x.share],
    })),
  }

  const throughput: PanelData = {
    title: 'Throughput by node',
    note: 'TPS is the report’s own RADIUS_REQUESTS_HR divided by 3600 — RADIUS transactions on the wire, not completed authentications. One EAP-TLS authentication is many request packets plus accounting.',
    columns: [
      { head: 'ISE node', align: 'left' },
      { head: 'TPS avg', align: 'right', width: 'w-16' },
      { head: 'TPS peak', align: 'right', width: 'w-16' },
      { head: 'Samples', align: 'right', width: 'w-14' },
    ],
    rows: a.nodes.map(x => ({
      id: x.server,
      bar: x.tpsAvg / Math.max(0.01, ...a.nodes.map(y => y.tpsAvg)),
      cells: [x.server, x.tpsAvg.toFixed(2), x.tpsMax.toFixed(2), n(x.samples)],
      sort: [x.server, x.tpsAvg, x.tpsMax, x.samples],
    })),
  }

  const latency: PanelData = {
    title: 'Processing latency by node',
    note: 'Mean and worst latency per request. High latency on a lightly loaded node usually means the identity store, not the node.',
    columns: [
      { head: 'ISE node', align: 'left' },
      { head: 'Mean', align: 'right', width: 'w-16' },
      { head: 'Worst', align: 'right', width: 'w-16' },
      { head: 'Req/hr', align: 'right', width: 'w-16' },
    ],
    rows: [...a.nodes].sort((x, y) => y.latencyAvg - x.latencyAvg).map(x => ({
      id: x.server,
      bar: x.latencyAvg / maxLat,
      cells: [x.server, ms(x.latencyAvg), ms(x.latencyMax), n(x.requestsAvg)],
      sort: [x.server, x.latencyAvg, x.latencyMax, x.requestsAvg],
    })),
  }

  const load: PanelData = {
    title: 'System load by node',
    note: 'Average and peak load reported by each node across the window.',
    columns: [
      { head: 'ISE node', align: 'left' },
      { head: 'Role', align: 'right', width: 'w-12' },
      { head: 'Load avg', align: 'right', width: 'w-16' },
      { head: 'Load peak', align: 'right', width: 'w-18' },
    ],
    rows: [...a.nodes].sort((x, y) => y.loadMax - x.loadMax).map(x => ({
      id: x.server,
      bar: x.loadMax / maxLoad,
      cells: [x.server, x.role, x.loadAvg.toFixed(1), x.loadMax.toFixed(1)],
      sort: [x.server, x.role, x.loadAvg, x.loadMax],
    })),
  }

  const suppression: PanelData = {
    title: 'Noise and log suppression',
    note: 'Repeated authentications ISE chose not to write to MnT. High suppression points at endpoints re-authenticating too often.',
    columns: [
      { head: 'ISE node', align: 'left' },
      { head: 'Noise', align: 'right', width: 'w-20' },
      { head: 'Suppressed', align: 'right', width: 'w-20' },
      { head: 'To MnT', align: 'right', width: 'w-20' },
    ],
    rows: [...a.nodes].sort((x, y) => y.suppressionAvg - x.suppressionAvg).map(x => ({
      id: x.server,
      bar: x.noiseTotal / maxNoise,
      cells: [
        x.server,
        n(x.noiseTotal),
        <span key="s" className={
          x.suppressionAvg >= 60 ? 'text-signal-500 font-bold'
            : x.suppressionAvg >= 25 ? 'text-[#B45309] font-bold' : 'text-ink-400'
        }>{x.suppressionAvg.toFixed(1)}%</span>,
        n(x.mntTotal),
      ],
      sort: [x.server, x.noiseTotal, x.suppressionAvg, x.mntTotal],
    })),
  }

  const sites: PanelData = {
    title: 'Load by site',
    note: 'Nodes grouped by the first two segments of their name. A naming convention, so treat the grouping as a convenience.',
    columns: [
      { head: 'Site', align: 'left' },
      { head: 'Nodes', align: 'right', width: 'w-14' },
      { head: 'Serving', align: 'right', width: 'w-14' },
      { head: 'Req/hr', align: 'right', width: 'w-20' },
      { head: 'Share', align: 'right', width: 'w-12' },
    ],
    rows: a.sites.map(s => ({
      id: s.site,
      bar: s.requestsAvg / maxSiteReq,
      cells: [s.site, n(s.nodes), n(s.serving), n(s.requestsAvg), pc(s.share)],
      sort: [s.site, s.nodes, s.serving, s.requestsAvg, s.share],
    })),
  }

  const samples: PanelData = {
    title: 'Sample timeline',
    note: 'Every collection point, summed across all nodes. These are deployment totals — no single node carries this rate.',
    columns: [
      { head: 'Sampled at', align: 'left' },
      { head: 'Req/hr all', align: 'right', width: 'w-20' },
      { head: 'TPS all', align: 'right', width: 'w-16' },
      { head: 'Load mean', align: 'right', width: 'w-16' },
      { head: 'To MnT', align: 'right', width: 'w-20' },
    ],
    rows: a.timeline.map(p => ({
      id: String(p.ts),
      bar: p.requests / Math.max(1, ...a.timeline.map(q => q.requests)),
      cells: [clock(p.ts), n(p.requests), p.tps.toFixed(1), p.loadAvg.toFixed(1), n(p.mnt)],
      sort: [p.ts, p.requests, p.tps, p.loadAvg, p.mnt],
    })),
  }

  return [nodeLoad, load, latency, suppression, throughput, sites, samples]
}

export default function KpmSection({ a, onExpand }: {
  a: KpmAnalysis
  onExpand: (d: PanelData) => void
}) {
  const panels = buildKpmPanels(a)
  const psns = a.nodes.filter(x => x.role === 'PSN').length

  return (
    <>
      <SectionBanner
        title="Key Performance Metrics"
        subtitle={
          `${n(a.rows)} samples · ${a.nodes.length} nodes · every ${duration(a.intervalMs)} ` +
          `from ${clock(a.windowStart)} to ${clock(a.windowEnd)} · ${duration(a.windowMs)} covered`
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        <Kpi label="Nodes" value={n(a.nodes.length)} sub={`${psns} policy nodes`} />
        <Kpi label="Serving RADIUS" value={n(a.serving.length)}
             sub={`${a.nodes.length - a.serving.length} idle`} />
        <Kpi label="Requests per hour" value={n(a.totals.requestsPerHourAvg)}
             sub="all nodes, mean" />
        <Kpi label="Busiest node peak" value={a.totals.tpsPeakNode.toFixed(1) + ' tps'}
             sub={a.totals.tpsPeakNodeName || 'highest single node'} />
        <Kpi label="All nodes combined" value={a.totals.tpsPeakDeployment.toFixed(0) + ' tps'}
             sub={`sum across ${a.serving.length} serving nodes`} />
        <Kpi label="Peak load" value={a.totals.loadPeak.toFixed(1)}
             tone={a.totals.loadPeak >= 80 ? 'red' : 'ink'} sub="highest on any node" />
        <Kpi label="Worst latency" value={ms(a.totals.latencyWorst)}
             tone={a.totals.latencyWorst > 5 ? 'red' : 'ink'} sub="per request" />
        <Kpi label="Logged to MnT" value={n(a.totals.mntTotal)} sub="over the window" />
        <Kpi label="Suppressed noise" value={n(a.totals.noiseTotal)} sub="repeat authentications" />
        <Kpi label="Mean suppression" value={a.totals.suppressionAvg.toFixed(1) + '%'}
             tone={a.totals.suppressionAvg >= 25 ? 'red' : 'ink'} sub="across serving nodes" />
        <Kpi label="Load spread" value={a.imbalanceRatio.toFixed(1) + '×'}
             sub="busiest vs median node" />
      </div>

      <KpmTimeline a={a} />

      <section className="lg-card lg-rise mb-4 p-3">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-bold text-ink-950"
              style={{ letterSpacing: '-0.005em' }}>
            Node health findings
          </h3>
          <p className="text-[10.5px] text-ink-400">
            Compared against the median of the nodes actually handling load, not against
            fixed thresholds.
          </p>
        </div>
        {a.findings.length === 0 ? (
          <p className="lg-card p-3 text-[11.5px] text-ink-500">
            Nothing stands out. Load, latency and suppression are consistent across the
            nodes handling RADIUS.
          </p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {a.findings.map((f, i) => <FindingCard key={i} f={f} />)}
          </div>
        )}
      </section>

      <Sparklines a={a} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {panels.map(p => <Panel key={p.title} data={p} onExpand={onExpand} />)}
      </div>
    </>
  )
}
