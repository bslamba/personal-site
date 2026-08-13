// ============================================================
// lib/tools/dashboard.ts
//
// The seven CSVs that come out of the ISE dashboard when you use
// Manage → Export with everything ticked.
//
// None of them is a normal CSV. Metrics is key/value pairs with no
// header. Authentications, Endpoints and Network Devices are
// several labelled sections stacked in one file. System Summary is
// a block per node — four metadata lines then a table. So they are
// parsed as text rather than pushed through a CSV reader, and each
// is recognised by the shape of its opening lines.
// ============================================================

export interface Pair { label: string; count: number }

export interface AlarmRow {
  severity: number
  name: string
  occurrences: number
  lastOccurred: string
  /** minutes ago, derived from the human phrasing, for sorting */
  minutesAgo: number
}

export interface NodeSample { t: string; cpu: number; memory: number; latency: number }

export interface NodeSeries {
  name: string
  type: string
  role: string
  filter: string
  samples: NodeSample[]
  avgLatency: number
  peakLatency: number
  avgCpu: number
  peakCpu: number
  avgMemory: number
  peakMemory: number
}

export interface DashboardAnalysis {
  files: string[]
  metrics: Pair[]
  alarms: AlarmRow[]
  alarmsBySeverity: { severity: number; label: string; alarms: number; occurrences: number }[]
  nodes: NodeSeries[]
  /** hours shared across all nodes, for the latency chart */
  latencyHours: string[]
  identityStores: Pair[]
  identityGroups: Pair[]
  networkDevices: Pair[]
  failureReasons: (Pair & { code: string; text: string })[]
  endpointProfiles: Pair[]
  endpointStatus: Pair[]
  totals: {
    authentications: number
    failures: number
    avgLatency: number
    peakLatency: number
    slowestNode: string | null
    endpointsTotal: number
    endpointsActive: number
    connected: number
    disconnected: number
  }
  findings: { severity: string; headline: string; detail: string }[]
}

// ------------------------------------------------------------
// recognition
// ------------------------------------------------------------
export type DashboardKind =
  | 'metrics' | 'alarms' | 'systemSummary' | 'authentications'
  | 'status' | 'networkDevices' | 'endpoints'

/** Identified by the opening lines, since none of them carries a usable header. */
export function detectDashboardKind(text: string): DashboardKind | null {
  const head = text.slice(0, 400)
  const first = head.split(/\r?\n/)[0]?.trim() ?? ''

  if (/^Total Endpoints\s*,/i.test(first)) return 'metrics'
  if (/^Severity\s*,\s*Name\s*,\s*Occurrences/i.test(first)) return 'alarms'
  if (/^Name:\s*/i.test(first)) return 'systemSummary'
  if (/^Status\s*,\s*Number of endpoints/i.test(first)) return 'status'
  if (/^Identity Store\s*$/i.test(first)) return 'authentications'
  if (/^Device Name\s*$/i.test(first)) return 'networkDevices'
  if (/^Profile\s*$/i.test(first)) return 'endpoints'
  return null
}

