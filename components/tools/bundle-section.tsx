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

import type { BundleReport, KeyCount } from '@/lib/tools/bundle-types'

export { isBundleReport } from '@/lib/tools/bundle-types'
export type { BundleReport } from '@/lib/tools/bundle-types'

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

  // ---------- every log family ----------
  const logPanels: PanelData[] = []
  if (r.logs?.length) {
    const maxLines = Math.max(1, ...r.logs.map(l => l.lines))
    logPanels.push({
      title: 'Every log read',
      note: 'One row per log family — all rotations of a file counted together. Errors and warnings come from the severity in each line.',
      columns: [
        { head: 'Log', align: 'left' },
        { head: 'Files', align: 'right', width: 'w-12' },
        { head: 'Lines', align: 'right', width: 'w-20' },
        { head: 'Errors', align: 'right', width: 'w-16' },
        { head: 'Warnings', align: 'right', width: 'w-18' },
      ],
      rows: r.logs.map(l => ({
        id: l.label,
        bar: l.lines / maxLines,
        barFail: l.lines ? Math.min(1, (l.errors + l.warnings) / l.lines) : 0,
        cells: [
          <span key="l">
            <span className="text-ink-900">{l.label}</span>
            {l.areas.length > 0 && (
              <span className="ml-2 text-ink-400">{l.areas.slice(0, 3).join(' · ')}</span>
            )}
          </span>,
          n(l.rotations), n(l.lines),
          <span key="e" className={l.errors > 0 ? 'text-signal-500 font-bold' : 'text-ink-400'}>
            {l.errors ? n(l.errors) : '—'}
          </span>,
          <span key="w" className={l.warnings > 1000 ? 'text-[#B45309] font-bold' : 'text-ink-400'}>
            {l.warnings ? n(l.warnings) : '—'}
          </span>,
        ],
        sort: [l.label, l.rotations, l.lines, l.errors, l.warnings],
      })),
    })

    // per-log component and problem breakdowns, biggest first
    for (const l of r.logs.slice(0, 10)) {
      if (l.byComponent.length > 1) {
        logPanels.push(kcPanel(
          `${l.label} — components`,
          'Logger names, grouped to four segments. This is what the debug attributes in Cisco’s troubleshooting table map onto.',
          'Component', l.byComponent, 'Lines'))
      }
      if (l.problems.length) {
        logPanels.push(kcPanel(
          `${l.label} — warnings and errors`,
          'Repeated messages grouped, with MAC addresses, IPs and numbers collapsed.',
          'Message', l.problems, 'Lines'))
      }
    }
  }

  // ---------- problem areas ----------
  const areaPanels: PanelData[] = []
  if (r.areas?.length) {
    const maxA = Math.max(1, ...r.areas.map(a => a.errors + a.warnings))
    areaPanels.push({
      title: 'Troubleshooting areas',
      note: 'Grouped the way Cisco groups debug attributes. Only areas whose logs are present in this bundle appear.',
      columns: [
        { head: 'Area', align: 'left' },
        { head: 'Logs', align: 'right', width: 'w-12' },
        { head: 'Lines', align: 'right', width: 'w-20' },
        { head: 'Errors', align: 'right', width: 'w-16' },
        { head: 'Warnings', align: 'right', width: 'w-18' },
      ],
      rows: r.areas.map(a => ({
        id: a.area,
        bar: (a.errors + a.warnings) / maxA,
        barFail: 1,
        cells: [
          <span key="a">
            <span className="text-ink-900">{a.area}</span>
            <span className="ml-2 text-ink-400">{a.present.join(', ')}</span>
            {a.missing.length > 0 && (
              <span className="ml-2 text-ink-300">missing: {a.missing.join(', ')}</span>
            )}
          </span>,
          n(a.present.length), n(a.lines),
          <span key="e" className={a.errors > 0 ? 'text-signal-500 font-bold' : 'text-ink-400'}>
            {a.errors ? n(a.errors) : '—'}
          </span>,
          <span key="w" className={a.warnings > 1000 ? 'text-[#B45309] font-bold' : 'text-ink-400'}>
            {a.warnings ? n(a.warnings) : '—'}
          </span>,
        ],
        sort: [a.area, a.present.length, a.lines, a.errors, a.warnings],
      })),
    })

    for (const a of r.areas.slice(0, 8)) {
      if (!a.topProblems.length) continue
      areaPanels.push(kcPanel(
        a.area, `From ${a.present.join(', ')}.`, 'Message', a.topProblems, 'Lines'))
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
        {r.stats && (
          <Kpi label="Files parsed" value={n(r.stats.filesParsed)}
               sub={`of ${n(r.stats.archiveEntries)} in the archive`} />
        )}
        {r.stats && (
          <Kpi label="Lines read" value={n(r.stats.linesParsed)}
               sub={`${(r.stats.bytesParsed / 1048576).toFixed(0)} MB in ${r.stats.seconds}s`} />
        )}
        {r.logs && <Kpi label="Log families" value={n(r.logs.length)}
               sub={`${n(r.logs.reduce((a, l) => a + l.rotations, 0))} files with rotations`} />}
        {r.areas && <Kpi label="Areas covered" value={n(r.areas.length)} sub="with logs present" />}
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

      {/* ---------- problem areas ---------- */}
      {areaPanels.length > 0 && (
        <>
          <SectionBanner title="By troubleshooting area"
            subtitle={`${r.areas?.length ?? 0} areas have logs in this bundle · ranked by error and warning volume`} />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {areaPanels.map(p => <Panel key={p.title} data={p} onExpand={onExpand} />)}
          </div>
        </>
      )}

      {/* ---------- logs ---------- */}
      {logPanels.length > 0 && (
        <>
          <SectionBanner title="Logs"
            subtitle={
              `${r.logs?.length ?? 0} log families · ` +
              `${n(r.logs?.reduce((a, l) => a + l.rotations, 0) ?? 0)} files including rotations · ` +
              `${n(r.logs?.reduce((a, l) => a + l.lines, 0) ?? 0)} lines`
            } />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {logPanels.map(p => <Panel key={p.title} data={p} onExpand={onExpand} />)}
          </div>
        </>
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
