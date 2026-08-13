'use client'

// ============================================================
// components/tools/bundle-section.tsx
//
// Renders the JSON report produced by ise-bundle-analyse.mjs.
//
// The heavy lifting happened on the machine that holds the
// bundle; this only draws counts and top-N lists. Everything is
// optional — a bundle missing show-tech, or an ISE version whose
// show-tech we parse badly, should render the sections we did
// get rather than failing.
// ============================================================

import {
  Panel, Kpi, SectionBanner, n, pc, ms,
  type PanelData,
} from './panel'

// ------------------------------------------------------------
// the shape written by the analyser
// ------------------------------------------------------------
interface KeyCount { key: string; count: number }

export interface BundleReport {
  kind: 'ise-bundle-report'
  version: number
  generated: string
  node: string | null
  source: string
  system: {
    hostname: string | null
    adeOs: string | null
    adeBuild: string | null
    architecture: string | null
    iseVersion: string | null
    buildDate: string | null
    installDate: string | null
    patches: { version: string; installDate: string | null }[]
    services: { name: string; state: string; detail: string | null }[]
    sections: string[]
    diskAlerts: string[]
  } | null
  runtime: {
    file: string
    lines: number
    parsed: number
    window: { start: string | null; end: string | null }
    byComponentLevel: { component: string; level: string; count: number }[]
    patterns: {
      id: string; title: string; meaning: string; severity: string
      count: number; share: number; firstSeen: string | null; lastSeen: string | null
    }[]
    noiseSuppressed: number
    signalLines: number
    unmatched: KeyCount[]
    abandonedBy: KeyCount[]
    slowStepBy: KeyCount[]
    perDay: KeyCount[]
  } | null
  auth: {
    files: string[]
    records: number; passed: number; failed: number; failRate: number
    window: { start: string | null; end: string | null }
    messageCodes: KeyCount[]
    failureCodes: KeyCount[]
    dims: Record<string, KeyCount[]>
    failDims: Record<string, KeyCount[]>
    latency: {
      total: { count: number; mean: number; p50: number; p90: number; p95: number; p99: number; max: number }
      totalHistogram: { from: number; to: number | null; count: number }[]
      client: { mean: number; p50: number; p95: number; max: number }
      request: { mean: number; p50: number; p95: number; max: number }
    }
    stepLatency: { step: number; totalMs: number; samples: number; avgMs: number }[]
    certExpiry: { buckets: KeyCount[]; soonest: { days: number; subject: string } | null }
    timeline: { t: string; total: number; fail: number }[]
    utilisationSamples: number
  } | null
  app: {
    file: string; lines: number
    window: { start: string | null; end: string | null }
    byLevel: KeyCount[]
    topProblems: KeyCount[]
    perDay: KeyCount[]
  } | null
  alarms: { file: string; lines: number; top: KeyCount[] } | null
  catalogue: Record<string, string>
  findings: { severity: string; headline: string; detail: string }[]
}

export function isBundleReport(v: unknown): v is BundleReport {
  return Boolean(v) && typeof v === 'object' &&
    (v as { kind?: string }).kind === 'ise-bundle-report'
}

// ------------------------------------------------------------
// pieces
// ------------------------------------------------------------

const SEV: Record<string, { border: string; label: string; tone: string }> = {
  high:   { border: 'border-l-signal-500', label: 'High',   tone: 'text-signal-500' },
  medium: { border: 'border-l-[#B45309]',  label: 'Medium', tone: 'text-[#B45309]' },
  info:   { border: 'border-l-ink-300',    label: 'Note',   tone: 'text-ink-400' },
  low:    { border: 'border-l-ink-200',    label: 'Low',    tone: 'text-ink-400' },
  noise:  { border: 'border-l-ink-200',    label: 'Noise',  tone: 'text-ink-400' },
}

