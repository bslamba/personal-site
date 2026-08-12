// ============================================================
// lib/tools/kpm.ts
//
// Analysis engine for the Cisco ISE Key Performance Metrics
// report.
//
// A completely different shape to the RADIUS Authentications
// export. That one is a list of events; this is a set of gauges
// sampled hourly, one row per node per sample. So it gets its own
// model rather than being forced through the same aggregator.
//
// It is small — a day of a 24-node deployment is 288 rows — so
// there is no need for the columnar encoding the RADIUS side uses.
// Plain objects are clearer and fast enough.
// ============================================================

import { parseTimestamp } from './radius'

// ------------------------------------------------------------
// 1. COLUMNS
// ------------------------------------------------------------

export type KpmField =
  | 'timestamp' | 'server' | 'tps' | 'requestsHr' | 'latency'
  | 'avgLoad' | 'maxLoad' | 'noiseHr' | 'suppressionPct' | 'loggedToMntHr'

const ALIASES: Record<KpmField, string[]> = {
  timestamp:      ['loggedat', 'timestamp', 'time', 'date'],
  server:         ['server', 'isenode', 'nodename', 'acsserver'],
  tps:            ['avgtps', 'tps', 'averagetps'],
  requestsHr:     ['radiusrequestshr', 'radiusrequests', 'requestshr'],
  latency:        ['avglatencyperreq', 'averagelatencyperrequest', 'avglatency', 'latency'],
  avgLoad:        ['avgload', 'averageload'],
  maxLoad:        ['maxload', 'maximumload'],
  noiseHr:        ['noisehr', 'noise'],
  suppressionPct: ['suppressionhr', 'suppression', 'suppressionpct'],
  loggedToMntHr:  ['loggedtomnthr', 'loggedtomnt'],
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export type KpmColumnMap = Partial<Record<KpmField, string>>

export function detectKpmColumns(headers: string[]): KpmColumnMap {
  const byNorm = new Map<string, string>()
  for (const h of headers) byNorm.set(norm(h), h)

  const map: KpmColumnMap = {}
  for (const field of Object.keys(ALIASES) as KpmField[]) {
    for (const alias of ALIASES[field]) {
      const hit = byNorm.get(alias)
      if (hit) { map[field] = hit; break }
    }
  }
  return map
}

const METRIC_FIELDS: KpmField[] = [
  'tps', 'requestsHr', 'latency', 'avgLoad', 'maxLoad',
  'noiseHr', 'suppressionPct', 'loggedToMntHr',
]

/** A server column plus at least two of the gauges. */
export function looksLikeKpm(headers: string[]): boolean {
  const map = detectKpmColumns(headers)
  if (!map.server) return false
  return METRIC_FIELDS.filter(f => map[f]).length >= 2
}

/**
 * What kind of ISE report is this?
 * Checked in order — KPM first, because its SERVER column would
 * otherwise satisfy the looser RADIUS test.
 */
export function detectReportKind(
  headers: string[],
  looksLikeRadiusFn: (headers: string[]) => boolean,
): 'kpm' | 'radius' | null {
  if (looksLikeKpm(headers)) return 'kpm'
  if (looksLikeRadiusFn(headers)) return 'radius'
  return null
}

// ------------------------------------------------------------
// 2. MODEL
// ------------------------------------------------------------

export type NodeRole = 'PSN' | 'MnT' | 'PAN' | 'Unknown'

/**
 * Role is taken from the node name, which follows a convention
 * rather than a standard — WAPSN / WAMNT / WAPAN here. It is only
 * used for grouping and to avoid flagging a monitoring node for
 * handling no RADIUS. Anything unrecognised stays Unknown and is
 * judged on its numbers instead.
 */
export function nodeRole(name: string): NodeRole {
  const u = name.toUpperCase()
  if (/PSN/.test(u)) return 'PSN'
  if (/MNT/.test(u)) return 'MnT'
  if (/PAN/.test(u)) return 'PAN'
  return 'Unknown'
}

export interface KpmSample {
  ts: number
  server: string
  tps: number
  requestsHr: number
  latency: number
  avgLoad: number
  maxLoad: number
  noiseHr: number
  suppressionPct: number
  loggedToMntHr: number
}

export interface KpmData {
  samples: KpmSample[]
  headers: string[]
  sources: string[]
  /** counts of values that came back below zero, by metric */
  negatives: Record<string, number>
}

export class KpmBuilder {
  private map: KpmColumnMap = {}
  private headers: string[] = []
  private headerSet = new Set<string>()
  private samples: KpmSample[] = []
  private sources: string[] = []
  private negatives: Record<string, number> = {}

  setSource(headers: string[], name: string): void {
    this.map = detectKpmColumns(headers)
    if (!this.sources.includes(name)) this.sources.push(name)
    for (const h of headers) {
      if (!this.headerSet.has(h)) { this.headerSet.add(h); this.headers.push(h) }
    }
  }

  get count() { return this.samples.length }

  push(rec: Record<string, string>): void {
    const text = (f: KpmField): string => {
      const col = this.map[f]
      if (!col) return ''
      const v = rec[col]
      return v == null ? '' : String(v).trim()
    }
    const num = (f: KpmField): number => {
      const raw = text(f)
      if (raw === '') return 0
      const v = Number(raw.replace(/,/g, ''))
      if (!Number.isFinite(v)) return 0
      if (v < 0) this.negatives[f] = (this.negatives[f] ?? 0) + 1
      return v
    }

    const server = text('server')
    if (!server) return

    this.samples.push({
      ts: parseTimestamp(text('timestamp')),
      server,
      tps: num('tps'),
      requestsHr: num('requestsHr'),
      latency: num('latency'),
      avgLoad: num('avgLoad'),
      maxLoad: num('maxLoad'),
      noiseHr: num('noiseHr'),
      suppressionPct: num('suppressionPct'),
      loggedToMntHr: num('loggedToMntHr'),
    })
  }

  finish(): KpmData {
    return {
      samples: this.samples,
      headers: this.headers,
      sources: this.sources,
      negatives: this.negatives,
    }
  }
}

// ------------------------------------------------------------
// 3. ANALYSIS
// ------------------------------------------------------------

export interface KpmNode {
  server: string
  role: NodeRole
  samples: number
  /** true if it handled any RADIUS at all during the window */
  serving: boolean
  requestsAvg: number
  requestsMax: number
  requestsTotal: number
  share: number
  tpsAvg: number
  tpsMax: number
  latencyAvg: number
  latencyMax: number
  loadAvg: number
  loadMax: number
  noiseTotal: number
  suppressionAvg: number
  mntTotal: number
  /** requests per hour at each sample, for the sparkline */
  series: number[]
}

export interface KpmSite {
  site: string
  nodes: number
  serving: number
  requestsAvg: number
  share: number
  loadAvg: number
  latencyAvg: number
}

/**
 * Nodes are grouped by the first two segments of their name —
 * "T-LD6-PR-WAPSN-114" becomes "T-LD6". A naming convention, not a
 * standard, so this is presentation only; nothing is diagnosed from it.
 */
export function siteOf(server: string): string {
  const m = /^([A-Za-z0-9]+[-_][A-Za-z0-9]+)/.exec(server)
  return m ? m[1] : server
}

export interface KpmPoint {
  ts: number
  requests: number
  tps: number
  loadAvg: number
  latencyAvg: number
  mnt: number
}

export interface KpmFinding {
  headline: string
  detail: string
  severity: 'high' | 'medium' | 'info'
  server?: string
}

export interface KpmAnalysis {
  rows: number
  sources: string[]
  nodes: KpmNode[]
  serving: KpmNode[]
  sites: KpmSite[]
  windowStart: number
  windowEnd: number
  windowMs: number
  sampleTimes: number[]
  intervalMs: number
  timeline: KpmPoint[]
  totals: {
    requestsTotal: number
    requestsPerHourAvg: number
    /** Highest TPS reached by any single node — the figure ISE sizing is about. */
    tpsPeakNode: number
    tpsPeakNodeName: string
    /** Sum across every node at one sample. A deployment aggregate, not a node figure. */
    tpsPeakDeployment: number
    latencyWorst: number
    loadPeak: number
    noiseTotal: number
    mntTotal: number
    suppressionAvg: number
  }
  imbalanceRatio: number
  findings: KpmFinding[]
  negatives: Record<string, number>
}

const mean = (v: number[]) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0
const median = (v: number[]) => {
  if (!v.length) return 0
  const s = [...v].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export function analyseKpm(data: KpmData): KpmAnalysis {
  const samples = data.samples

  const times = [...new Set(samples.map(s => s.ts).filter(t => !Number.isNaN(t)))].sort((a, b) => a - b)
  const windowStart = times[0] ?? 0
  const windowEnd = times[times.length - 1] ?? 0

  // The gap between consecutive samples, taken as the median so one
  // missed collection does not distort it.
  const gaps: number[] = []
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1])
  const intervalMs = gaps.length ? median(gaps) : 3_600_000

  // ---- per node ----
  const byServer = new Map<string, KpmSample[]>()
  for (const s of samples) {
    const list = byServer.get(s.server)
    if (list) list.push(s)
    else byServer.set(s.server, [s])
  }

  const nodes: KpmNode[] = []
  for (const [server, list] of byServer) {
    const ordered = [...list].sort((a, b) => a.ts - b.ts)
    const req = ordered.map(s => s.requestsHr)
    const requestsAvg = mean(req)
    // Each row reports a rate per hour, so total over the window is
    // the mean rate multiplied by the number of hours covered.
    const hours = (intervalMs / 3_600_000) * ordered.length
    nodes.push({
      server,
      role: nodeRole(server),
      samples: ordered.length,
      serving: Math.max(0, ...req) > 0,
      requestsAvg,
      requestsMax: Math.max(0, ...req),
      requestsTotal: requestsAvg * hours,
      share: 0,
      tpsAvg: mean(ordered.map(s => s.tps)),
      tpsMax: Math.max(0, ...ordered.map(s => s.tps)),
      latencyAvg: mean(ordered.map(s => s.latency)),
      latencyMax: Math.max(0, ...ordered.map(s => s.latency)),
      loadAvg: mean(ordered.map(s => s.avgLoad)),
      loadMax: Math.max(0, ...ordered.map(s => s.maxLoad)),
      noiseTotal: ordered.reduce((a, s) => a + Math.max(0, s.noiseHr), 0),
      suppressionAvg: mean(ordered.map(s => s.suppressionPct)),
      mntTotal: ordered.reduce((a, s) => a + Math.max(0, s.loggedToMntHr), 0),
      series: req,
    })
  }

  const requestsTotal = nodes.reduce((a, x) => a + x.requestsTotal, 0)
  for (const x of nodes) x.share = requestsTotal > 0 ? x.requestsTotal / requestsTotal : 0
  nodes.sort((a, b) => b.requestsTotal - a.requestsTotal)

  const serving = nodes.filter(x => x.serving)

  // ---- timeline ----
  const timeline: KpmPoint[] = times.map(t => {
    const at = samples.filter(s => s.ts === t)
    return {
      ts: t,
      requests: at.reduce((a, s) => a + Math.max(0, s.requestsHr), 0),
      tps: at.reduce((a, s) => a + Math.max(0, s.tps), 0),
      loadAvg: mean(at.map(s => s.avgLoad)),
      latencyAvg: mean(at.filter(s => s.requestsHr > 0).map(s => s.latency)),
      mnt: at.reduce((a, s) => a + Math.max(0, s.loggedToMntHr), 0),
    }
  })

  // ---- headline numbers ----
  // Per-node peak is kept separate from the deployment sum on purpose.
  // TPS is a per-node sizing measure, so presenting a summed figure
  // under a "TPS" label reads as a node figure many times over budget.
  const busiestNode = nodes.reduce(
    (best, x) => (x.tpsMax > (best?.tpsMax ?? -1) ? x : best),
    undefined as KpmNode | undefined,
  )

  const totals = {
    requestsTotal,
    requestsPerHourAvg: nodes.reduce((a, x) => a + x.requestsAvg, 0),
    tpsPeakNode: busiestNode?.tpsMax ?? 0,
    tpsPeakNodeName: busiestNode?.server ?? '',
    tpsPeakDeployment: Math.max(0, ...timeline.map(p => p.tps)),
    latencyWorst: Math.max(0, ...serving.map(x => x.latencyMax)),
    loadPeak: Math.max(0, ...nodes.map(x => x.loadMax)),
    noiseTotal: nodes.reduce((a, x) => a + x.noiseTotal, 0),
    mntTotal: nodes.reduce((a, x) => a + x.mntTotal, 0),
    suppressionAvg: mean(serving.map(x => x.suppressionAvg)),
  }

  // Measured against the median rather than the quietest node. The
  // quietest is often a near-idle standby, which produces a ratio in
  // the thousands and tells you nothing.
  const servingMedian = median(serving.map(x => x.requestsAvg))
  const imbalanceRatio = serving.length && servingMedian > 0
    ? serving[0].requestsAvg / servingMedian
    : 0

  // ---- sites ----
  const bySite = new Map<string, KpmNode[]>()
  for (const x of nodes) {
    const key = siteOf(x.server)
    const list = bySite.get(key)
    if (list) list.push(x)
    else bySite.set(key, [x])
  }
  const sites: KpmSite[] = [...bySite.entries()].map(([site, list]) => ({
    site,
    nodes: list.length,
    serving: list.filter(x => x.serving).length,
    requestsAvg: list.reduce((a, x) => a + x.requestsAvg, 0),
    share: 0,
    loadAvg: mean(list.map(x => x.loadAvg)),
    latencyAvg: mean(list.filter(x => x.serving).map(x => x.latencyAvg)),
  })).sort((a, b) => b.requestsAvg - a.requestsAvg)
  const siteTotal = sites.reduce((a, s) => a + s.requestsAvg, 0)
  for (const s of sites) s.share = siteTotal > 0 ? s.requestsAvg / siteTotal : 0

  return {
    rows: samples.length,
    sources: data.sources,
    nodes, serving, sites,
    windowStart, windowEnd,
    windowMs: Math.max(0, windowEnd - windowStart),
    sampleTimes: times,
    intervalMs,
    timeline,
    totals,
    imbalanceRatio,
    findings: buildKpmFindings(nodes, serving, imbalanceRatio, servingMedian, data.negatives),
    negatives: data.negatives,
  }
}

