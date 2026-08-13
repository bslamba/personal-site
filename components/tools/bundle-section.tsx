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
  Panel, Kpi, SectionBanner, n, pc, ms, clock, rateTone,
  type PanelData,
} from './panel'
import type { DimEntry, Correlation } from '@/lib/tools/bundle-types'

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
           style={{ letterSpacing: '-0.005em' }}>
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
    <section className="lg-card lg-rise mb-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-200 px-3 py-2">
        <h3 className="text-[13px] font-bold text-ink-950"
            style={{ letterSpacing: '-0.005em' }}>{title}</h3>
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

/**
 * A breakdown with its pass/fail split — the same shape the RADIUS CSV
 * dashboard uses, so the two read identically.
 */
const dimPanel = (
  title: string, note: string, head: string, rows: DimEntry[],
  sortBy: 'total' | 'fail' = 'total',
): PanelData => {
  const list = sortBy === 'fail'
    ? [...rows].filter(r => r.fail > 0).sort((a, b) => b.fail - a.fail)
    : rows
  const max = Math.max(1, ...list.map(r => r.total))
  return {
    title, note,
    columns: [
      { head, align: 'left' },
      { head: 'Auths', align: 'right', width: 'w-16' },
      { head: 'Failed', align: 'right', width: 'w-14' },
      { head: 'Fail %', align: 'right', width: 'w-12' },
    ],
    rows: list.map(r => {
      const rate = r.total ? r.fail / r.total : 0
      return {
        id: r.key,
        bar: r.total / max,
        barFail: rate,
        cells: [
          r.key, n(r.total), r.fail ? n(r.fail) : '—',
          <span key="r" className={rateTone(rate)}>{pc(rate)}</span>,
        ],
        sort: [r.key, r.total, r.fail, rate],
      }
    }),
    empty: 'Not present in this bundle.',
  }
}

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

/** Authentication volume and failure rate, hour by hour. */
function AuthTimeline({ hourly }: { hourly: { hour: string; total: number; fail: number }[] }) {
  if (!hourly || hourly.length < 2) return null

  const W = 1200, H = 170, padL = 52, padR = 46, padT = 12, padB = 22
  const iw = W - padL - padR, ih = H - padT - padB
  const maxTotal = Math.max(1, ...hourly.map(d => d.total))
  const maxRate = Math.max(0.02, ...hourly.map(d => (d.total ? d.fail / d.total : 0)))
  const bw = iw / hourly.length
  const x = (i: number) => padL + i * bw
  const yVol = (v: number) => padT + ih - (v / maxTotal) * ih
  const yRate = (v: number) => padT + ih - (v / maxRate) * ih

  const line = hourly.map((d, i) => {
    const r = d.total ? d.fail / d.total : 0
    return `${i === 0 ? 'M' : 'L'}${(x(i) + bw / 2).toFixed(1)},${yRate(r).toFixed(1)}`
  }).join(' ')

  const step = Math.max(1, Math.ceil(hourly.length / 10))
  const ticks = hourly.map((_, i) => i).filter(i => i % step === 0 || i === hourly.length - 1)

  return (
    <section className="lg-card lg-rise mb-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-200 px-3 py-2">
        <h3 className="text-[13px] font-bold text-ink-950"
            style={{ letterSpacing: '-0.005em' }}>
          Authentications over time
        </h3>
        <p className="text-[10.5px] text-ink-400">
          {hourly.length} hours · grey = total · red bar = failed · line = failure rate
        </p>
      </header>
      <div className="p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
             aria-label="Authentication volume and failure rate by hour">
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <line key={f} x1={padL} x2={W - padR} y1={padT + ih * f} y2={padT + ih * f}
                  stroke="#ECECEF" strokeWidth="1" />
          ))}
          {hourly.map((d, i) => (
            <rect key={i} x={x(i) + bw * 0.15} width={Math.max(bw * 0.7, 0.8)}
                  y={yVol(d.total)} height={Math.max(padT + ih - yVol(d.total), 0)} fill="#D9D9DE" />
          ))}
          {hourly.map((d, i) => (
            <rect key={'f' + i} x={x(i) + bw * 0.15} width={Math.max(bw * 0.7, 0.8)}
                  y={yVol(d.fail)} height={Math.max(padT + ih - yVol(d.fail), 0)}
                  fill="#D3002D" opacity="0.55" />
          ))}
          <path d={line} fill="none" stroke="#D3002D" strokeWidth="1.8" strokeLinejoin="round" />
          <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize="10" fill="#8A8A93">{n(maxTotal)}</text>
          <text x={padL - 6} y={padT + ih} textAnchor="end" fontSize="10" fill="#8A8A93">0</text>
          <text x={W - padR + 6} y={padT + 4} fontSize="10" fill="#D3002D">{pc(maxRate, 0)}</text>
          {ticks.map(i => (
            <text key={i} x={x(i) + bw / 2} y={H - 6} textAnchor="middle" fontSize="9.5" fill="#8A8A93">
              {hourly[i].hour.slice(11)}:00
            </text>
          ))}
        </svg>
      </div>
    </section>
  )
}