// ------------------------------------------------------------
// helpers
// ------------------------------------------------------------
const clean = (s: string) => s.replace(/^["']|["']$/g, '').trim()
const toNum = (s: string) => {
  const v = Number(clean(s).replace(/,/g, ''))
  return Number.isFinite(v) ? v : 0
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let buf = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { quoted = !quoted; continue }
    if (c === ',' && !quoted) { out.push(buf); buf = ''; continue }
    buf += c
  }
  out.push(buf)
  return out
}

/** "1 hr 28 mins ago" / "less than 1 min ago" → minutes, for ranking. */
function minutesAgo(text: string): number {
  const t = text.toLowerCase()
  if (/less than/.test(t)) return 0
  let mins = 0
  const d = /(\d+)\s*day/.exec(t); if (d) mins += Number(d[1]) * 1440
  const h = /(\d+)\s*hr/.exec(t);  if (h) mins += Number(h[1]) * 60
  const m = /(\d+)\s*min/.exec(t); if (m) mins += Number(m[1])
  return mins
}

const SEVERITY_LABEL: Record<number, string> = {
  1: 'Critical', 2: 'Warning', 3: 'Information',
}

/**
 * Sections look like:
 *   Identity Group
 *    ,Identity Group,Number of authentications
 *    ,workstation,24302
 * The leading empty column is ISE's indentation, not data.
 */
function parseSections(text: string): Map<string, Pair[]> {
  const out = new Map<string, Pair[]>()
  let current: string | null = null

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) continue

    const cols = splitCsvLine(line).map(clean)
    const nonEmpty = cols.filter(Boolean)

    // a bare single value on its own line is a section heading
    if (nonEmpty.length === 1 && !/^\s*,/.test(raw) && !/^\d+$/.test(nonEmpty[0])) {
      current = nonEmpty[0]
      if (!out.has(current)) out.set(current, [])
      continue
    }

    if (!current || nonEmpty.length < 2) continue

    const label = nonEmpty[nonEmpty.length - 2]
    const value = nonEmpty[nonEmpty.length - 1]
    // skip the repeated column header inside each section
    if (/^number of/i.test(value)) continue
    if (!/^-?[\d,]+$/.test(value)) continue

    out.get(current)!.push({ label, count: toNum(value) })
  }
  return out
}

// ------------------------------------------------------------
// the builder
// ------------------------------------------------------------
export class DashboardBuilder {
  private files: string[] = []
  private metrics: Pair[] = []
  private alarms: AlarmRow[] = []
  private nodes: NodeSeries[] = []
  private identityStores: Pair[] = []
  private identityGroups: Pair[] = []
  private networkDevices: Pair[] = []
  private failureReasons: Pair[] = []
  private endpointProfiles: Pair[] = []
  private endpointStatus: Pair[] = []
  private seen = 0

  get count() { return this.seen }

  add(kind: DashboardKind, text: string, filename: string) {
    if (!this.files.includes(filename)) this.files.push(filename)
    this.seen++

    switch (kind) {
      case 'metrics': {
        for (const raw of text.split(/\r?\n/)) {
          if (!raw.trim()) continue
          const cols = splitCsvLine(raw).map(clean)
          if (cols.length >= 2 && /^-?[\d,]+$/.test(cols[1])) {
            this.metrics.push({ label: cols[0], count: toNum(cols[1]) })
          }
        }
        break
      }

      case 'alarms': {
        const lines = text.split(/\r?\n/).slice(1)
        for (const raw of lines) {
          if (!raw.trim()) continue
          const c = splitCsvLine(raw).map(clean)
          if (c.length < 4) continue
          this.alarms.push({
            severity: toNum(c[0]),
            name: c[1],
            occurrences: toNum(c[2]),
            lastOccurred: c[3],
            minutesAgo: minutesAgo(c[3]),
          })
        }
        break
      }

      case 'systemSummary': {
        // one block per node, each starting with "Name: <host>"
        let node: NodeSeries | null = null
        for (const raw of text.split(/\r?\n/)) {
          const line = raw.replace(/\s+$/, '')
          if (!line.trim()) continue

          const nameMatch = /^Name:\s*(.+)$/i.exec(line)
          if (nameMatch) {
            node = {
              name: clean(nameMatch[1]), type: '', role: '', filter: '',
              samples: [], avgLatency: 0, peakLatency: 0,
              avgCpu: 0, peakCpu: 0, avgMemory: 0, peakMemory: 0,
            }
            this.nodes.push(node)
            continue
          }
          if (!node) continue

          const meta = /^Node Type:\s*(.+)$/i.exec(line)
          if (meta) { node.type = clean(meta[1]); continue }
          const role = /^Node Role:\s*(.+)$/i.exec(line)
          if (role) { node.role = clean(role[1]); continue }
          const filter = /^Filter:\s*(.+)$/i.exec(line)
          if (filter) { node.filter = clean(filter[1]); continue }

          const c = splitCsvLine(line).map(clean)
          // ,Logged At,CPU (%),Memory (%),Latency (ms)
          if (c.length >= 5 && /^\d{4}-\d{2}-\d{2}/.test(c[1])) {
            node.samples.push({
              t: c[1], cpu: toNum(c[2]), memory: toNum(c[3]), latency: toNum(c[4]),
            })
          }
        }
        break
      }

      case 'status': {
        for (const raw of text.split(/\r?\n/).slice(1)) {
          if (!raw.trim()) continue
          const c = splitCsvLine(raw).map(clean)
          if (c.length >= 2 && /^-?[\d,]+$/.test(c[1])) {
            this.endpointStatus.push({ label: c[0], count: toNum(c[1]) })
          }
        }
        break
      }

      case 'authentications': {
        const sections = parseSections(text)
        this.identityStores.push(...(sections.get('Identity Store') ?? []))
        this.identityGroups.push(...(sections.get('Identity Group') ?? []))
        this.networkDevices.push(...(sections.get('Network Device') ?? []))
        this.failureReasons.push(...(sections.get('Failure Reason') ?? []))
        break
      }

      case 'networkDevices': {
        const sections = parseSections(text)
        const rows = sections.get('Device Name') ?? []
        // the same devices appear in Authentications.csv; keep one copy
        if (this.networkDevices.length === 0) this.networkDevices.push(...rows)
        break
      }

      case 'endpoints': {
        const sections = parseSections(text)
        this.endpointProfiles.push(...(sections.get('Profile') ?? []))
        break
      }
    }
  }

