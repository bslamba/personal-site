// ============================================================
// lib/tools/bundle-analyse.ts
//
// Turns the lines of a Cisco ISE support bundle into a report.
//
// Everything is incremental — feed it lines, it keeps counters,
// and at the end it produces a few hundred KB of summary. Nothing
// retains the log itself, which is what lets a multi-gigabyte
// archive be read inside a browser tab.
//
// SPEED
// This walks several million lines, so the hot path avoids regular
// expressions entirely: a line is rejected as a continuation by
// two character comparisons, and fields are cut with indexOf
// rather than matched. Regexes only run on the small fraction of
// lines that are warnings or errors.
//
// MEMORY
// Every counter is capped. Once a map reaches its ceiling it stops
// accepting new keys and only increments ones it already has,
// which keeps a pathological log from exhausting the tab while
// leaving the top-N answers correct.
// ============================================================

import type {
  BundleReport, KeyCount, LogSummary, AreaSummary,
} from './bundle-types'
import { logsForArea, ALL_AREAS, type Resolved, type ParserRole } from './bundle-registry'

// ------------------------------------------------------------
// counters
// ------------------------------------------------------------
class Counter {
  private m = new Map<string, number>()
  constructor(private cap = 20000) {}
  add(k: string, n = 1) {
    const cur = this.m.get(k)
    if (cur !== undefined) this.m.set(k, cur + n)
    else if (this.m.size < this.cap) this.m.set(k, n)
  }
  get(k: string) { return this.m.get(k) ?? 0 }
  get size() { return this.m.size }
  top(limit = 40): KeyCount[] {
    return [...this.m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
      .map(([key, count]) => ({ key, count }))
  }
  all(): KeyCount[] {
    return [...this.m.entries()].map(([key, count]) => ({ key, count }))
  }
}

class Hist {
  private buckets: Int32Array
  private over = 0; private n = 0; private sum = 0; private peak = 0
  constructor(private max = 60000) { this.buckets = new Int32Array(max + 1) }
  add(v: number) {
    if (!Number.isFinite(v) || v < 0) return
    this.n++; this.sum += v
    if (v > this.peak) this.peak = v
    if (v <= this.max) this.buckets[v]++; else this.over++
  }
  private pct(q: number): number {
    const inRange = this.n - this.over
    if (inRange <= 0) return 0
    let seen = 0
    const target = q * inRange
    for (let v = 0; v <= this.max; v++) { seen += this.buckets[v]; if (seen >= target) return v }
    return this.max
  }
  summary() {
    return {
      count: this.n, mean: this.n ? +(this.sum / this.n).toFixed(2) : 0,
      p50: this.pct(0.5), p90: this.pct(0.9), p95: this.pct(0.95), p99: this.pct(0.99),
      max: this.peak,
    }
  }
  histogram(edges = [0, 10, 25, 50, 100, 200, 500, 1000, 2000, 5000, Infinity]) {
    const out: { from: number; to: number | null; count: number }[] = []
    for (let i = 0; i < edges.length - 1; i++) {
      const from = edges[i], to = edges[i + 1]
      let count = 0
      const hi = Math.min(to === Infinity ? this.max + 1 : to, this.max + 1)
      for (let v = from; v < hi; v++) count += this.buckets[v]
      if (to === Infinity) count += this.over
      out.push({ from, to: to === Infinity ? null : to, count })
    }
    return out
  }
}

/** Collapse the variable parts of a message so repeats group together. */
function shapeOf(msg: string): string {
  let s = msg.length > 220 ? msg.slice(0, 220) : msg
  s = s.replace(/0x[0-9a-fA-F]+/g, '0x…')
  s = s.replace(/\b[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}\b/g, 'MAC')
  s = s.replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, 'IP')
  s = s.replace(/\d{3,}/g, 'N')
  return s.slice(0, 150)
}

// ------------------------------------------------------------
// one log family (all rotations of ise-psc.log, say)
// ------------------------------------------------------------
class LogAcc {
  rotations = 0
  bytes = 0
  lines = 0
  parsed = 0
  continuation = 0
  errors = 0
  warnings = 0
  tsMin: string | null = null
  tsMax: string | null = null
  level = new Counter(40)
  component = new Counter(4000)
  problems = new Counter(8000)
  perDay = new Counter(400)

  constructor(public label: string, public role: ParserRole, public areas: string[]) {}