// ------------------------------------------------------------
// 4. FINDINGS
// ------------------------------------------------------------

const num = (v: number) => Math.round(v).toLocaleString()

/** Name several nodes without producing a wall of near-identical cards. */
function listNodes(list: KpmNode[], render: (x: KpmNode) => string): string {
  const shown = list.slice(0, 4).map(render)
  const rest = list.length - shown.length
  return shown.join(', ') + (rest > 0 ? `, and ${rest} more` : '')
}

function buildKpmFindings(
  nodes: KpmNode[],
  serving: KpmNode[],
  imbalance: number,
  servingMedian: number,
  negatives: Record<string, number>,
): KpmFinding[] {
  const out: KpmFinding[] = []

  // --- load distribution ---
  if (serving.length >= 3 && imbalance >= 2) {
    const busiest = serving[0]
    out.push({
      severity: imbalance >= 4 ? 'medium' : 'info',
      server: busiest.server,
      headline: 'RADIUS load is spread unevenly across the nodes',
      detail:
        `${busiest.server} averaged ${num(busiest.requestsAvg)} requests an hour, ` +
        `${imbalance.toFixed(1)} times the median of ${num(servingMedian)} across the ` +
        `${serving.length} nodes handling RADIUS. Some of this is expected when nodes ` +
        `serve different sites or policy sets — worth confirming it matches the RADIUS ` +
        `server lists on your network devices rather than assuming it is a fault.`,
    })
  }

  // --- policy nodes doing nothing ---
  const psns = nodes.filter(x => x.role === 'PSN')
  const idle = psns.filter(x => !x.serving)
  if (idle.length) {
    out.push({
      severity: 'medium',
      headline: idle.length === 1
        ? `${idle[0].server} handled no RADIUS at all`
        : `${idle.length} policy nodes handled no RADIUS at all`,
      detail:
        `${listNodes(idle, x => x.server)} processed zero requests across the whole ` +
        `window. Either they are absent from the RADIUS server list on every network ` +
        `device, out of service, or standbys that were never called on.`,
    })
  }

  const psnMedian = median(psns.filter(x => x.serving).map(x => x.requestsAvg))
  const barely = psns.filter(x => x.serving && psnMedian > 0 && x.requestsAvg < psnMedian * 0.02)
  if (barely.length) {
    out.push({
      severity: 'info',
      headline: barely.length === 1
        ? `${barely[0].server} is barely used`
        : `${barely.length} policy nodes are barely used`,
      detail:
        `${listNodes(barely, x => `${x.server} (${num(x.requestsAvg)}/hr)`)} — under two ` +
        `per cent of the ${num(psnMedian)} an hour median across the other policy nodes. ` +
        `Worth confirming that is deliberate.`,
    })
  }

  // --- latency outliers, judged against the nodes doing real work ---
  const busy = serving.filter(x => x.requestsAvg > 100)
  const latMedian = median(busy.map(x => x.latencyAvg))
  const slow = serving
    .filter(x => x.latencyAvg > 1 && (latMedian === 0 || x.latencyAvg > Math.max(latMedian * 10, 1)))
    .sort((a, b) => b.latencyAvg - a.latencyAvg)
  if (slow.length) {
    out.push({
      severity: slow[0].latencyAvg > 5 ? 'high' : 'medium',
      server: slow[0].server,
      headline: slow.length === 1
        ? `${slow[0].server} is slow to process requests`
        : `${slow.length} nodes are slow to process requests`,
      detail:
        `${listNodes(slow, x => `${x.server} ${x.latencyAvg.toFixed(2)}ms`)}, against ` +
        `${latMedian.toFixed(2)}ms across the busy nodes. On a lightly loaded node this ` +
        `usually points at the identity store or a network path rather than the node itself.`,
    })
  }

  // --- system load ---
  const hot = nodes.filter(x => x.loadMax >= 80 || x.loadAvg >= 60)
                   .sort((a, b) => b.loadMax - a.loadMax)
  if (hot.length) {
    out.push({
      severity: hot[0].loadMax >= 90 ? 'high' : 'medium',
      server: hot[0].server,
      headline: hot.length === 1
        ? `${hot[0].server} is running hot`
        : `${hot.length} nodes are running hot`,
      detail:
        `${listNodes(hot, x => `${x.server} peaked at ${x.loadMax.toFixed(0)}`)}. ` +
        `Sustained load at this level leaves no headroom for a failover.`,
    })
  }

  // --- suppression, which is really a story about endpoints ---
  const suppressing = serving
    .filter(x => x.suppressionAvg >= 25 && x.requestsAvg > 50)
    .sort((a, b) => b.suppressionAvg - a.suppressionAvg)
  if (suppressing.length) {
    out.push({
      severity: suppressing[0].suppressionAvg >= 60 ? 'medium' : 'info',
      headline: suppressing.length === 1
        ? `${suppressing[0].server} is suppressing ${suppressing[0].suppressionAvg.toFixed(0)}% of its logging`
        : `${suppressing.length} nodes are suppressing a large share of their logging`,
      detail:
        `${listNodes(suppressing, x => `${x.server} ${x.suppressionAvg.toFixed(0)}%`)}. ` +
        `Suppression means ISE decided a large share of authentications were repeats not ` +
        `worth writing to MnT. It protects the database, but it normally means endpoints ` +
        `are re-authenticating far more often than they need to — worth looking at session ` +
        `timeouts and reauthentication timers.`,
    })
  }

  // --- data quality ---
  const negTotal = Object.values(negatives).reduce((a, b) => a + b, 0)
  if (negTotal > 0) {
    const which = Object.entries(negatives)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} (${v})`)
      .join(', ')
    out.push({
      severity: 'info',
      headline: 'Some counters came back negative',
      detail:
        `${negTotal} value${negTotal === 1 ? '' : 's'} below zero: ${which}. These are ` +
        `deltas between snapshots, so a node restart or a counter reset inside the ` +
        `window produces a negative. Treated as zero in the totals above.`,
    })
  }

  const rank = { high: 0, medium: 1, info: 2 }
  out.sort((a, b) => rank[a.severity] - rank[b.severity])
  return out
}

// ------------------------------------------------------------
// 5. EXPORT
// ------------------------------------------------------------

export function kpmToCsv(a: KpmAnalysis): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [[
    'Server', 'Role', 'Samples', 'Serving RADIUS',
    'Requests/hr avg', 'Requests/hr peak', 'Share %',
    'TPS avg', 'TPS peak', 'Latency avg ms', 'Latency peak ms',
    'Load avg', 'Load peak', 'Noise total', 'Suppression %', 'Logged to MnT',
  ].join(',')]

  for (const x of a.nodes) {
    lines.push([
      x.server, x.role, x.samples, x.serving ? 'yes' : 'no',
      Math.round(x.requestsAvg), Math.round(x.requestsMax), (x.share * 100).toFixed(2),
      x.tpsAvg.toFixed(2), x.tpsMax.toFixed(2),
      x.latencyAvg.toFixed(3), x.latencyMax.toFixed(3),
      x.loadAvg.toFixed(2), x.loadMax.toFixed(2),
      Math.round(x.noiseTotal), x.suppressionAvg.toFixed(2), Math.round(x.mntTotal),
    ].map(esc).join(','))
  }
  return lines.join('\n')
}
