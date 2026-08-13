// ============================================================
// lib/tools/sessions.ts
//
// Analysis engine for the Cisco ISE "Current Active Sessions"
// export.
//
// Different again from the other two reports. RADIUS
// Authentications is a list of events and Key Performance
// Metrics is a set of gauges; this is a SNAPSHOT — every row is
// a session that was live at the moment the export ran. So there
// is no pass or fail, and the interesting questions are about
// distribution and staleness rather than success rate.
// ============================================================

export interface KeyCount { key: string; count: number }

// ------------------------------------------------------------
// columns
// ------------------------------------------------------------
export type SessionField =
  | 'initiated' | 'updated' | 'sessionTime' | 'identity' | 'endpointId'
  | 'securityGroup' | 'ipAddress' | 'authMethod' | 'authProtocol'
  | 'authenticationPolicy' | 'authorizationPolicy' | 'authorizationProfiles'
  | 'postureStatus' | 'endpointProfile' | 'sessionStatus' | 'ancStatus'
  | 'server' | 'auditSessionId' | 'nasIp' | 'devicePort' | 'wlcRoam'
  | 'packetsIn' | 'packetsOut' | 'bytesIn' | 'bytesOut'
  | 'userType' | 'sessionSource' | 'licenseType' | 'licenseDetails'
  | 'macAddress' | 'provider' | 'virtualNetwork' | 'userDomain' | 'adResolved'