  summary(): LogSummary {
    return {
      label: this.label, role: this.role, areas: this.areas,
      rotations: this.rotations, bytes: this.bytes,
      lines: this.lines, parsed: this.parsed, continuation: this.continuation,
      window: { start: this.tsMin, end: this.tsMax },
      byLevel: this.level.top(12),
      byComponent: this.component.top(30),
      problems: this.problems.top(30),
      perDay: this.perDay.all().sort((a, b) => a.key.localeCompare(b.key)),
      errors: this.errors, warnings: this.warnings,
    }
  }
}

// ------------------------------------------------------------
// prrt rules
// ------------------------------------------------------------
const RUNTIME_RULES: { id: string; needle: string; match?: RegExp; title: string; meaning: string; severity: string }[] = [
  { id: 'messaging-no-route', needle: 'NO_ROUTE',
    title: 'ISE Messaging publish failed — 312 NO_ROUTE',
    meaning: 'Published to a message bus exchange with no matching queue binding. Usually a broken or unregistered messaging relationship.',
    severity: 'high' },
  { id: 'ssl-io-noise', needle: 'non-blocking I/O noise',
    title: 'SSL non-blocking I/O notice',
    meaning: 'Logged at ERROR severity but explicitly described as noise. Excluded from the error counts so they stay meaningful.',
    severity: 'noise' },
  { id: 'ocsp-no-response', needle: 'Failed to get response from OCSP',
    title: 'OCSP responder unreachable',
    meaning: 'Certificate revocation could not be checked. Depending on the certificate authentication profile, an unreachable responder can cause valid certificates to be rejected.',
    severity: 'high' },
  { id: 'ocsp-callback-failed', needle: 'perform OCSP request failed',
    title: 'OCSP callback failed',
    meaning: 'Companion line to the OCSP failure above — the same event, counted separately by ISE.',
    severity: 'medium' },
  { id: 'ocsp-callback-report', needle: 'OCSP Callback - report detailed error',
    title: 'OCSP error reported to customer log',
    meaning: 'Companion line to the OCSP failure above.',
    severity: 'medium' },
  { id: 'no-peer-cert', needle: 'Peer sent no certificate',
    title: 'Client sent no certificate',
    meaning: 'The supplicant opened TLS and offered no client certificate — either not configured for EAP-TLS, or it has none installed.',
    severity: 'medium' },
  { id: 'tls-alert', needle: 'alert was raised',
    title: 'TLS alert from the client',
    meaning: 'The endpoint rejected the exchange. Most often it does not trust the ISE certificate chain.',
    severity: 'medium' },
  { id: 'tls-alert-2', needle: 'Alert raised: code=',
    title: 'TLS alert recorded by the server',
    meaning: 'Companion line to the alert above.',
    severity: 'low' },
  { id: 'handshake-failed', needle: 'handshake failed',
    title: 'TLS handshake failed',
    meaning: 'The TLS session did not complete. Read alongside the alerts above.',
    severity: 'medium' },
  { id: 'eap-abandoned', needle: 'abandoned EAP session',
    title: 'Endpoint abandoned an EAP session',
    meaning: 'A new EAP conversation started before the previous one finished. A few is normal on roaming; many from one MAC is a broken supplicant.',
    severity: 'medium' },
  { id: 'long-step-latency', needle: 'Long step latency',
    title: 'ISE flagged a slow policy step',
    meaning: 'ISE timed one step of the authentication as unusually slow and said so itself.',
    severity: 'medium' },
  { id: 'shutdown-twice', needle: 'shutdown twice',
    title: 'Duplicate secure-connection shutdown',
    meaning: 'Internal bookkeeping notice. Not actionable on its own.',
    severity: 'low' },
]

const LS_HEADER =
  /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\.(\d+)\s+([+-]\d{2}:\d{2})\s+(\d+)\s+(\d+)\s+(\w+)\s+(.*)$/

function splitEscaped(rest: string): string[] {
  const parts: string[] = []
  let buf = ''
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i]
    if (c === '\\') { buf += rest[i + 1] ?? ''; i++; continue }
    if (c === ',') { parts.push(buf); buf = ''; continue }
    buf += c
  }
  if (buf) parts.push(buf)
  return parts
}

// ============================================================
// the aggregator
// ============================================================
export class BundleAggregator {
  private logs = new Map<string, LogAcc>()
  private current: LogAcc | null = null
  private currentRole: ParserRole = 'plain'

  // --- prrt ---
  private prrtRule = new Counter(200)
  private prrtUnmatched = new Counter(8000)
  private prrtAbandoned = new Counter(5000)
  private prrtSlowStep = new Counter(5000)
  private prrtCompLevel = new Counter(200)
  private prrtFirst = new Map<string, string>()
  private prrtLast = new Map<string, string>()
  private prrtParsed = 0

