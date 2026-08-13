'use client'

// ============================================================
// components/tools/sessions-section.tsx
//
// Dashboard for the Cisco ISE "Current Active Sessions" export.
//
// This one is a snapshot rather than a history, so there is no
// pass or fail rate to report. The useful questions are about
// distribution — which node holds the sessions, what they
// authenticated with, what profile they matched — and about
// staleness, which is where the duplicate and idle checks come in.
// ============================================================

import {
  Panel, Kpi, SectionBanner, n, pc, duration,
  type PanelData,
} from './panel'
import {
  SESSION_DIM_LABELS,
  type SessionsAnalysis, type KeyCount,
} from '@/lib/tools/sessions'

const SEV: Record<string, { border: string; label: string; tone: string }> = {
  high:   { border: 'border-l-signal-500', label: 'High',   tone: 'text-signal-500' },
  medium: { border: 'border-l-[#B45309]',  label: 'Medium', tone: 'text-[#B45309]' },
  info:   { border: 'border-l-ink-300',    label: 'Note',   tone: 'text-ink-400' },
}

function Finding({ f }: { f: SessionsAnalysis['findings'][number] }) {
  const s = SEV[f.severity] ?? SEV.info
  return (
    <div className={`border border-ink-200 border-l-2 ${s.border} bg-paper p-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-bold leading-tight text-ink-950"
           style={{ letterSpacing: '-0.005em' }}>
          {f.headline}
        </p>
        <span className={`text-[9.5px] font-bold uppercase tracking-[0.09em] ${s.tone}`}>{s.label}</span>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-600">{f.detail}</p>
    </div>
  )
}

const bytes = (v: number) => {
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)} TB`
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)} GB`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} MB`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} KB`
  return `${Math.round(v)} B`
}

const kcPanel = (
  title: string, note: string, head: string, rows: KeyCount[], total: number,
  countHead = 'Sessions',
): PanelData => {
  const max = Math.max(1, ...rows.map(r => r.count))
  return {
    title, note,
    columns: [
      { head, align: 'left' },
      { head: countHead, align: 'right', width: 'w-20' },
      { head: 'Share', align: 'right', width: 'w-12' },
    ],
    rows: rows.map(r => ({
      id: r.key,
      bar: r.count / max,
      cells: [r.key, n(r.count), pc(total ? r.count / total : 0)],
      sort: [r.key, r.count, total ? r.count / total : 0],
    })),
    empty: 'Not populated in this export.',
  }
}

export default function SessionsSection({ a, onExpand }: {
  a: SessionsAnalysis
  onExpand: (d: PanelData) => void
}) {
  const panels: PanelData[] = []

  // ---------- per node, the headline breakdown ----------
  if (a.byNode.length) {
    const maxN = Math.max(1, ...a.byNode.map(x => x.sessions))
    panels.push({
      title: 'Active sessions per ISE node',
      note: 'How the live session load is distributed. Endpoints counts distinct MACs, so a gap between the two columns means some endpoints hold more than one session.',
      columns: [
        { head: 'ISE node', align: 'left' },
        { head: 'Sessions', align: 'right', width: 'w-20' },
        { head: 'Endpoints', align: 'right', width: 'w-20' },
        { head: 'Share', align: 'right', width: 'w-12' },
      ],
      rows: a.byNode.map(nd => ({
        id: nd.node,
        bar: nd.sessions / maxN,
        cells: [nd.node, n(nd.sessions), n(nd.endpoints), pc(nd.share)],
        sort: [nd.node, nd.sessions, nd.endpoints, nd.share],
      })),
    })
  }

  const dim = (key: string, title: string, note = '') => {
    const rows = a.dims[key]
    if (rows?.length) {
      panels.push(kcPanel(title, note, SESSION_DIM_LABELS[key] ?? key, rows, a.rows))
    }
  }

  dim('sessionStatus', 'Session status')
  dim('authProtocol', 'Authentication protocol')
  dim('authMethod', 'Authentication method')
  dim('authorizationProfiles', 'Authorization profiles', 'What access these sessions were granted.')
  dim('authorizationPolicy', 'Authorization policy', 'Which rule matched.')
  dim('authenticationPolicy', 'Authentication policy')
  dim('endpointProfile', 'Endpoint profiles', 'Unknown means profiling probes have not identified the device.')
  dim('postureStatus', 'Posture status')
  dim('licenseType', 'Licence consumption', 'Which licence each live session is consuming.')
  dim('nasIp', 'NAD IP addresses', 'The network device holding each session.')
  dim('securityGroup', 'Security groups', 'TrustSec SGT assigned to the session.')
  dim('userType', 'User type')
  dim('sessionSource', 'Session source')
  dim('provider', 'Provider')
  dim('virtualNetwork', 'Virtual network')
  dim('userDomain', 'User domain')
  dim('wlcRoam', 'WLC roam')
  dim('identity', 'Identities', 'Most sessions per identity — several from one identity is normal for a user with multiple devices.')
  dim('endpointId', 'Endpoints', 'Most sessions per endpoint. More than one is worth a look.')

  // ---------- session age ----------
  if (a.sessionAge.buckets.length) {
    const order = ['just started', 'under 5 min', '5-60 min', '1-4 hours',
                   '4-24 hours', '1-7 days', 'over 7 days']
    const sorted = [...a.sessionAge.buckets]
      .sort((x, y) => order.indexOf(x.key) - order.indexOf(y.key))
    const max = Math.max(1, ...sorted.map(b => b.count))
    panels.push({
      title: 'How long sessions have been up',
      note: 'Very old sessions on a wireless estate are often stale entries that were never aged out.',
      columns: [
        { head: 'Age', align: 'left' },
        { head: 'Sessions', align: 'right', width: 'w-20' },
        { head: 'Share', align: 'right', width: 'w-12' },
      ],
      rows: sorted.map((b, i) => ({
        id: b.key,
        bar: b.count / max,
        cells: [b.key, n(b.count), pc(a.rows ? b.count / a.rows : 0)],
        sort: [i, b.count, b.count],
      })),
    })
  }

  // ---------- top talkers ----------
  if (a.traffic.topTalkers.length) {
    const max = Math.max(1, ...a.traffic.topTalkers.map(t => t.bytes))
    panels.push({
      title: 'Busiest sessions',
      note: 'Total bytes in plus out, from RADIUS accounting.',
      columns: [
        { head: 'Identity or endpoint', align: 'left' },
        { head: 'Traffic', align: 'right', width: 'w-24' },
      ],
      rows: a.traffic.topTalkers.map(t => ({
        id: t.key,
        bar: t.bytes / max,
        cells: [t.key, bytes(t.bytes)],
        sort: [t.key, t.bytes],
      })),
    })
  }

  // ---------- duplicates ----------
  if (a.duplicates.length) {
    panels.push({
      title: 'Endpoints on more than one node',
      note: 'An endpoint should hold one live session. Two usually means one is stale and was never aged out.',
      columns: [
        { head: 'Endpoint', align: 'left' },
        { head: 'Nodes', align: 'right', width: 'w-64' },
      ],
      rows: a.duplicates.map(d => ({
        id: d.key,
        cells: [d.key, <span key="nd" className="text-signal-500">{d.nodes.join(', ')}</span>],
        sort: [d.key, d.nodes.join(', ')],
      })),
    })
  }

  const ipTotal = a.ipFamilies.v4Only + a.ipFamilies.dual + a.ipFamilies.none

  return (
    <>
      <SectionBanner
        title="Current Active Sessions"
        subtitle={
          `${n(a.rows)} live sessions · ${a.byNode.length} node${a.byNode.length === 1 ? '' : 's'} · ` +
          `${n(a.distinct.endpointId ?? 0)} distinct endpoints · snapshot from ${a.files.join(', ')}`
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        <Kpi label="Active sessions" value={n(a.rows)} />
        <Kpi label="ISE nodes" value={n(a.byNode.length)}
             sub={a.byNode[0] ? `busiest ${pc(a.byNode[0].share)}` : undefined} />
        <Kpi label="Distinct endpoints" value={n(a.distinct.endpointId ?? 0)} />
        <Kpi label="Distinct identities" value={n(a.distinct.identity ?? 0)} />
        <Kpi label="Median session age" value={duration(a.sessionAge.median * 1000)} />
        <Kpi label="Longest session" value={duration(a.sessionAge.longest * 1000)} />
        <Kpi label="Traffic in" value={bytes(a.traffic.bytesIn)} />
        <Kpi label="Traffic out" value={bytes(a.traffic.bytesOut)} />
        <Kpi label="No traffic counters" value={n(a.traffic.idleSessions)}
             sub={a.rows ? pc(a.traffic.idleSessions / a.rows) : undefined} />
        <Kpi label="Dual-stack" value={n(a.ipFamilies.dual)}
             sub={ipTotal ? `${pc(a.ipFamilies.dual / ipTotal)} have IPv6` : undefined} />
        <Kpi label="On two nodes" value={n(a.duplicates.length)}
             tone={a.duplicates.length ? 'red' : 'ink'} sub="possible stale sessions" />
        <Kpi label="Endpoint profiles" value={n(a.distinct.endpointProfile ?? 0)} />
      </div>

      {a.findings.length > 0 && (
        <section className="lg-card lg-rise mb-4 p-3">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-bold text-ink-950"
                style={{ letterSpacing: '-0.005em' }}>
              What stands out
            </h3>
            <p className="text-[10.5px] text-ink-400">
              A snapshot has no failure rate, so these are about distribution and staleness.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {a.findings.map((f, i) => <Finding key={i} f={f} />)}
          </div>
        </section>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {panels.map(p => <Panel key={p.title} data={p} onExpand={onExpand} />)}
      </div>
    </>
  )
}