/**
 * Several logs on one hourly axis.
 *
 * Each series is normalised against its own peak, because the point is
 * the shape rather than the magnitude — OCSP failures and authentication
 * failures differ by orders of magnitude, and plotting them on a shared
 * scale would flatten one into the axis.
 */
function CorrelationChart({ c }: { c: Correlation }) {
  if (!c || c.hours.length < 2 || c.series.length === 0) return null

  const W = 1200, H = 60 * c.series.length + 34
  const padL = 190, padR = 20, padT = 8
  const iw = W - padL - padR
  const bw = iw / c.hours.length
  const step = Math.max(1, Math.ceil(c.hours.length / 10))

  return (
    <section className="lg-card lg-rise mb-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-200 px-3 py-2">
        <h3 className="text-[13px] font-bold text-ink-950"
            style={{ letterSpacing: '-0.005em' }}>
          What happened at the same time
        </h3>
        <p className="text-[10.5px] text-ink-400">
          Each row scaled to its own peak — read the shapes, not the heights.
          Aligned spikes are worth investigating; independent ones usually are not.
        </p>
      </header>
      <div className="overflow-x-auto p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[720px]" role="img"
             aria-label="Several log series aligned on one hourly axis">
          {c.series.map((s, row) => {
            const top = padT + row * 60
            const peak = Math.max(1, ...s.values)
            return (
              <g key={s.id}>
                <text x={8} y={top + 20} fontSize="11" fill="#17171A" fontWeight="600">{s.label}</text>
                <text x={8} y={top + 33} fontSize="9" fill="#8A8A93">{s.note}</text>
                <text x={8} y={top + 46} fontSize="9" fill="#B5B5BC">peak {n(peak)}/h</text>
                <line x1={padL} x2={W - padR} y1={top + 48} y2={top + 48} stroke="#ECECEF" strokeWidth="1" />
                {s.values.map((v, i) => {
                  const h = (v / peak) * 40
                  return h > 0 ? (
                    <rect key={i} x={padL + i * bw + bw * 0.15}
                          width={Math.max(bw * 0.7, 0.8)}
                          y={top + 48 - h} height={h}
                          fill={s.id === 'authFail' || s.id === 'ocsp' ? '#D3002D' : '#8A8A93'}
                          opacity={s.id === 'auth' ? 0.45 : 0.8} />
                  ) : null
                })}
              </g>
            )
          })}
          {c.hours.map((h, i) => i % step === 0 || i === c.hours.length - 1 ? (
            <text key={i} x={padL + i * bw + bw / 2} y={H - 6} textAnchor="middle"
                  fontSize="9" fill="#8A8A93">
              {h.slice(8, 10)}/{h.slice(5, 7)} {h.slice(11)}h
            </text>
          ) : null)}
        </svg>
      </div>
    </section>
  )
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
    if (system.nodes?.length) {
      systemPanels.push({
        title: 'Deployment',
        note: 'Every node registered in this deployment, with its persona, role and replication state.',
        columns: [
          { head: 'Node', align: 'left' },
          { head: 'Persona', align: 'right', width: 'w-20' },
          { head: 'Role', align: 'right', width: 'w-20' },
          { head: 'Active', align: 'right', width: 'w-16' },
          { head: 'Replication', align: 'right', width: 'w-32' },
        ],
        rows: system.nodes.map(nd => {
          const bad = /fail|error|out of sync|disconnect/i.test(nd.replication)
          return {
            id: nd.name,
            cells: [
              <span key="n" className={nd.name === system.hostname ? 'font-bold text-ink-950' : ''}>
                {nd.name}{nd.name === system.hostname && <span className="ml-2 text-signal-500">this node</span>}
              </span>,
              nd.persona, nd.role,
              <span key="a" className={nd.active === 'ACTIVE' ? 'text-[#0F7B4F] font-bold' : 'text-ink-400'}>
                {nd.active}
              </span>,
              <span key="r" className={bad ? 'text-signal-500 font-bold' : 'text-ink-600'}>
                {nd.replication}
              </span>,
            ],
            sort: [nd.name, nd.persona, nd.role, nd.active, nd.replication],
          }
        }),
      })
    }

    if (system.disks?.length) {
      systemPanels.push({
        title: 'Disk utilisation',
        note: 'Anything at or above 80% is highlighted — ISE stops behaving predictably when a partition fills.',
        columns: [
          { head: 'Mount', align: 'left' },
          { head: 'Size', align: 'right', width: 'w-16' },
          { head: 'Used', align: 'right', width: 'w-16' },
          { head: 'Free', align: 'right', width: 'w-16' },
          { head: 'Use %', align: 'right', width: 'w-14' },
        ],
        rows: [...system.disks].sort((a, b) => b.usePct - a.usePct).map(d => ({
          id: d.mount + d.filesystem,
          bar: d.usePct / 100,
          barFail: d.usePct >= 80 ? 1 : 0,
          cells: [
            <span key="m">
              <span className="text-ink-900">{d.mount}</span>
              <span className="ml-2 text-ink-400">{d.filesystem}</span>
            </span>,
            d.size, d.used, d.avail,
            <span key="p" className={
              d.usePct >= 90 ? 'text-signal-500 font-bold'
                : d.usePct >= 80 ? 'text-[#B45309] font-bold' : 'text-ink-500'
            }>{d.usePct}%</span>,
          ],
          sort: [d.mount, d.size, d.used, d.avail, d.usePct],
        })),
      })
    }

    if (system.appCpu?.length) {
      const active = system.appCpu.filter(c => c.cpu !== null)
      const maxCpu = Math.max(0.01, ...active.map(c => c.cpu ?? 0))
      systemPanels.push({
        title: 'CPU by ISE service',
        note: 'Percentage of CPU and cumulative CPU time per service. N/A means the service is not enabled on this node.',
        columns: [
          { head: 'Service', align: 'left' },
          { head: '% CPU', align: 'right', width: 'w-16' },
          { head: 'CPU time', align: 'right', width: 'w-24' },
          { head: 'Threads', align: 'right', width: 'w-20' },
        ],
        rows: system.appCpu.map(c => ({
          id: c.name,
          bar: c.cpu !== null ? c.cpu / maxCpu : 0,
          cells: [
            c.name,
            c.cpu === null
              ? <span key="c" className="text-ink-300">N/A</span>
              : <span key="c" className={c.cpu > 50 ? 'text-signal-500 font-bold' : ''}>{c.cpu.toFixed(2)}</span>,
            c.cpuTime || '—',
            c.threads || '—',
          ],
          sort: [c.name, c.cpu ?? -1, c.cpuTime, c.threads],
        })),
      })
    }

    if (system.memory?.length) {
      systemPanels.push({
        title: 'Memory',
        note: 'As reported by the operating system at the moment the bundle was taken.',
        columns: [
          { head: 'Metric', align: 'left' },
          { head: 'Value', align: 'right', width: 'w-44' },
        ],
        rows: system.memory.map(m => ({ id: m.key, cells: [m.key, m.value], sort: [m.key, m.value] })),
      })
    }

    if (system.topProcesses?.length) {
      systemPanels.push({
        title: 'Top processes',
        note: 'Busiest processes at the moment of capture.',
        columns: [
          { head: 'Command', align: 'left' },
          { head: 'PID', align: 'right', width: 'w-16' },
          { head: '% CPU', align: 'right', width: 'w-14' },
          { head: '% Mem', align: 'right', width: 'w-14' },
        ],
        rows: system.topProcesses.map(t => ({
          id: t.pid,
          bar: Number(t.cpu) / Math.max(1, ...system.topProcesses.map(x => Number(x.cpu))),
          cells: [t.command, t.pid, t.cpu, t.mem],
          sort: [t.command, Number(t.pid), Number(t.cpu), Number(t.mem)],
        })),
      })
    }

    if (system.inventory?.length) {
      systemPanels.push({
        title: 'Inventory',
        note: 'Platform and hardware detail.',
        columns: [
          { head: 'Field', align: 'left' },
          { head: 'Value', align: 'right', width: 'w-64' },
        ],
        rows: system.inventory.map((i, idx) => ({
          id: i.key + idx, cells: [i.key, i.value], sort: [i.key, i.value],
        })),
      })
    }

    systemPanels.push({
      title: 'Licensing',
      note: 'Licence entitlement is held on the Primary PAN. A support bundle taken from a policy node will not contain it.',
      columns: [{ head: 'Detail', align: 'left' }],
      rows: (system.licence ?? []).map((l, i) => ({ id: String(i), cells: [l], sort: [l] })),
      empty: (
        <>
          No licensing detail in this bundle. On a deployment this is expected unless the
          bundle came from the <strong>Primary PAN</strong> — entitlement lives there, not on a
          PSN. Take a bundle from{' '}
          {system.nodes?.find(nd => nd.role === 'PRIMARY')?.name ?? 'the primary node'} to see it.
        </>
      ),
    })

    if (system.hotpatches?.length) {
      systemPanels.push({
        title: 'Hotpatches',
        note: 'Newest first.',
        columns: [
          { head: 'Hotpatch', align: 'left' },
          { head: 'Installed', align: 'right', width: 'w-56' },
        ],
        rows: system.hotpatches.map(h => ({
          id: h.name, cells: [h.name, h.when], sort: [h.name, h.when],
        })),
      })
    }

    if (system.reboots?.length) {
      systemPanels.push({
        title: 'Reboots and shutdowns',
        note: 'From the system start and stop history. A tight repeating pattern usually means a scheduled task rather than instability.',
        columns: [
          { head: 'Event', align: 'left' },
          { head: 'When', align: 'right', width: 'w-40' },
        ],
        rows: system.reboots.map((rb, i) => ({
          id: String(i),
          cells: [
            <span key="e" className={rb.event === 'reboot' ? 'text-ink-900' : 'text-ink-500'}>{rb.event}</span>,
            rb.when,
          ],
          sort: [rb.event, rb.when],
        })),
      })
    }

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
    const dim = (key: string, title: string, head: string, note = '', sortBy: 'total' | 'fail' = 'total') => {
      if (D[key]?.length) authPanels.push(dimPanel(title, note, head, D[key], sortBy))
    }

    // failure detail first — it is the reason anyone opens this
    if (auth.failureDetail?.length) {
      const maxF = Math.max(1, ...auth.failureDetail.map(f => f.count))
      authPanels.push({
        title: 'Why authentications failed',
        note: 'Each ISE code with its own description, and where it concentrated. A code landing mostly on one device is a different problem from one spread evenly.',
        columns: [
          { head: 'Reason', align: 'left' },
          { head: 'Code', align: 'right', width: 'w-12' },
          { head: 'Count', align: 'right', width: 'w-14' },
          { head: 'Share', align: 'right', width: 'w-12' },
          { head: 'Concentrated on', align: 'right', width: 'w-44' },
        ],
        rows: auth.failureDetail.map(f => ({
          id: f.code,
          bar: f.count / maxF,
          barFail: 1,
          cells: [
            f.text || `(no catalogue entry for ${f.code})`,
            <span key="c" className="text-signal-500">{f.code}</span>,
            n(f.count), pc(f.share),
            <span key="d" className="truncate text-ink-500">
              {f.topNad
                ? `${f.topNad} (${Math.round(f.topNadCount / f.count * 100)}%)`
                : '—'}
            </span>,
          ],
          sort: [f.text, Number(f.code) || 0, f.count, f.share, f.topNad ?? ''],
        })),
        empty: 'No failed authentications in this bundle.',
      })
    }

    authPanels.push(kcPanel(
      'All message codes', 'Every code seen, resolved through the catalogue shipped inside this bundle.',
      'Code', auth.messageCodes, 'Records', code))

    dim('endpoint', 'Endpoints failing most', 'Endpoint MAC',
      'Sorted by failures. One MAC dominating is usually a single broken supplicant.', 'fail')
    dim('nad', 'Network devices', 'Network device',
      'Where a site-specific fault surfaces first.')
    dim('ssid', 'SSID', 'SSID',
      'From cisco-wlan-ssid — the field the CSV export does not carry at all.')
    dim('protocol', 'Authentication protocols', 'Protocol',
      'A protocol failing at 100% almost always means it is not in Allowed Protocols.')
    dim('policySet', 'Policy sets', 'Policy set')
    dim('authzRule', 'Authorization rules', 'Authorization rule')
    dim('authzProfile', 'Authorization profiles', 'Authorization profile')
    dim('identityStore', 'Identity stores', 'Identity store')
    dim('issuer', 'Certificate issuers', 'Issuer CN',
      'Which CA signed the certificates being presented.')
    dim('certTemplate', 'Certificate templates', 'Template')
    dim('tlsVersion', 'TLS versions', 'TLS version')
    dim('tlsCipher', 'TLS ciphers', 'Cipher suite')
    dim('nasIp', 'NAD IP addresses', 'NAS IP address')
    dim('flowType', 'RADIUS flow types', 'Flow type')
    dim('deviceType', 'Device types', 'Device type')
    dim('location', 'Locations', 'Location')
    dim('endpointProfile', 'Endpoint profiles', 'Profile',
      'A high share of Unknown means profiling probes are not seeing these endpoints.')
    dim('user', 'Identities', 'User name', '', 'fail')
    dim('node', 'ISE nodes', 'Node')

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

      {/* ---------- the headline facts, before anything else ---------- */}
      {system && (
        <div className="lg-card lg-rise mb-4">
          <div className="grid divide-ink-100 sm:grid-cols-2 sm:divide-x lg:grid-cols-4">
            {[
              ['Version', system.iseVersion ?? '—',
               system.buildDate ? `built ${system.buildDate}` : null],
              ['Latest patch',
               system.patches.length ? `Patch ${system.patches[system.patches.length - 1].version}` : 'none',
               system.patches.length ? system.patches[system.patches.length - 1].installDate : null],
              ['Hotfix',
               system.hotpatches?.length ? system.hotpatches[0].name : 'none installed',
               system.hotpatches?.length ? system.hotpatches[0].when : null],
              ['Platform', system.profile ?? system.architecture ?? '—',
               system.adeOs ? `ADE-OS ${system.adeOs}` : null],
            ].map(([label, value, sub]) => (
              <div key={label as string} className="px-4 py-3">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-400">{label}</p>
                <p className="mt-1 break-words text-[15px] font-bold leading-tight text-ink-950"
                   style={{ letterSpacing: '-0.005em' }}>
                  {value}
                </p>
                {sub && <p className="mt-0.5 text-[10.5px] text-ink-400">{sub}</p>}
              </div>
            ))}
          </div>

          {(system.loadAvg || system.cpuSummary || system.uptime) && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-ink-100 px-4 py-2.5">
              {system.loadAvg && (
                <span className="font-mono text-[11px] text-ink-600">
                  <span className="text-ink-400">load avg</span> {system.loadAvg}
                </span>
              )}
              {system.uptime && (
                <span className="font-mono text-[11px] text-ink-600">
                  <span className="text-ink-400">up</span> {system.uptime}
                </span>
              )}
              {system.cpuSummary && (
                <span className="font-mono text-[11px] text-ink-600">
                  <span className="text-ink-400">cpu</span> {system.cpuSummary}
                </span>
              )}
              {system.deploymentId && (
                <span className="font-mono text-[11px] text-ink-400">
                  deployment {system.deploymentId}
                </span>
              )}
            </div>
          )}

          {system.diskAlerts.length > 0 && (
            <div className="border-t border-signal-500 bg-signal-50 px-4 py-2.5">
              <p className="text-[11px] font-bold text-signal-700">
                Filesystem pressure — {system.diskAlerts.length} mount{system.diskAlerts.length === 1 ? '' : 's'} at 80% or above
              </p>
              <p className="mt-1 font-mono text-[11px] text-signal-700">
                {system.diskAlerts.join('  ·  ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---------- findings ---------- */}
      {r.findings?.length > 0 && (
        <section className="lg-card lg-rise mb-4 p-3">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-bold text-ink-950"
                style={{ letterSpacing: '-0.005em' }}>
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

      {/* ---------- correlation ---------- */}
      {r.correlation && <CorrelationChart c={r.correlation} />}

      {/* ---------- every problem, one list ---------- */}
      {r.problems && r.problems.length > 0 && (
        <>
          <SectionBanner title="Every warning and error"
            subtitle={`${n(r.problems.length)} distinct messages across every log, ranked by how often they occur`} />
          <div className="mb-4">
            <Panel
              onExpand={onExpand}
              data={{
                title: 'All problems, all logs',
                note: 'Repeated messages grouped, with MAC addresses, IPs and long numbers collapsed so variants count together. Open for the full list.',
                columns: [
                  { head: 'Message', align: 'left' },
                  { head: 'Log', align: 'right', width: 'w-40' },
                  { head: 'Level', align: 'right', width: 'w-14' },
                  { head: 'Count', align: 'right', width: 'w-20' },
                ],
                rows: r.problems.map((p, i) => ({
                  id: `${p.log}-${i}`,
                  bar: p.count / Math.max(1, ...r.problems!.map(x => x.count)),
                  barFail: p.level === 'ERROR' || p.level === 'FATAL' ? 1 : 0.4,
                  cells: [
                    p.message,
                    <span key="l" className="truncate text-ink-500">{p.log}</span>,
                    <span key="v" className={
                      p.level === 'ERROR' || p.level === 'FATAL' ? 'text-signal-500 font-bold'
                        : p.level === 'WARN' ? 'text-[#B45309]' : 'text-ink-400'
                    }>{p.level}</span>,
                    n(p.count),
                  ],
                  sort: [p.message, p.log, p.level, p.count],
                })),
              }}
            />
          </div>
        </>
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
            subtitle={
              `${system?.hostname ?? ''}` +
              (system?.nodes?.length ? ` · ${system.nodes.length} nodes in deployment` : '') +
              ` · installed ${system?.installDate ?? 'unknown'}` +
              ` · ${system?.services.length ?? 0} services reported`
            } />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {systemPanels.map(p => <Panel key={p.title} data={p} onExpand={onExpand} />)}
          </div>
        </>
      )}

      {/* ---------- verbatim show-tech sections ---------- */}
      {system?.rawSections && system.rawSections.length > 0 && (
        <>
          <SectionBanner title="Show-tech output"
            subtitle={`${system.rawSections.length} sections shown exactly as ISE printed them — summarising these would lose more than it saves`} />
          <div className="grid gap-3 lg:grid-cols-2">
            {system.rawSections.map(s => (
              <details key={s.name} className="lg-card group">
                <summary className="cursor-pointer list-none px-3 py-2.5 marker:content-none">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-bold text-ink-950"
                          style={{ letterSpacing: '-0.005em' }}>
                      {s.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-ink-400">
                      {s.lines.length} lines
                      <span className="ml-2 text-signal-500 transition-transform group-open:rotate-90 inline-block">▸</span>
                    </span>
                  </div>
                </summary>
                <pre className="overflow-x-auto border-t border-ink-100 bg-paper-dim px-3 py-2.5 font-mono text-[10.5px] leading-relaxed text-ink-700">
{s.lines.join('\n')}</pre>
              </details>
            ))}
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

          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            <Kpi label="Authentications" value={n(auth.records)} />
            <Kpi label="Passed" value={n(auth.passed)} tone="green" sub={pc(1 - auth.failRate)} />
            <Kpi label="Failed" value={n(auth.failed)} tone={auth.failed ? 'red' : 'green'}
                 sub={pc(auth.failRate, 2)} />
            <Kpi label="Median latency" value={ms(auth.latency.total.p50)}
                 sub={`p95 ${ms(auth.latency.total.p95)}`} />
            <Kpi label="Worst latency" value={ms(auth.latency.total.max)}
                 tone={auth.latency.total.max > 5000 ? 'red' : 'ink'} />
            <Kpi label="Endpoints" value={n(auth.dims.endpoint?.length ?? 0)}
                 sub="in the top list" />
            <Kpi label="Network devices" value={n(auth.dims.nad?.length ?? 0)} />
            <Kpi label="SSIDs" value={n(auth.dims.ssid?.length ?? 0)} />
            <Kpi label="Failure reasons" value={n(auth.failureDetail?.length ?? 0)} />
            <Kpi label="ISE stat samples" value={n(auth.utilisationSamples)}
                 sub="70000-series records" />
          </div>

          <AuthTimeline hourly={auth.hourly} />

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