  // --- localstore ---
  private lsFiles: string[] = []
  private codes = new Counter(500)
  private failureCodes = new Counter(500)
  private dims: Record<string, Counter> = {}
  private failDims: Record<string, Counter> = {}
  private stepTime = new Map<number, { ms: number; n: number }>()
  private certDays = new Counter(20)
  private perMinute = new Counter(200000)
  private perMinuteFail = new Counter(200000)
  private totalLatency = new Hist()
  private clientLatency = new Hist()
  private requestLatency = new Hist()
  private records = 0; private passed = 0; private failed = 0
  private lsTsMin: string | null = null
  private lsTsMax: string | null = null
  private soonest: { days: number; subject: string } | null = null
  private utilSamples = 0

  // --- other ---
  private alarmLines = 0
  private alarms = new Counter(4000)
  private sawAlarms = false
  private showtechText = ''
  private catalogue: Record<string, string> = {}

  filesRead: { name: string; bytes: number }[] = []
  archiveEntries = 0
  bytesParsed = 0
  linesParsed = 0

  constructor() {
    for (const k of ['ssid', 'nad', 'nasIp', 'policySet', 'authzRule', 'authzProfile',
      'protocol', 'identityStore', 'issuer', 'tlsVersion', 'tlsCipher', 'deviceType',
      'location', 'endpointProfile', 'endpoint', 'user', 'flowType']) {
      this.dims[k] = new Counter(60000)
    }
    for (const k of ['ssid', 'nad', 'endpoint', 'user']) this.failDims[k] = new Counter(60000)
  }

  // ---------- file lifecycle ----------
  startFile(spec: Resolved, path: string, bytes: number) {
    this.filesRead.push({ name: path, bytes })
    this.bytesParsed += bytes
    this.currentRole = spec.role

    if (spec.role === 'catalogue' || spec.role === 'showtech') { this.current = null; return }

    let acc = this.logs.get(spec.label)
    if (!acc) { acc = new LogAcc(spec.label, spec.role, spec.areas); this.logs.set(spec.label, acc) }
    acc.rotations++
    acc.bytes += bytes
    this.current = acc

    if (spec.role === 'localstore') {
      const base = path.split('/').pop() ?? path
      if (!this.lsFiles.includes(base)) this.lsFiles.push(base)
    }
  }

  /** Route one line to whichever parser the current file needs. */
  line(text: string) {
    this.linesParsed++
    switch (this.currentRole) {
      case 'prrt':       this.prrtLine(text); break
      case 'localstore': this.localStoreLine(text); break
      case 'ise':        this.iseLine(text); break
      case 'alarms':     this.alarmLine(text); break
      case 'catalogue':  this.catalogueLine(text); break
      default:           this.plainLine(text)
    }
  }

  appendShowtech(text: string) {
    if (this.showtechText.length < 12_000_000) this.showtechText += text
  }

  // ------------------------------------------------------------
  // the standard ISE log4j layout
  //   2026-08-12 00:00:00,071 INFO  [thread][[mdc]] logger.Class -:sess::::- message
  // ------------------------------------------------------------
  private iseLine(line: string) {
    const g = this.current
    if (!g) return
    g.lines++

    // Reject continuation lines with two character checks rather than a regex.
    if (line.length < 25 || line.charCodeAt(4) !== 45 || line.charCodeAt(7) !== 45) {
      g.continuation++
      return
    }
    const c0 = line.charCodeAt(0)
    if (c0 < 48 || c0 > 57) { g.continuation++; return }

    g.parsed++

    const day = line.slice(0, 10)
    const ts = line.slice(0, 19)
    if (g.tsMin === null || ts < g.tsMin) g.tsMin = ts
    if (g.tsMax === null || ts > g.tsMax) g.tsMax = ts
    g.perDay.add(day)

    // level
    let i = 23
    while (i < line.length && line.charCodeAt(i) === 32) i++
    let j = i
    while (j < line.length && line.charCodeAt(j) !== 32) j++
    const level = line.slice(i, j)
    g.level.add(level)

    const isError = level === 'ERROR' || level === 'FATAL'
    const isWarn = level === 'WARN'
    if (isError) g.errors++
    else if (isWarn) g.warnings++

    // component: the logger name after the "[[...]] " block
    const b = line.indexOf(']] ', j)
    if (b !== -1) {
      const start = b + 3
      let end = line.indexOf(' ', start)
      if (end === -1) end = line.length
      const full = line.slice(start, end)
      // group on the first four segments; the leaf class is too granular
      let dots = 0, cut = full.length
      for (let k = 0; k < full.length; k++) {
        if (full.charCodeAt(k) === 46 && ++dots === 4) { cut = k; break }
      }
      g.component.add(full.slice(0, cut))
    }

    // Message shaping is the expensive part, so only for the lines that matter.
    if (isError || isWarn) {
      const m = line.indexOf(':- ', b === -1 ? j : b)
      const msg = m !== -1 ? line.slice(m + 3) : line.slice(j)
      g.problems.add(`${level} ${shapeOf(msg)}`)
    }
  }