  finish(): DashboardAnalysis {
    // ---- node aggregates ----
    for (const nd of this.nodes) {
      const s = nd.samples
      if (!s.length) continue
      const mean = (get: (x: NodeSample) => number) =>
        +(s.reduce((a, x) => a + get(x), 0) / s.length).toFixed(1)
      nd.avgLatency = mean(x => x.latency)
      nd.peakLatency = Math.max(...s.map(x => x.latency))
      nd.avgCpu = mean(x => x.cpu)
      nd.peakCpu = Math.max(...s.map(x => x.cpu))
      nd.avgMemory = mean(x => x.memory)
      nd.peakMemory = Math.max(...s.map(x => x.memory))
    }
    this.nodes.sort((a, b) => b.avgLatency - a.avgLatency)

    const latencyHours = [...new Set(this.nodes.flatMap(nd => nd.samples.map(s => s.t)))].sort()

    // ---- alarms by severity ----
    const sevMap = new Map<number, { alarms: number; occurrences: number }>()
    for (const a of this.alarms) {
      const cur = sevMap.get(a.severity) ?? { alarms: 0, occurrences: 0 }
      cur.alarms++
      cur.occurrences += a.occurrences
      sevMap.set(a.severity, cur)
    }
    const alarmsBySeverity = [...sevMap.entries()]
      .map(([severity, v]) => ({
        severity, label: SEVERITY_LABEL[severity] ?? `Severity ${severity}`, ...v,
      }))
      .sort((a, b) => a.severity - b.severity)

    // ---- failure reasons carry their ISE code in the label ----
    const failureReasons = this.failureReasons.map(f => {
      const m = /^(\d{4,5})\s+(.*)$/.exec(f.label)
      return {
        ...f,
        code: m ? m[1] : '',
        text: m ? m[2] : f.label,
      }
    }).sort((a, b) => b.count - a.count)

    // ---- totals ----
    const metric = (name: RegExp) => this.metrics.find(m => name.test(m.label))?.count ?? 0
    const authentications = this.identityStores.reduce((a, x) => a + x.count, 0)
    const failures = failureReasons.reduce((a, x) => a + x.count, 0)
    const withSamples = this.nodes.filter(nd => nd.samples.length)
    const avgLatency = withSamples.length
      ? +(withSamples.reduce((a, nd) => a + nd.avgLatency, 0) / withSamples.length).toFixed(1)
      : 0

    const analysis: DashboardAnalysis = {
      files: this.files,
      metrics: this.metrics,
      alarms: [...this.alarms].sort((a, b) => b.occurrences - a.occurrences),
      alarmsBySeverity,
      nodes: this.nodes,
      latencyHours,
      identityStores: [...this.identityStores].sort((a, b) => b.count - a.count),
      identityGroups: [...this.identityGroups].sort((a, b) => b.count - a.count),
      networkDevices: [...this.networkDevices].sort((a, b) => b.count - a.count),
      failureReasons,
      endpointProfiles: [...this.endpointProfiles].sort((a, b) => b.count - a.count),
      endpointStatus: this.endpointStatus,
      totals: {
        authentications, failures, avgLatency,
        peakLatency: Math.max(0, ...withSamples.map(nd => nd.peakLatency)),
        slowestNode: withSamples.length ? withSamples[0].name : null,
        endpointsTotal: metric(/^total endpoints/i),
        endpointsActive: metric(/^active endpoints/i),
        connected: this.endpointStatus.find(s => /connect/i.test(s.label) && !/dis/i.test(s.label))?.count ?? 0,
        disconnected: this.endpointStatus.find(s => /disconnect/i.test(s.label))?.count ?? 0,
      },
      findings: [],
    }
    analysis.findings = buildFindings(analysis)
    return analysis
  }
}