const ALIASES: Record<SessionField, string[]> = {
  initiated:             ['initiated'],
  updated:               ['updated'],
  sessionTime:           ['sessiontime'],
  identity:              ['identity'],
  endpointId:            ['endpointid'],
  securityGroup:         ['securitygroup'],
  ipAddress:             ['ipaddress'],
  authMethod:            ['authmethod', 'authenticationmethod'],
  authProtocol:          ['authprotocol', 'authenticationprotocol'],
  authenticationPolicy:  ['authenticationpolicy'],
  authorizationPolicy:   ['authorizationpolicy'],
  authorizationProfiles: ['authorizationprofiles', 'authorizationprofile'],
  postureStatus:         ['posturestatus'],
  endpointProfile:       ['endpointprofile'],
  sessionStatus:         ['sessionstatus'],
  ancStatus:             ['ancstatus'],
  server:                ['server', 'isenode', 'acsserver'],
  auditSessionId:        ['auditsessionid'],
  nasIp:                 ['nasipaddress', 'nasip'],
  devicePort:            ['deviceport'],
  wlcRoam:               ['wlcroam'],
  packetsIn:             ['packetsin'],
  packetsOut:            ['packetsout'],
  bytesIn:               ['bytesin'],
  bytesOut:              ['bytesout'],
  userType:              ['usertype'],
  sessionSource:         ['sessionsource'],
  licenseType:           ['licensetype', 'licencetype'],
  licenseDetails:        ['licensedetails', 'licencedetails'],
  macAddress:            ['macaddress'],
  provider:              ['provider'],
  virtualNetwork:        ['virtualnetwork'],
  userDomain:            ['userdomainname'],
  adResolved:            ['aduserresolvedidentities'],
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export type SessionColumnMap = Partial<Record<SessionField, string>>

export function detectSessionColumns(headers: string[]): SessionColumnMap {
  const byNorm = new Map<string, string>()
  for (const h of headers) byNorm.set(norm(h), h)
  const map: SessionColumnMap = {}
  for (const field of Object.keys(ALIASES) as SessionField[]) {
    for (const alias of ALIASES[field]) {
      const hit = byNorm.get(alias)
      if (hit) { map[field] = hit; break }
    }
  }
  return map
}

/** A session status or audit session id, plus an endpoint and a server. */
export function looksLikeSessions(headers: string[]): boolean {
  const m = detectSessionColumns(headers)
  const anchors = [m.sessionStatus, m.auditSessionId].filter(Boolean).length
  const support = [m.endpointId, m.macAddress, m.server, m.identity].filter(Boolean).length
  return anchors >= 1 && support >= 2
}

// ------------------------------------------------------------
// model
// ------------------------------------------------------------
class Counter {
  private m = new Map<string, number>()
  constructor(private cap = 50000) {}
  add(k: string, n = 1) {
    const cur = this.m.get(k)
    if (cur !== undefined) this.m.set(k, cur + n)
    else if (this.m.size < this.cap) this.m.set(k, n)
  }
  get(k: string) { return this.m.get(k) ?? 0 }
  get size() { return this.m.size }
  top(limit = 30): KeyCount[] {
    return [...this.m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
      .map(([key, count]) => ({ key, count }))
  }
  all(): KeyCount[] { return [...this.m.entries()].map(([key, count]) => ({ key, count })) }
}

export interface SessionsAnalysis {
  rows: number
  files: string[]
  dims: Record<string, KeyCount[]>
  distinct: Record<string, number>
  /** sessions per ISE node, the headline breakdown */
  byNode: { node: string; sessions: number; share: number; endpoints: number }[]
  traffic: {
    bytesIn: number; bytesOut: number
    packetsIn: number; packetsOut: number
    idleSessions: number
    topTalkers: { key: string; bytes: number }[]
  }
  sessionAge: { buckets: KeyCount[]; longest: number; median: number }
  ipFamilies: { v4Only: number; dual: number; none: number }
  duplicates: { key: string; nodes: string[] }[]
  findings: { severity: string; headline: string; detail: string }[]
}

const DIMS = [
  'server', 'nasIp', 'authMethod', 'authProtocol', 'authenticationPolicy',
  'authorizationPolicy', 'authorizationProfiles', 'postureStatus',
  'endpointProfile', 'sessionStatus', 'ancStatus', 'securityGroup',
  'userType', 'sessionSource', 'licenseType', 'provider', 'virtualNetwork',
  'identity', 'endpointId', 'wlcRoam', 'userDomain',
] as const

export const SESSION_DIM_LABELS: Record<string, string> = {
  server: 'ISE node', nasIp: 'NAD IP address', authMethod: 'Authentication method',
  authProtocol: 'Authentication protocol', authenticationPolicy: 'Authentication policy',
  authorizationPolicy: 'Authorization policy', authorizationProfiles: 'Authorization profile',
  postureStatus: 'Posture status', endpointProfile: 'Endpoint profile',
  sessionStatus: 'Session status', ancStatus: 'ANC status', securityGroup: 'Security group',
  userType: 'User type', sessionSource: 'Session source', licenseType: 'Licence type',
  provider: 'Provider', virtualNetwork: 'Virtual network', identity: 'Identity',
  endpointId: 'Endpoint', wlcRoam: 'WLC roam', userDomain: 'User domain',
}

export class SessionsBuilder {
  private map: SessionColumnMap = {}
  private counters: Record<string, Counter> = {}
  private sources: string[] = []
  private bytesIn = 0; private bytesOut = 0
  private packetsIn = 0; private packetsOut = 0
  private idle = 0
  private talkers = new Counter(60000)
  private ages: number[] = []
  private ageBuckets = new Counter(20)
  private v4Only = 0; private dual = 0; private noIp = 0
  private endpointNodes = new Map<string, Set<string>>()
  private nodeEndpoints = new Map<string, Set<string>>()
  private n = 0

  constructor() { for (const d of DIMS) this.counters[d] = new Counter() }

  get count() { return this.n }

  setSource(headers: string[], name: string) {
    this.map = detectSessionColumns(headers)
    if (!this.sources.includes(name)) this.sources.push(name)
  }

  push(rec: Record<string, string>) {
    const get = (f: SessionField): string => {
      const col = this.map[f]
      if (!col) return ''
      const v = rec[col]
      // ISE writes a single space for empty cells rather than leaving them blank
      return v == null ? '' : String(v).trim()
    }
    const num = (f: SessionField): number => {
      const v = Number(get(f).replace(/,/g, ''))
      return Number.isFinite(v) ? v : 0
    }

    const status = get('sessionStatus')
    if (!status && !get('auditSessionId')) return
    this.n++

    for (const d of DIMS) {
      const v = get(d as SessionField)
      this.counters[d].add(v || '(not set)')
    }

    const bIn = num('bytesIn'), bOut = num('bytesOut')
    this.bytesIn += bIn
    this.bytesOut += bOut
    this.packetsIn += num('packetsIn')
    this.packetsOut += num('packetsOut')
    if (bIn === 0 && bOut === 0) this.idle++

    const who = get('identity') || get('endpointId') || get('macAddress')
    if (who && (bIn + bOut) > 0) this.talkers.add(who, bIn + bOut)

    const age = num('sessionTime')
    this.ages.push(age)
    this.ageBuckets.add(
      age <= 0 ? 'just started'
        : age < 300 ? 'under 5 min'
        : age < 3600 ? '5-60 min'
        : age < 14400 ? '1-4 hours'
        : age < 86400 ? '4-24 hours'
        : age < 604800 ? '1-7 days'
        : 'over 7 days'
    )

    const ip = get('ipAddress')
    if (!ip) this.noIp++
    else if (ip.includes(':')) this.dual++
    else this.v4Only++

    // The same endpoint holding sessions on two nodes usually means one
    // of them is stale rather than the endpoint being in two places.
    const ep = get('endpointId') || get('macAddress')
    const node = get('server')
    if (ep && node) {
      let set = this.endpointNodes.get(ep)
      if (!set) { set = new Set(); this.endpointNodes.set(ep, set) }
      set.add(node)

      let eps = this.nodeEndpoints.get(node)
      if (!eps) { eps = new Set(); this.nodeEndpoints.set(node, eps) }
      eps.add(ep)
    }
  }

  finish(): SessionsAnalysis {
    const dims: Record<string, KeyCount[]> = {}
    const distinct: Record<string, number> = {}
    for (const d of DIMS) {
      dims[d] = this.counters[d].top(d === 'identity' || d === 'endpointId' ? 50 : 30)
      distinct[d] = this.counters[d].size
    }

    const byNode = this.counters.server.all()
      .filter(x => x.key !== '(not set)')
      .map(x => ({
        node: x.key,
        sessions: x.count,
        share: this.n ? x.count / this.n : 0,
        endpoints: this.nodeEndpoints.get(x.key)?.size ?? 0,
      }))
      .sort((a, b) => b.sessions - a.sessions)

    const sortedAges = [...this.ages].sort((a, b) => a - b)
    const duplicates = [...this.endpointNodes.entries()]
      .filter(([, nodes]) => nodes.size > 1)
      .map(([key, nodes]) => ({ key, nodes: [...nodes] }))
      .slice(0, 40)

    const analysis: SessionsAnalysis = {
      rows: this.n,
      files: this.sources,
      dims, distinct, byNode,
      traffic: {
        bytesIn: this.bytesIn, bytesOut: this.bytesOut,
        packetsIn: this.packetsIn, packetsOut: this.packetsOut,
        idleSessions: this.idle,
        topTalkers: this.talkers.top(20).map(t => ({ key: t.key, bytes: t.count })),
      },
      sessionAge: {
        buckets: this.ageBuckets.all(),
        longest: sortedAges.length ? sortedAges[sortedAges.length - 1] : 0,
        median: sortedAges.length ? sortedAges[Math.floor(sortedAges.length / 2)] : 0,
      },
      ipFamilies: { v4Only: this.v4Only, dual: this.dual, none: this.noIp },
      duplicates,
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
const pct = (v: number) => (v * 100).toFixed(1) + '%'

function buildFindings(a: SessionsAnalysis): SessionsAnalysis['findings'] {
  const out: SessionsAnalysis['findings'] = []
  const add = (severity: string, headline: string, detail: string) =>
    out.push({ severity, headline, detail })

  // --- node distribution ---
  if (a.byNode.length >= 2) {
    const busiest = a.byNode[0]
    const quietest = a.byNode[a.byNode.length - 1]
    const ratio = quietest.sessions > 0 ? busiest.sessions / quietest.sessions : Infinity
    if (ratio >= 2) {
      add(ratio >= 5 ? 'medium' : 'info',
        'Sessions are unevenly spread across nodes',
        `${busiest.node} holds ${num(busiest.sessions)} sessions (${pct(busiest.share)}) while ` +
        `${quietest.node} holds ${num(quietest.sessions)}. Some skew is normal when nodes serve ` +
        `different sites; a large gap is worth checking against the RADIUS server lists on your devices.`)
    }
  }

  // --- posture ---
  const badPosture = (a.dims.postureStatus ?? [])
    .filter(p => /non.?compliant|pending|error/i.test(p.key))
  if (badPosture.length) {
    const total = badPosture.reduce((s, p) => s + p.count, 0)
    add('medium', `${num(total)} sessions are not posture compliant`,
      badPosture.map(p => `${p.key}: ${num(p.count)}`).join(', ') + '.')
  }

  // --- ANC quarantine ---
  const anc = (a.dims.ancStatus ?? []).filter(x => !/^\(not set\)$|^\s*$|none/i.test(x.key))
  if (anc.length) {
    add('high', 'Endpoints are under an ANC policy',
      anc.map(x => `${x.key}: ${num(x.count)}`).join(', ') +
      '. These endpoints have been quarantined or restricted.')
  }

  // --- unknown profiling ---
  const unknown = (a.dims.endpointProfile ?? []).find(p => /^unknown$/i.test(p.key))
  if (unknown && a.rows && unknown.count / a.rows > 0.5) {
    add('medium', `${pct(unknown.count / a.rows)} of sessions have an Unknown endpoint profile`,
      `${num(unknown.count)} of ${num(a.rows)} sessions. Profiling probes are not seeing these ` +
      `endpoints, which limits what your authorization policy can match on.`)
  }

  // --- stale sessions on two nodes ---
  if (a.duplicates.length) {
    add('medium', `${num(a.duplicates.length)} endpoints hold sessions on more than one node`,
      `An endpoint should have one live session. Two usually means one is stale and has not ` +
      `been aged out — worth checking session timeout and accounting on the network devices. ` +
      `First few: ${a.duplicates.slice(0, 3).map(d => d.key).join(', ')}.`)
  }

  // --- idle sessions ---
  if (a.rows && a.traffic.idleSessions / a.rows > 0.5) {
    add('info', `${pct(a.traffic.idleSessions / a.rows)} of sessions show no traffic counters`,
      `${num(a.traffic.idleSessions)} sessions report zero bytes in and out. That normally means ` +
      `RADIUS accounting is not sending interim updates, rather than that the endpoints are silent.`)
  }

  // --- licence mix ---
  const lic = (a.dims.licenseType ?? []).filter(l => l.key !== '(not set)')
  if (lic.length) {
    add('info', 'Licence consumption by type',
      lic.map(l => `${l.key.replace(/\.$/, '')}: ${num(l.count)}`).join(' · ') + '.')
  }

  const rank: Record<string, number> = { high: 0, medium: 1, info: 2 }
  out.sort((x, y) => (rank[x.severity] ?? 9) - (rank[y.severity] ?? 9))
  return out
}

// ------------------------------------------------------------
// export
// ------------------------------------------------------------
export function sessionsToCsv(a: SessionsAnalysis): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = ['Section,Key,Sessions,Share %']
  lines.push(['Overall', 'Active sessions', a.rows, '100'].map(esc).join(','))
  for (const nd of a.byNode) {
    lines.push(['ISE node', nd.node, nd.sessions, (nd.share * 100).toFixed(2)].map(esc).join(','))
  }
  for (const [dim, rows] of Object.entries(a.dims)) {
    for (const r of rows) {
      lines.push([
        SESSION_DIM_LABELS[dim] ?? dim, r.key, r.count,
        a.rows ? (r.count / a.rows * 100).toFixed(2) : '0',
      ].map(esc).join(','))
    }
  }
  return lines.join('\n')
}