  /** Formats we do not interpret: count volume and dates only. */
  private plainLine(line: string) {
    const g = this.current
    if (!g) return
    g.lines++
    if (line.length < 11) return
    const c0 = line.charCodeAt(0)
    if (c0 >= 48 && c0 <= 57 && line.charCodeAt(4) === 45 && line.charCodeAt(7) === 45) {
      g.parsed++
      const day = line.slice(0, 10)
      g.perDay.add(day)
      const ts = line.slice(0, 19)
      if (g.tsMin === null || ts < g.tsMin) g.tsMin = ts
      if (g.tsMax === null || ts > g.tsMax) g.tsMax = ts
    }
    // cheap severity sniff without parsing the layout
    if (line.indexOf('ERROR') !== -1) { g.errors++; g.level.add('ERROR'); g.problems.add(shapeOf(line)) }
    else if (line.indexOf('WARN') !== -1) { g.warnings++; g.level.add('WARN') }
  }

  // ---------- catalogue ----------
  private catalogueLine(line: string) {
    const s = line.trim()
    if (!s || s.charCodeAt(0) === 35) return
    const eq = s.indexOf('=')
    if (eq === -1) return
    const m = /(\d{4,5})/.exec(s.slice(0, eq))
    if (!m) return
    const text = s.slice(eq + 1).trim()
    if (text && !this.catalogue[m[1]]) this.catalogue[m[1]] = text.slice(0, 160)
  }

  // ---------- alarms ----------
  private alarmLine(line: string) {
    const g = this.current
    if (g) g.lines++
    if (!line.trim()) return
    this.sawAlarms = true
    this.alarmLines++
    this.alarms.add(shapeOf(line).slice(0, 140))
  }

  // ---------- prrt ----------
  private prrtLine(line: string) {
    const g = this.current
    if (g) g.lines++
    if (!line) return

    let start = 0
    const f: string[] = []
    for (let k = 0; k < 5; k++) {
      const i = line.indexOf(',', start)
      if (i === -1) break
      f.push(line.slice(start, i))
      start = i + 1
    }
    if (f.length < 5) { if (g) g.continuation++; return }

    const component = f[0]
    const date = f[1]
    const level = f[3].trim()
    const lastComma = line.lastIndexOf(',')
    const message = lastComma > start ? line.slice(start, lastComma) : line.slice(start)

    this.prrtParsed++
    if (g) {
      g.parsed++
      g.level.add(level)
      g.component.add(component)
      if (level === 'ERROR' || level === 'FATAL') g.errors++
      else if (level === 'WARN') g.warnings++
      const day = date.slice(0, 10)
      if (day.length === 10 && day.charCodeAt(4) === 45) {
        g.perDay.add(day)
        if (g.tsMin === null || date < g.tsMin) g.tsMin = date
        if (g.tsMax === null || date > g.tsMax) g.tsMax = date
      }
    }
    this.prrtCompLevel.add(`${component} ${level}`)

    // substring test first — far cheaper than a regex per rule
    let matched = false
    for (const r of RUNTIME_RULES) {
      if (message.indexOf(r.needle) === -1) continue
      matched = true
      this.prrtRule.add(r.id)
      if (!this.prrtFirst.has(r.id)) this.prrtFirst.set(r.id, date)
      this.prrtLast.set(r.id, date)
      if (r.id === 'eap-abandoned') {
        const m = /\b([0-9a-f]{2}-){5}[0-9a-f]{2}\b/i.exec(message)
        if (m) this.prrtAbandoned.add(m[0].toUpperCase().replace(/-/g, ':'))
      } else if (r.id === 'long-step-latency') {
        const m = /CallingStationID=([0-9A-Fa-f:-]{11,})/.exec(message)
        if (m) this.prrtSlowStep.add(m[1].toUpperCase().replace(/-/g, ':'))
      }
      break
    }
    if (!matched) this.prrtUnmatched.add(shapeOf(message))
  }