// ------------------------------------------------------------
// findings
// ------------------------------------------------------------
const num = (v: number) => Math.round(v).toLocaleString()
const pctOf = (a: number, b: number) => b ? ((a / b) * 100).toFixed(1) + '%' : '0%'

function buildFindings(a: DashboardAnalysis): DashboardAnalysis['findings'] {
  const out: DashboardAnalysis['findings'] = []
  const add = (severity: string, headline: string, detail: string) =>
    out.push({ severity, headline, detail })

  // --- latency spread across nodes ---
  const withSamples = a.nodes.filter(nd => nd.samples.length)
  if (withSamples.length >= 2) {
    const slowest = withSamples[0]
    const fastest = withSamples[withSamples.length - 1]
    if (fastest.avgLatency > 0 && slowest.avgLatency / fastest.avgLatency >= 1.5) {
      add(slowest.avgLatency / fastest.avgLatency >= 3 ? 'medium' : 'info',
        `${slowest.name} is the slowest node at ${slowest.avgLatency}ms average`,
        `Against ${fastest.avgLatency}ms on ${fastest.name} — a ratio of ` +
        `${(slowest.avgLatency / fastest.avgLatency).toFixed(1)} to 1. Peak on the slowest was ` +
        `${slowest.peakLatency}ms. Consistent latency differences between nodes usually point ` +
        `at the identity store or the network path rather than the node itself.`)
    }
  }

  // --- resource pressure ---
  for (const nd of a.nodes) {
    if (nd.peakMemory >= 85 || nd.peakCpu >= 80) {
      add(nd.peakMemory >= 92 || nd.peakCpu >= 90 ? 'high' : 'medium',
        `${nd.name} is under resource pressure`,
        `Peak CPU ${nd.peakCpu}%, peak memory ${nd.peakMemory}% across ${nd.samples.length} hourly samples.`)
    }
  }

  // --- alarms ---
  const critical = a.alarmsBySeverity.find(s => s.severity === 1)
  if (critical) {
    add('high', `${critical.alarms} critical alarm type(s), ${num(critical.occurrences)} occurrences`,
      a.alarms.filter(x => x.severity === 1).slice(0, 4).map(x => x.name).join(', ') + '.')
  }
  const loudest = a.alarms[0]
  if (loudest && loudest.occurrences >= 1000) {
    add('medium', `${loudest.name} fired ${num(loudest.occurrences)} times`,
      `Last seen ${loudest.lastOccurred}. The highest-volume alarm in the deployment.`)
  }

  // --- profiling coverage ---
  const unknownProfile = a.endpointProfiles.find(p => /^unknown$/i.test(p.label))
  const profileTotal = a.endpointProfiles.reduce((s, p) => s + p.count, 0)
  if (unknownProfile && profileTotal && unknownProfile.count / profileTotal > 0.5) {
    add('medium',
      `${pctOf(unknownProfile.count, profileTotal)} of endpoints are profiled as Unknown`,
      `${num(unknownProfile.count)} of ${num(profileTotal)}. Profiling probes are not identifying ` +
      `these devices, which limits what authorization policy can match on.`)
  }

  // --- identity group coverage ---
  const unknownGroup = a.identityGroups.find(g => /^unknown$/i.test(g.label))
  const groupTotal = a.identityGroups.reduce((s, g) => s + g.count, 0)
  if (unknownGroup && groupTotal && unknownGroup.count / groupTotal > 0.5) {
    add('info',
      `${pctOf(unknownGroup.count, groupTotal)} of authentications come from the Unknown identity group`,
      `${num(unknownGroup.count)} of ${num(groupTotal)}. Normal on an estate authenticating by ` +
      `certificate, worth checking if you expect endpoints to be grouped.`)
  }

  // --- top failure reason ---
  const topFailure = a.failureReasons[0]
  if (topFailure && a.totals.failures) {
    add('medium',
      `${topFailure.code || 'Top failure'} is ${pctOf(topFailure.count, a.totals.failures)} of all failures`,
      `${num(topFailure.count)} occurrences. ${topFailure.text}`)
  }

  // --- stale endpoint records ---
  if (a.totals.disconnected && a.totals.connected) {
    const ratio = a.totals.disconnected / (a.totals.connected + a.totals.disconnected)
    if (ratio > 0.9) {
      add('info', `${pctOf(a.totals.disconnected, a.totals.connected + a.totals.disconnected)} of known endpoints are disconnected`,
        `${num(a.totals.connected)} connected against ${num(a.totals.disconnected)} disconnected. ` +
        `Expected on an estate with mobile devices, but worth an endpoint purge policy if the ` +
        `database is growing without limit.`)
    }
  }

  const rank: Record<string, number> = { high: 0, medium: 1, info: 2 }
  out.sort((x, y) => (rank[x.severity] ?? 9) - (rank[y.severity] ?? 9))
  return out
}