function Finding({ f }: { f: BundleReport['findings'][number] }) {
  const s = SEV[f.severity] ?? SEV.info
  return (
    <div className={`border border-ink-200 border-l-2 ${s.border} bg-paper p-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-bold leading-tight text-ink-950"
           style={{ fontFamily: 'var(--font-heading)' }}>
          {f.headline}
        </p>
        <span className={`text-[9.5px] font-bold uppercase tracking-[0.09em] ${s.tone}`}>{s.label}</span>
      </div>
      {f.detail && <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-600">{f.detail}</p>}
    </div>
  )
}

/** Volume per day, drawn as a simple bar strip. */
function DayStrip({ data, title, note }: { data: KeyCount[]; title: string; note: string }) {
  if (!data || data.length < 2) return null
  const max = Math.max(1, ...data.map(d => d.count))
  return (
    <section className="mb-4 border border-ink-200 bg-paper">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-200 px-3 py-2">
        <h3 className="text-[13px] font-bold text-ink-950"
            style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}>{title}</h3>
        <p className="text-[10.5px] text-ink-400">{note}</p>
      </header>
      <div className="flex items-end gap-1 px-3 py-3" style={{ height: 92 }}>
        {data.map(d => (
          <div key={d.key} className="group relative flex flex-1 flex-col items-center justify-end">
            <span className="w-full bg-ink-300 transition-colors group-hover:bg-signal-500"
                  style={{ height: `${Math.max((d.count / max) * 64, 2)}px` }} />
            <span className="mt-1 origin-top scale-90 whitespace-nowrap text-[9px] text-ink-400">
              {d.key.slice(5)}
            </span>
            <span className="pointer-events-none absolute -top-5 hidden whitespace-nowrap bg-ink-950 px-1.5 py-0.5 text-[9px] text-paper group-hover:block">
              {n(d.count)}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ------------------------------------------------------------
// panel builders
// ------------------------------------------------------------

const kcPanel = (
  title: string, note: string, head: string, rows: KeyCount[],
  countHead = 'Count', decorate?: (k: string) => React.ReactNode,
): PanelData => {
  const max = Math.max(1, ...rows.map(r => r.count))
  const total = rows.reduce((a, r) => a + r.count, 0)
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
      cells: [decorate ? decorate(r.key) : r.key, n(r.count), pc(total ? r.count / total : 0)],
      sort: [r.key, r.count, total ? r.count / total : 0],
    })),
  }
}

// ------------------------------------------------------------
// main
// ------------------------------------------------------------

export default function BundleSection({ r, onExpand }: {
  r: BundleReport
  onExpand: (d: PanelData) => void
}) {
  const { system, runtime, auth, app, alarms } = r

  const code = (c: string) => (
    <span>
      <span className="font-mono text-signal-500">{c}</span>
      {r.catalogue[c] && <span className="ml-2 text-ink-600">{r.catalogue[c]}</span>}
    </span>
  )

  // ---------- system ----------
  const systemPanels: PanelData[] = []
  if (system) {
    if (system.services.length) {
      systemPanels.push({
        title: 'Services',
        note: 'As reported by show-tech at the moment the bundle was taken.',
        columns: [
          { head: 'Service', align: 'left' },
          { head: 'State', align: 'right', width: 'w-20' },
          { head: 'Detail', align: 'right', width: 'w-24' },
        ],
        rows: system.services.map(s => ({
          id: s.name,
          cells: [
            s.name,
            <span key="s" className={
              s.state === 'running' ? 'text-[#0F7B4F] font-bold'
                : s.state === 'disabled' ? 'text-ink-400'
                : 'text-signal-500 font-bold'
            }>{s.state}</span>,
            s.detail ?? '—',
          ],
          sort: [s.name, s.state, s.detail ?? ''],
        })),
      })
    }
    if (system.patches.length) {
      systemPanels.push({
        title: 'Patch history',
        note: 'Every patch installed on this node, oldest first.',
        columns: [
          { head: 'Patch', align: 'left' },
          { head: 'Installed', align: 'right', width: 'w-44' },
        ],
        rows: system.patches.map(p => ({
          id: p.version,
          cells: [`Patch ${p.version}`, p.installDate ?? '—'],
          sort: [Number(p.version) || 0, p.installDate ?? ''],
        })),
      })
    }
    if (system.sections.length) {
      systemPanels.push({
        title: 'Show-tech sections',
        note: 'What the show-tech output covers, for anything not summarised above.',
        columns: [{ head: 'Section', align: 'left' }],
        rows: system.sections.map(s => ({ id: s, cells: [s], sort: [s] })),
      })
    }
  }

  // ---------- runtime ----------
  const runtimePanels: PanelData[] = []
  if (runtime) {
    runtimePanels.push({
      title: 'What prrt-server.log is actually saying',
      note: 'Recognised conditions rather than raw error counts, with what each one means.',
      columns: [
        { head: 'Condition', align: 'left' },
        { head: 'Count', align: 'right', width: 'w-20' },
        { head: 'Share', align: 'right', width: 'w-12' },
        { head: 'Severity', align: 'right', width: 'w-16' },
      ],
      rows: runtime.patterns.map(p => ({
        id: p.id,
        bar: p.share,
        barFail: p.severity === 'high' ? 1 : 0,
        cells: [
          <span key="t">
            <span className="text-ink-900">{p.title}</span>
            <span className="ml-2 text-ink-400">{p.meaning}</span>
          </span>,
          n(p.count), pc(p.share),
          <span key="s" className={SEV[p.severity]?.tone ?? 'text-ink-400'}>
            {SEV[p.severity]?.label ?? p.severity}
          </span>,
        ],
        sort: [p.title, p.count, p.share, p.severity],
      })),
    })

    runtimePanels.push({
      title: 'By component and level',
      note: 'Which subsystem is producing the volume.',
      columns: [
        { head: 'Component', align: 'left' },
        { head: 'Level', align: 'right', width: 'w-16' },
        { head: 'Lines', align: 'right', width: 'w-20' },
      ],
      rows: runtime.byComponentLevel.map(b => ({
        id: b.component + b.level,
        bar: b.count / Math.max(1, ...runtime.byComponentLevel.map(x => x.count)),
        cells: [b.component, b.level, n(b.count)],
        sort: [b.component, b.level, b.count],
      })),
    })

    if (runtime.abandonedBy.length) {
      runtimePanels.push(kcPanel(
        'Endpoints abandoning EAP', 'Restarting EAP before finishing. A few is roaming; many from one MAC is a broken supplicant.',
        'Endpoint MAC', runtime.abandonedBy, 'Times'))
    }
    if (runtime.slowStepBy.length) {
      runtimePanels.push(kcPanel(
        'Endpoints with slow policy steps', 'ISE flagged these itself as unusually slow.',
        'Endpoint MAC', runtime.slowStepBy, 'Times'))
    }
    if (runtime.unmatched.length) {
      runtimePanels.push(kcPanel(
        'Other messages', 'Everything not matched by a named rule, with numbers collapsed so similar lines group.',
        'Message', runtime.unmatched, 'Lines'))
    }
  }

  // ---------- authentications ----------
  const authPanels: PanelData[] = []
  if (auth) {
    const D = auth.dims
    const dimPanel = (key: string, title: string, head: string, note = '') =>
      D[key]?.length ? authPanels.push(kcPanel(title, note, head, D[key], 'Auths')) : null

    authPanels.push(kcPanel(
      'Message codes', 'Every code seen, resolved through the catalogue shipped inside this bundle.',
      'Code', auth.messageCodes, 'Records', code))

    if (auth.failureCodes.length) {
      authPanels.push(kcPanel(
        'Failure codes', 'Only the codes that represent a failed or abandoned authentication.',
        'Code', auth.failureCodes, 'Records', code))
    }

    dimPanel('ssid', 'SSID', 'SSID', 'From cisco-wlan-ssid — the field the CSV export does not carry.')
    dimPanel('nad', 'Network devices', 'Network device')
    dimPanel('nasIp', 'NAD IP addresses', 'NAS IP address')
    dimPanel('policySet', 'Policy sets', 'Policy set')
    dimPanel('authzRule', 'Authorization rules', 'Authorization rule')
    dimPanel('authzProfile', 'Authorization profiles', 'Authorization profile')
    dimPanel('protocol', 'Authentication protocols', 'Protocol')
    dimPanel('identityStore', 'Identity stores', 'Identity store')
    dimPanel('issuer', 'Certificate issuers', 'Issuer CN', 'Which CA signed the certificates being presented.')
    dimPanel('tlsVersion', 'TLS versions', 'TLS version')
    dimPanel('tlsCipher', 'TLS ciphers', 'Cipher suite')
    dimPanel('flowType', 'RADIUS flow types', 'Flow type')
    dimPanel('deviceType', 'Device types', 'Device type')
    dimPanel('location', 'Locations', 'Location')
    dimPanel('endpointProfile', 'Endpoint profiles', 'Profile')
    dimPanel('endpoint', 'Busiest endpoints', 'Endpoint MAC')
    dimPanel('user', 'Busiest identities', 'User name')

    if (auth.failDims?.endpoint?.length) {
      authPanels.push(kcPanel('Endpoints failing most', 'Only failed authentications.', 'Endpoint MAC', auth.failDims.endpoint, 'Failures'))
    }
    if (auth.failDims?.nad?.length) {
      authPanels.push(kcPanel('Devices failing most', 'Only failed authentications.', 'Network device', auth.failDims.nad, 'Failures'))
    }

    if (auth.stepLatency.length) {
      const maxMs = Math.max(1, ...auth.stepLatency.map(s => s.totalMs))
      authPanels.push({
        title: 'Where the time goes',
        note: 'Policy step timing aggregated across every authentication — which step consumes the most, not just the total.',
        columns: [
          { head: 'Step index', align: 'left' },
          { head: 'Total ms', align: 'right', width: 'w-20' },
          { head: 'Mean', align: 'right', width: 'w-16' },
          { head: 'Samples', align: 'right', width: 'w-16' },
        ],
        rows: auth.stepLatency.map(s => ({
          id: String(s.step),
          bar: s.totalMs / maxMs,
          cells: [`Step ${s.step}`, n(s.totalMs), ms(s.avgMs), n(s.samples)],
          sort: [s.step, s.totalMs, s.avgMs, s.samples],
        })),
      })
    }

    if (auth.certExpiry.buckets.length) {
      authPanels.push(kcPanel(
        'Client certificate expiry',
        auth.certExpiry.soonest
          ? `Soonest expiry seen is ${auth.certExpiry.soonest.days} days away.`
          : 'Days remaining on the certificates presented.',
        'Time remaining', auth.certExpiry.buckets, 'Auths'))
    }

    const hist = auth.latency.totalHistogram
    if (hist?.length) {
      const maxH = Math.max(1, ...hist.map(h => h.count))
      const totalH = hist.reduce((a, h) => a + h.count, 0)
      authPanels.push({
        title: 'Authentication latency distribution',
        note: 'Total time from first RADIUS packet to result.',
        columns: [
          { head: 'Latency', align: 'left' },
          { head: 'Auths', align: 'right', width: 'w-20' },
          { head: 'Share', align: 'right', width: 'w-12' },
        ],
        rows: hist.map(h => ({
          id: String(h.from),
          bar: h.count / maxH,
          cells: [h.to === null ? `${h.from}ms and above` : `${h.from} – ${h.to}ms`,
                  n(h.count), pc(totalH ? h.count / totalH : 0)],
          sort: [h.from, h.count, totalH ? h.count / totalH : 0],
        })),
      })
    }
  }

  // ---------- application ----------
  const appPanels: PanelData[] = []
  if (app) {
    appPanels.push(kcPanel('Log levels', 'Severity mix across ise-psc.log.', 'Level', app.byLevel, 'Lines'))
    if (app.topProblems.length) {
      appPanels.push(kcPanel(
        'Warnings and errors', 'Numbers collapsed so repeated messages group together.',
        'Message', app.topProblems, 'Lines'))
    }
  }
  if (alarms?.top?.length) {
    appPanels.push(kcPanel('Alarms', `From ${alarms.file}, ${n(alarms.lines)} entries.`, 'Alarm', alarms.top, 'Count'))
  }

  return (
    <>
      {/* ---------- header ---------- */}
      <SectionBanner
        title="ISE Support Bundle"
        subtitle={
          `${r.node ?? 'unknown node'}` +
          (system?.iseVersion ? ` · ISE ${system.iseVersion}` : '') +
          (system?.patches?.length ? ` patch ${system.patches[system.patches.length - 1].version}` : '') +
          ` · analysed ${new Date(r.generated).toISOString().slice(0, 16).replace('T', ' ')}`
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        {system?.iseVersion && <Kpi label="ISE version" value={system.iseVersion}
          sub={system.patches.length ? `patch ${system.patches[system.patches.length - 1].version}` : undefined} />}
        {system?.adeOs && <Kpi label="ADE-OS" value={system.adeOs} sub={system.architecture ?? undefined} />}
        {system && <Kpi label="Services running"
          value={n(system.services.filter(s => s.state === 'running').length)}
          sub={`${system.services.filter(s => s.state === 'disabled').length} disabled`} />}
        {runtime && <Kpi label="Runtime lines" value={n(runtime.lines)}
          sub={`${n(runtime.signalLines)} after noise removal`} />}
        {runtime && <Kpi label="Noise excluded" value={n(runtime.noiseSuppressed)}
          sub={runtime.lines ? pc(runtime.noiseSuppressed / runtime.lines, 0) + ' of the file' : undefined} />}
        {auth && <Kpi label="Authentications" value={n(auth.records)} sub={`${n(auth.passed)} passed`} />}
        {auth && <Kpi label="Failed" value={n(auth.failed)} tone={auth.failed ? 'red' : 'green'}
          sub={pc(auth.failRate, 2)} />}
        {auth && <Kpi label="Median latency" value={ms(auth.latency.total.p50)}
          sub={`p95 ${ms(auth.latency.total.p95)}`} />}
        {auth && <Kpi label="Worst latency" value={ms(auth.latency.total.max)}
          tone={auth.latency.total.max > 5000 ? 'red' : 'ink'} />}
        {app && <Kpi label="Application lines" value={n(app.lines)} />}
      </div>

      {/* ---------- findings ---------- */}
      {r.findings?.length > 0 && (
        <section className="mb-4 border border-ink-200 bg-paper-dim p-3">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-bold text-ink-950"
                style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}>
              What stands out
            </h3>
            <p className="text-[10.5px] text-ink-400">
              Highest severity first. Noise is reported as noise rather than counted as errors.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {r.findings.map((f, i) => <Finding key={i} f={f} />)}
          </div>
        </section>
      )}

      {/* ---------- system ---------- */}
      {systemPanels.length > 0 && (
        <>
          <SectionBanner title="System"
            subtitle={`${system?.hostname ?? ''} · installed ${system?.installDate ?? 'unknown'} · ${system?.services.length ?? 0} services reported`} />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {systemPanels.map(p => <Panel key={p.title} data={p} onExpand={onExpand} />)}
          </div>
        </>
      )}

      {/* ---------- runtime ---------- */}
      {runtime && (
        <>
          <SectionBanner title="Runtime health"
            subtitle={`${runtime.file} · ${n(runtime.lines)} lines · ${runtime.window.start ?? '?'} to ${runtime.window.end ?? '?'}`} />
          <DayStrip data={runtime.perDay} title="Runtime log volume by day"
            note="Includes noise — the shape matters more than the height." />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {runtimePanels.map(p => <Panel key={p.title} data={p} onExpand={onExpand} />)}
          </div>
        </>
      )}

      {/* ---------- authentications ---------- */}
      {auth && (
        <>
          <SectionBanner title="Authentications"
            subtitle={`${auth.files.length} local store file(s) · ${n(auth.records)} records · ${auth.window.start ?? '?'} to ${auth.window.end ?? '?'}`} />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {authPanels.map(p => <Panel key={p.title} data={p} onExpand={onExpand} />)}
          </div>
        </>
      )}

      {/* ---------- application ---------- */}
      {appPanels.length > 0 && (
        <>
          <SectionBanner title="Application and alarms"
            subtitle={app ? `${app.file} · ${n(app.lines)} lines · ${app.window.start ?? '?'} to ${app.window.end ?? '?'}` : 'alarms only'} />
          {app && <DayStrip data={app.perDay} title="Application log volume by day" note="ise-psc.log lines per day." />}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {appPanels.map(p => <Panel key={p.title} data={p} onExpand={onExpand} />)}
          </div>
        </>
      )}
    </>
  )
}