  // ---------- localstore ----------
  private localStoreLine(line: string) {
    const g = this.current
    if (g) g.lines++

    const h = LS_HEADER.exec(line)
    if (!h) { if (g) g.continuation++; return }
    if (g) g.parsed++

    const ts = h[1]
    const code = h[5]
    const severity = h[6]
    const rest = h[7]

    if (g) {
      g.level.add(severity)
      const day = ts.slice(0, 10)
      g.perDay.add(day)
      if (g.tsMin === null || ts < g.tsMin) g.tsMin = ts
      if (g.tsMax === null || ts > g.tsMax) g.tsMax = ts
    }

    this.codes.add(code)
    if (this.lsTsMin === null || ts < this.lsTsMin) this.lsTsMin = ts
    if (this.lsTsMax === null || ts > this.lsTsMax) this.lsTsMax = ts

    if (code === '70000' || code === '70001' || code === '70010' || code === '70011') {
      this.utilSamples++
      return
    }

    const isPass = code === '5200'
    const isFail = code === '5400' || code === '5411' || code === '5449'
    if (!isPass && !isFail) return

    this.records++
    if (isPass) this.passed++
    else { this.failed++; this.failureCodes.add(code) }

    const minute = ts.slice(0, 16)
    this.perMinute.add(minute)
    if (isFail) this.perMinuteFail.add(minute)

    const kv: Record<string, string> = {}
    const av: string[] = []
    for (const part of splitEscaped(rest)) {
      const eq = part.indexOf('=')
      if (eq <= 0) continue
      const k = part.slice(0, eq).trim()
      const v = part.slice(eq + 1).trim()
      if (k === 'Step') continue
      if (k === 'cisco-av-pair') { av.push(v); continue }
      if (k === 'StepLatency') {
        for (const pair of v.split(';')) {
          const [idx, msv] = pair.split('=')
          const i = Number(idx), t = Number(msv)
          if (Number.isFinite(i) && Number.isFinite(t) && t > 0) {
            const cur = this.stepTime.get(i) ?? { ms: 0, n: 0 }
            cur.ms += t; cur.n++
            this.stepTime.set(i, cur)
          }
        }
        continue
      }
      if (kv[k] === undefined) kv[k] = v
    }

    let ssid = ''
    for (const a of av) if (a.startsWith('cisco-wlan-ssid=')) { ssid = a.slice(16); break }
    if (!ssid && kv['Called-Station-ID']) {
      const c = kv['Called-Station-ID']
      const i = c.lastIndexOf(':')
      if (i !== -1 && !/^[0-9A-Fa-f]{2}$/.test(c.slice(i + 1))) ssid = c.slice(i + 1)
    }

    const put = (d: string, v: string | undefined) => { if (v) this.dims[d].add(v) }
    put('ssid', ssid || '(wired or unknown)')
    put('nad', kv['NetworkDeviceName'])
    put('nasIp', kv['NAS-IP-Address'])
    put('policySet', kv['ISEPolicySetName'])
    put('authzRule', kv['AuthorizationPolicyMatchedRule'])
    put('authzProfile', kv['SelectedAuthorizationProfiles'])
    put('protocol', kv['EapAuthentication'] || kv['AuthenticationMethod'])
    put('identityStore', kv['SelectedAuthenticationIdentityStores'])
    put('issuer', kv['Issuer - Common Name'])
    put('tlsVersion', kv['TLSVersion'])
    put('tlsCipher', kv['TLSCipher'])
    put('deviceType', kv['Device Type'])
    put('location', kv['Location'])
    put('endpointProfile', kv['EndPointMatchedProfile'])
    put('flowType', kv['RadiusFlowType'])
    put('endpoint', kv['Calling-Station-ID'] || kv['EndPointMACAddress'])
    put('user', kv['User-Name'] || kv['UserName'])

    if (isFail) {
      if (ssid) this.failDims.ssid.add(ssid)
      if (kv['NetworkDeviceName']) this.failDims.nad.add(kv['NetworkDeviceName'])
      if (kv['Calling-Station-ID']) this.failDims.endpoint.add(kv['Calling-Station-ID'])
      if (kv['User-Name']) this.failDims.user.add(kv['User-Name'])
    }

    this.totalLatency.add(Number(kv['TotalAuthenLatency']))
    this.clientLatency.add(Number(kv['ClientLatency']))
    this.requestLatency.add(Number(kv['RequestLatency']))

    const days = Number(kv['Days to Expiry'])
    if (Number.isFinite(days)) {
      const bucket = days < 0 ? 'expired'
        : days < 7 ? '0-6 days' : days < 30 ? '7-29 days'
        : days < 90 ? '30-89 days' : days < 180 ? '90-179 days'
        : days < 365 ? '180-364 days' : '365+ days'
      this.certDays.add(bucket)
      if (this.soonest === null || days < this.soonest.days) {
        this.soonest = { days, subject: (kv['Subject - Common Name'] ?? '').slice(0, 60) }
      }
    }
  }