export function dashboardToCsv(a: DashboardAnalysis): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = ['Section,Key,Value']
  for (const m of a.metrics) lines.push(['Metric', m.label, m.count].map(esc).join(','))
  for (const nd of a.nodes) {
    lines.push(['Node avg latency ms', nd.name, nd.avgLatency].map(esc).join(','))
    lines.push(['Node peak latency ms', nd.name, nd.peakLatency].map(esc).join(','))
    lines.push(['Node avg CPU %', nd.name, nd.avgCpu].map(esc).join(','))
    lines.push(['Node avg memory %', nd.name, nd.avgMemory].map(esc).join(','))
  }
  for (const al of a.alarms) lines.push(['Alarm', al.name, al.occurrences].map(esc).join(','))
  for (const f of a.failureReasons) lines.push(['Failure reason', `${f.code} ${f.text}`, f.count].map(esc).join(','))
  for (const p of a.endpointProfiles) lines.push(['Endpoint profile', p.label, p.count].map(esc).join(','))
  for (const d of a.networkDevices) lines.push(['Network device', d.label, d.count].map(esc).join(','))
  for (const s of a.identityStores) lines.push(['Identity store', s.label, s.count].map(esc).join(','))
  for (const g of a.identityGroups) lines.push(['Identity group', g.label, g.count].map(esc).join(','))
  return lines.join('\n')
}