  // ============================================================
  // finish
  // ============================================================
  finish(source: string, seconds: number): BundleReport {
    const system = this.parseShowtech()
    const logs = [...this.logs.values()].map(l => l.summary())
      .sort((a, b) => b.lines - a.lines)
    const areas = this.buildAreas(logs)
    const runtime = this.buildRuntime()
    const auth = this.buildAuth()
    const app = logs.find(l => l.label === 'ise-psc.log') ?? null
    const alarms = this.sawAlarms
      ? { file: 'alarmexp.txt', lines: this.alarmLines, top: this.alarms.top(25) }
      : null

    const wanted = new Set<string>()
    for (const c of auth?.messageCodes ?? []) wanted.add(c.key)
    for (const c of auth?.failureCodes ?? []) wanted.add(c.key)
    const catalogue: Record<string, string> = {}
    for (const c of wanted) if (this.catalogue[c]) catalogue[c] = this.catalogue[c]

    return {
      kind: 'ise-bundle-report',
      version: 2,
      generated: new Date().toISOString(),
      node: system?.hostname ?? null,
      source,
      system, runtime, auth,
      app: app ? {
        file: 'ise-psc.log', lines: app.lines, window: app.window,
        byLevel: app.byLevel, topProblems: app.problems, perDay: app.perDay,
      } : null,
      alarms,
      catalogue,
      findings: this.buildFindings(system, runtime, auth, logs, areas),
      filesRead: this.filesRead,
      logs, areas,
      stats: {
        archiveEntries: this.archiveEntries,
        filesParsed: this.filesRead.length,
        bytesParsed: this.bytesParsed,
        linesParsed: this.linesParsed,
        seconds: +seconds.toFixed(1),
      },
    }
  }

  private buildAreas(logs: LogSummary[]): AreaSummary[] {
    const byLabel = new Map(logs.map(l => [l.label, l]))
    const out: AreaSummary[] = []

    for (const area of ALL_AREAS) {
      const expected = logsForArea(area)
      const present: string[] = []
      const missing: string[] = []
      let lines = 0, errors = 0, warnings = 0
      const problems = new Counter(2000)

      for (const label of expected) {
        const l = byLabel.get(label)
        if (!l) { missing.push(label); continue }
        present.push(label)
        lines += l.lines
        errors += l.errors
        warnings += l.warnings
        for (const p of l.problems.slice(0, 12)) problems.add(`${label}: ${p.key}`, p.count)
      }

      if (present.length === 0) continue
      out.push({ area, present, missing, lines, errors, warnings, topProblems: problems.top(12) })
    }

    out.sort((a, b) => (b.errors + b.warnings) - (a.errors + a.warnings) || b.lines - a.lines)
    return out
  }

  private parseShowtech(): BundleReport['system'] {
    const text = this.showtechText
    if (!text) return null
    const out: NonNullable<BundleReport['system']> = {
      hostname: null, adeOs: null, adeBuild: null, architecture: null,
      iseVersion: null, buildDate: null, installDate: null,
      patches: [], services: [], sections: [], diskAlerts: [],
    }
    const grab = (re: RegExp) => { const m = re.exec(text); return m ? m[1].trim() : null }

    out.hostname     = grab(/^Hostname:\s*(.+)$/m)
    out.adeOs        = grab(/Application Deployment Engine OS Release:\s*(.+)$/m)
    out.adeBuild     = grab(/ADE-OS Build Version:\s*(.+)$/m)
    out.architecture = grab(/ADE-OS System Architecture:\s*(.+)$/m)

    const block = /Cisco Identity Services Engine(\s+Patch)?\s*\r?\n-+\r?\n([\s\S]{0,240}?)(?=\r?\n\s*\r?\n|Cisco Identity|\*{5})/g
    let m: RegExpExecArray | null
    while ((m = block.exec(text)) !== null) {
      const isPatch = Boolean(m[1])
      const body = m[2]
      const version = /Version\s*:\s*(.+)/.exec(body)?.[1]?.trim()
      const install = /Install Date\s*:\s*(.+)/.exec(body)?.[1]?.trim() ?? null
      const build = /Build Date\s*:\s*(.+)/.exec(body)?.[1]?.trim() ?? null
      if (!version) continue
      if (isPatch) out.patches.push({ version, installDate: install })
      else if (!out.iseVersion) { out.iseVersion = version; out.buildDate = build; out.installDate = install }
    }
    out.patches.sort((a, b) => Number(a.version) - Number(b.version))

    let inServices = false
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\s+$/, '')
      if (/^ISE PROCESS NAME/.test(line)) { inServices = true; continue }
      if (inServices) {
        if (/^-{5,}$/.test(line)) continue
        if (!line.trim() || /^\*{5,}/.test(line)) { inServices = false; continue }
        const s = /^(.{10,45}?)\s{2,}(running|disabled|not running|initializing|stopped)\b\s*(.*)$/i.exec(line)
        if (s) out.services.push({ name: s[1].trim(), state: s[2].toLowerCase(), detail: s[3].trim() || null })
      }
      const sec = /^Displaying (.+?)\s*\.*\s*$/.exec(line)
      if (sec) out.sections.push(sec[1].trim())
      if (/\b(9[0-9]|100)%\s+\//.test(line)) out.diskAlerts.push(line.trim().slice(0, 160))
    }
    out.sections = [...new Set(out.sections)].slice(0, 60)
    return out
  }

  private buildRuntime(): BundleReport['runtime'] {
    const g = this.logs.get('prrt-server.log')
    if (!g) return null
    const noise = this.prrtRule.get('ssl-io-noise')
    return {
      file: 'prrt-server.log',
      lines: g.lines,
      parsed: this.prrtParsed,
      window: { start: g.tsMin, end: g.tsMax },
      byComponentLevel: this.prrtCompLevel.top(30).map(({ key, count }) => {
        const [component, level] = key.split(' ')
        return { component, level, count }
      }),
      patterns: RUNTIME_RULES.filter(r => this.prrtRule.get(r.id) > 0).map(r => ({
        id: r.id, title: r.title, meaning: r.meaning, severity: r.severity,
        count: this.prrtRule.get(r.id),
        share: +(this.prrtRule.get(r.id) / Math.max(this.prrtParsed, 1)).toFixed(4),
        firstSeen: this.prrtFirst.get(r.id) ?? null,
        lastSeen: this.prrtLast.get(r.id) ?? null,
      })).sort((a, b) => b.count - a.count),
      noiseSuppressed: noise,
      signalLines: this.prrtParsed - noise,
      unmatched: this.prrtUnmatched.top(25),
      abandonedBy: this.prrtAbandoned.top(15),
      slowStepBy: this.prrtSlowStep.top(15),
      perDay: g.perDay.all().sort((a, b) => a.key.localeCompare(b.key)),
    }
  }

  private buildAuth(): BundleReport['auth'] {
    if (this.records === 0 && this.codes.size === 0) return null
    const dims: Record<string, KeyCount[]> = {}
    for (const [k, c] of Object.entries(this.dims)) {
      dims[k] = c.top(k === 'endpoint' || k === 'user' ? 40 : 30)
    }
    return {
      files: this.lsFiles,
      records: this.records, passed: this.passed, failed: this.failed,
      failRate: this.records ? +(this.failed / this.records).toFixed(5) : 0,
      window: { start: this.lsTsMin, end: this.lsTsMax },
      messageCodes: this.codes.top(50),
      failureCodes: this.failureCodes.top(30),
      dims,
      failDims: Object.fromEntries(Object.entries(this.failDims).map(([k, c]) => [k, c.top(20)])),
      latency: {
        total: this.totalLatency.summary(),
        totalHistogram: this.totalLatency.histogram(),
        client: this.clientLatency.summary(),
        request: this.requestLatency.summary(),
      },
      stepLatency: [...this.stepTime.entries()]
        .map(([step, v]) => ({ step, totalMs: v.ms, samples: v.n, avgMs: +(v.ms / v.n).toFixed(2) }))
        .sort((a, b) => b.totalMs - a.totalMs).slice(0, 25),
      certExpiry: { buckets: this.certDays.top(10), soonest: this.soonest },
      timeline: this.perMinute.all()
        .map(({ key, count }) => ({ t: key, total: count, fail: this.perMinuteFail.get(key) }))
        .sort((a, b) => a.t.localeCompare(b.t)).slice(0, 3000),
      utilisationSamples: this.utilSamples,
    }
  }

  private buildFindings(
    system: BundleReport['system'],
    runtime: BundleReport['runtime'],
    auth: BundleReport['auth'],
    logs: LogSummary[],
    areas: AreaSummary[],
  ): BundleReport['findings'] {
    const out: BundleReport['findings'] = []
    const add = (severity: string, headline: string, detail: string) =>
      out.push({ severity, headline, detail })
    const num = (v: number) => Math.round(v).toLocaleString()

    if (runtime) {
      for (const p of runtime.patterns) {
        if (p.severity === 'noise' || p.severity === 'low' || p.count < 20) continue
        add(p.severity, `${p.title} — ${num(p.count)} times`,
          `${p.meaning} First seen ${p.firstSeen}, last ${p.lastSeen}.`)
      }
      if (runtime.noiseSuppressed > 0) {
        add('info', `${num(runtime.noiseSuppressed)} lines excluded as known noise`,
          `The SSL "non-blocking I/O noise" message is logged at ERROR but is explicitly harmless. It is ${Math.round(runtime.noiseSuppressed / Math.max(runtime.lines, 1) * 100)}% of that file, and counting it would make the error total meaningless.`)
      }
      const worst = runtime.abandonedBy[0]
      if (worst && worst.count >= 10) {
        add('medium', `${worst.key} abandoned ${worst.count} EAP sessions`,
          `One endpoint restarting EAP repeatedly, usually a supplicant giving up mid-handshake. ${runtime.abandonedBy.length} endpoints did this in total.`)
      }
    }

    // areas carrying real error volume
    for (const a of areas.slice(0, 6)) {
      if (a.errors < 50) continue
      add(a.errors > 5000 ? 'high' : 'medium',
        `${a.area}: ${num(a.errors)} errors and ${num(a.warnings)} warnings`,
        `Across ${a.present.join(', ')}. ${a.topProblems[0] ? `Most common: ${a.topProblems[0].key.slice(0, 130)}` : ''}`)
    }

    // logs that are almost entirely one repeated message
    for (const l of logs) {
      if (l.lines < 100000 || l.problems.length === 0) continue
      const top = l.problems[0]
      if (top.count / l.lines > 0.5) {
        add('medium', `${l.label} is ${Math.round(top.count / l.lines * 100)}% one repeated message`,
          `${num(top.count)} of ${num(l.lines)} lines. ${top.key.slice(0, 140)}`)
      }
    }

    if (auth) {
      if (auth.failRate > 0.02) {
        add('medium', `Authentication failure rate is ${(auth.failRate * 100).toFixed(2)}%`,
          `${num(auth.failed)} of ${num(auth.records)} authentications failed on this node.`)
      }
      const expired = auth.certExpiry.buckets.find(b => b.key === 'expired')
      if (expired) add('high', `${num(expired.count)} authentications used an expired certificate`,
        'Certificates past their expiry date are still being presented.')
      const soon = auth.certExpiry.buckets.filter(b => b.key === '0-6 days' || b.key === '7-29 days')
      if (soon.length) {
        const total = soon.reduce((a, b) => a + b.count, 0)
        add('medium', `${num(total)} authentications used a certificate expiring within 30 days`,
          auth.certExpiry.soonest ? `Soonest is ${auth.certExpiry.soonest.days} days away.` : '')
      }
      const oldTls = auth.dims.tlsVersion?.filter(v => /1\.0|1\.1|SSL/i.test(v.key)) ?? []
      if (oldTls.length) {
        add('medium', 'Endpoints are negotiating obsolete TLS versions',
          oldTls.map(v => `${v.key}: ${num(v.count)}`).join(', ') + '.')
      }
    }

    if (system) {
      const stopped = system.services.filter(s => s.state === 'not running' || s.state === 'stopped')
      if (stopped.length) add('high', `${stopped.length} service(s) not running`, stopped.map(s => s.name).join(', ') + '.')
      if (system.diskAlerts.length) add('high', 'A filesystem is above 90% used', system.diskAlerts.slice(0, 3).join(' | '))
      if (system.iseVersion) {
        const disabled = system.services.filter(s => s.state === 'disabled').length
        add('info',
          `ISE ${system.iseVersion}${system.patches.length ? `, patch ${system.patches[system.patches.length - 1].version}` : ''}`,
          `${system.services.length} services reported, ${disabled} disabled. Running on ADE-OS ${system.adeOs ?? 'unknown'}.`)
      }
    }

    const rank: Record<string, number> = { high: 0, medium: 1, info: 2, low: 3, noise: 4 }
    out.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9))
    return out
  }
}
