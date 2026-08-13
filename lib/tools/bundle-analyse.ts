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
  DimEntry, FailureDetail, Correlation, ProblemEntry,
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

/**
 * A dimension counter that carries the pass/fail split.
 *
 * The earlier version counted totals only, which made every breakdown
 * a popularity contest — you could see that an SSID was busy but not
 * whether it was healthy. Failure rate is the whole point.
 */
class DimCounter {
  private m = new Map<string, { t: number; f: number }>()
  constructor(private cap = 60000) {}
  add(k: string, failed: boolean) {
    const cur = this.m.get(k)
    if (cur) { cur.t++; if (failed) cur.f++ }
    else if (this.m.size < this.cap) this.m.set(k, { t: 1, f: failed ? 1 : 0 })
  }
  get size() { return this.m.size }
  top(limit = 30, by: 'total' | 'fail' = 'total'): DimEntry[] {
    return [...this.m.entries()]
      .map(([key, v]) => ({ key, total: v.t, fail: v.f }))
      .sort((a, b) => (by === 'fail' ? b.fail - a.fail : b.total - a.total))
      .slice(0, limit)
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
  /** errors and warnings per hour — the axis the correlation view uses */
  perHourBad = new Counter(2000)

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
  private ocspHour = new Counter(2000)
  private messagingHour = new Counter(2000)

  // --- localstore ---
  private lsFiles: string[] = []
  private codes = new Counter(500)
  private failureCodes = new Counter(500)
  private dims: Record<string, DimCounter> = {}
  private codeByNad = new Map<string, Counter>()
  private codeByEndpoint = new Map<string, Counter>()
  private codeBySsid = new Map<string, Counter>()
  private authHour = new Counter(2000)
  private authHourFail = new Counter(2000)
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
      'location', 'endpointProfile', 'endpoint', 'user', 'flowType', 'node', 'certTemplate']) {
      this.dims[k] = new DimCounter()
    }
  }

  private crossAdd(map: Map<string, Counter>, code: string, value: string | undefined) {
    if (!value) return
    let c = map.get(code)
    if (!c) { c = new Counter(4000); map.set(code, c) }
    c.add(value)
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
    if (isError || isWarn) g.perHourBad.add(line.slice(0, 13))

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
      if (level === 'ERROR' || level === 'FATAL') { g.errors++; g.perHourBad.add(date.slice(0, 13)) }
      else if (level === 'WARN') { g.warnings++; g.perHourBad.add(date.slice(0, 13)) }
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
      // hourly buckets for the two conditions worth correlating against
      if (r.id === 'ocsp-no-response') this.ocspHour.add(date.slice(0, 13))
      else if (r.id === 'messaging-no-route') this.messagingHour.add(date.slice(0, 13))
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

    const hour = ts.slice(0, 13)
    this.authHour.add(hour)
    if (isFail) this.authHourFail.add(hour)

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

    // Every dimension records the pass/fail split, so any breakdown can
    // answer "how healthy" rather than only "how busy".
    const put = (d: string, v: string | undefined) => { if (v) this.dims[d].add(v, isFail) }
    const nad = kv['NetworkDeviceName']
    const endpoint = kv['Calling-Station-ID'] || kv['EndPointMACAddress']

    put('ssid', ssid || '(wired or unknown)')
    put('nad', nad)
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
    put('endpoint', endpoint)
    put('user', kv['User-Name'] || kv['UserName'])
    put('node', kv['AcsSessionID']?.split('/')[0])
    put('certTemplate', kv['Template Name'])

    // Cross-tabs: for each failure code, where did it happen? This is
    // what turns "412 certificate failures" into "412, nearly all on
    // one controller".
    if (isFail) {
      this.crossAdd(this.codeByNad, code, nad)
      this.crossAdd(this.codeByEndpoint, code, endpoint)
      this.crossAdd(this.codeBySsid, code, ssid)
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
      correlation: this.buildCorrelation(),
      problems: this.buildProblems(logs),
      stats: {
        archiveEntries: this.archiveEntries,
        filesParsed: this.filesRead.length,
        bytesParsed: this.bytesParsed,
        linesParsed: this.linesParsed,
        seconds: +seconds.toFixed(1),
      },
    }
  }

  /**
   * Several logs on one hourly axis.
   *
   * The point is coincidence. Authentication failures rising at the same
   * hour as OCSP timeouts is a different story from failures rising while
   * OCSP is flat — and neither is visible when each log is read alone.
   */
  private buildCorrelation(): Correlation | null {
    const hourSet = new Set<string>()
    for (const h of this.authHour.all()) hourSet.add(h.key)
    for (const h of this.ocspHour.all()) hourSet.add(h.key)
    for (const h of this.messagingHour.all()) hourSet.add(h.key)
    for (const l of this.logs.values()) for (const h of l.perHourBad.all()) hourSet.add(h.key)

    const hours = [...hourSet].filter(h => /^\d{4}-\d{2}-\d{2} \d{2}$/.test(h)).sort()
    if (hours.length < 2) return null

    const series: Correlation['series'] = []
    const push = (id: string, label: string, note: string, get: (h: string) => number) => {
      const values = hours.map(get)
      if (values.some(v => v > 0)) series.push({ id, label, note, values })
    }

    push('auth', 'Authentications', 'from iseLocalStore', h => this.authHour.get(h))
    push('authFail', 'Failed authentications', 'from iseLocalStore', h => this.authHourFail.get(h))
    push('ocsp', 'OCSP failures', 'from prrt-server.log', h => this.ocspHour.get(h))
    push('messaging', 'Messaging failures', 'from prrt-server.log', h => this.messagingHour.get(h))

    // the three noisiest logs by error volume, so the axis stays readable
    const noisy = [...this.logs.values()]
      .filter(l => l.errors + l.warnings > 0 && l.label !== 'prrt-server.log')
      .sort((a, b) => (b.errors + b.warnings) - (a.errors + a.warnings))
      .slice(0, 3)
    for (const l of noisy) {
      push(`log:${l.label}`, `${l.label} problems`, 'errors and warnings', h => l.perHourBad.get(h))
    }

    return { hours, series }
  }

  /** Every warning and error from every log, in one ranked list. */
  private buildProblems(logs: LogSummary[]): ProblemEntry[] {
    const out: ProblemEntry[] = []
    for (const l of logs) {
      for (const p of l.problems) {
        // ise-format problems are stored as "LEVEL shape"
        const space = p.key.indexOf(' ')
        const maybeLevel = space > 0 ? p.key.slice(0, space) : ''
        const isLevel = /^(ERROR|WARN|FATAL|INFO|DEBUG)$/.test(maybeLevel)
        out.push({
          log: l.label,
          areas: l.areas,
          level: isLevel ? maybeLevel : 'ERROR',
          message: isLevel ? p.key.slice(space + 1) : p.key,
          count: p.count,
        })
      }
    }
    return out.sort((a, b) => b.count - a.count).slice(0, 120)
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
      hotpatches: [], profile: null, deploymentId: null, nodes: [],
      appCpu: [], disks: [], memory: [], loadAvg: null, cpuSummary: null,
      topProcesses: [], inventory: [], licence: [], reboots: [], uptime: null,
      rawSections: [],
    }

    // Sections worth showing exactly as ISE printed them. Summarising
    // these would lose more than it saves — an engineer reading a
    // database health report wants the report, not a paraphrase.
    const RAW_WANTED = [
      /show inventory/i, /UDI \(Unique Device Identifier\)/i, /show version['\s]/i,
      /ntp status/i, /System Uptime/i, /database health report/i,
      /database diagnostics/i, /database corrupt Indexes/i,
      /ElasticSearch Health/i, /ElasticSearch Nodes/i,
      /RABBITMQ node health/i, /RABBITMQ status/i,
      /Suppression Settings/i, /IO Performance diagnostics/i,
      /vmstat output/i, /iostat output/i, /proc\/cpuinfo/i,
      /Historical VM IO/i, /show ports/i, /resolv\.conf/i,
      /licen[sc]e/i,
    ]
    const RAW_LINE_CAP = 45
    let rawCurrent: { name: string; lines: string[] } | null = null
    /** header row of `free` output, needed to label the Mem: row */
    let freeHeader: string[] | null = null
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

    // ------------------------------------------------------------
    // show-tech is a sequence of banner-delimited sections. Rather
    // than a regex per fact, walk it once tracking which section we
    // are inside — that way a section appearing in an unexpected
    // place still parses, and unknown sections are simply recorded.
    // ------------------------------------------------------------
    let section = ''
    let inServices = false

    for (const raw of text.split('\n')) {
      const line = raw.replace(/\s+$/, '')

      const banner = /^Displaying (.+?)\s*\.*\s*$/.exec(line)
      if (banner) {
        section = banner[1].trim()
        out.sections.push(section)
        inServices = false
        rawCurrent = null
        freeHeader = null
        if (RAW_WANTED.some(re => re.test(section)) && out.rawSections.length < 24) {
          rawCurrent = { name: section, lines: [] }
          out.rawSections.push(rawCurrent)
        }
        continue
      }

      // capture verbatim output for the whitelisted sections
      if (rawCurrent) {
        if (/^\*{5,}/.test(line)) rawCurrent = null
        else if (rawCurrent.lines.length < RAW_LINE_CAP && line.trim()) {
          rawCurrent.lines.push(line.slice(0, 200))
        }
      }

      // --- services ---
      if (/^ISE PROCESS NAME/.test(line)) { inServices = true; continue }
      if (inServices) {
        if (/^-{5,}$/.test(line)) continue
        if (!line.trim() || /^\*{5,}/.test(line)) { inServices = false }
        else {
          const s = /^(.{10,45}?)\s{2,}(running|disabled|not running|initializing|stopped)\b\s*(.*)$/i.exec(line)
          if (s) out.services.push({ name: s[1].trim(), state: s[2].toLowerCase(), detail: s[3].trim() || null })
          continue
        }
      }

      const sec = section.toLowerCase()

      // --- hotpatch:  "Mon Jun  9 18:27:04 UTC 2025 => CSCwn63400_3.1.x_patchall"
      if (sec.includes('hotpatch')) {
        const h = /^(.+?)\s*=>\s*(\S+)\s*$/.exec(line)
        if (h) out.hotpatches.push({ when: h[1].trim(), name: h[2] })
      }

      // --- hardware profile ---
      if (sec.includes('profile')) {
        const p = /^Profile\s*:\s*(.+)$/.exec(line)
        if (p) out.profile = p[1].trim()
      }

      // --- deployment table ---
      if (sec.includes('deployment')) {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(line.trim())) {
          out.deploymentId = line.trim()
        } else if (!/^(NAME|-{3,}|Node Config|DEPLOYMENT_ID)/.test(line) && line.trim()) {
          // columns are tab or multi-space separated; persona may be "PAN,MNT"
          const cols = line.trim().split(/\t+|\s{2,}/).map(c => c.trim()).filter(Boolean)
          if (cols.length >= 4 && /^[A-Za-z0-9][\w.-]+$/.test(cols[0])) {
            out.nodes.push({
              name: cols[0],
              persona: cols[1] ?? '',
              role: cols[2] ?? '',
              active: cols[3] ?? '',
              replication: cols.slice(4).join(' ') || 'Not Applicable',
            })
          }
        }
      }

      // --- per-service CPU ---
      if (sec.includes('cpu usage')) {
        const c = /^(.{8,42}?)\s{2,}([\d.]+|N\/A)\s*(\S*)\s*(.*)$/.exec(line)
        if (c && !/^ISE Function|^-{5,}|^%WARNING/.test(line)) {
          out.appCpu.push({
            name: c[1].trim(),
            cpu: c[2] === 'N/A' ? null : Number(c[2]),
            cpuTime: c[3] || '',
            threads: c[4].trim(),
          })
        }
      }

      // --- reboots and shutdowns ---
      if (sec.includes('starts and stops')) {
        const r = /^(reboot|shutdown)\s+(.+)$/.exec(line.trim())
        if (r && out.reboots.length < 60) out.reboots.push({ event: r[1], when: r[2].trim() })
      }

      // ------------------------------------------------------------
      // The following are matched on shape rather than on section
      // name, because the exact banner wording varies between ISE
      // releases and these are worth catching wherever they appear.
      // ------------------------------------------------------------

      // df output:  /dev/sda1  50G  38G  12G  76%  /opt
      const df = /^(\/\S+|\S+fs|tmpfs|devtmpfs)\s+([\d.]+[KMGTP]?)\s+([\d.]+[KMGTP]?)\s+([\d.]+[KMGTP]?)\s+(\d{1,3})%\s+(\/\S*)\s*$/.exec(line)
      if (df && out.disks.length < 60) {
        const pct = Number(df[5])
        out.disks.push({
          filesystem: df[1], size: df[2], used: df[3],
          avail: df[4], usePct: pct, mount: df[6],
        })
        if (pct >= 80) out.diskAlerts.push(`${df[6]} at ${pct}% (${df[3]} of ${df[2]})`)
      }

      // meminfo style
      const memKv = /^(MemTotal|MemFree|MemAvailable|Buffers|Cached|SwapTotal|SwapFree):\s+(.+)$/.exec(line)
      if (memKv && out.memory.length < 24) out.memory.push({ key: memKv[1], value: memKv[2].trim() })

      // `free` output: a header row of column names, then Mem: and Swap:
      // rows of bare numbers. The numbers are meaningless without the
      // header, so it has to be remembered and zipped against them.
      if (/^\s+total\s+used\s+free/.test(line)) {
        freeHeader = line.trim().split(/\s+/)
      } else {
        const freeRow = /^(Mem|Swap):\s+(.+)$/.exec(line)
        if (freeRow && out.memory.length < 24) {
          const values = freeRow[2].trim().split(/\s+/)
          // Copied to a const: freeHeader is reassigned elsewhere, so
          // inside the callback its type is no longer narrowed.
          const header = freeHeader
          if (header && header.length >= values.length) {
            values.forEach((v, i) => {
              if (out.memory.length < 24) {
                out.memory.push({ key: `${freeRow[1]} ${header[i] ?? `col${i}`}`, value: `${v} MB` })
              }
            })
          } else {
            out.memory.push({ key: freeRow[1], value: freeRow[2].trim() })
          }
        }
      }

      // load average and uptime
      const la = /load average[s]?:\s*(.+)$/i.exec(line)
      if (la && !out.loadAvg) out.loadAvg = la[1].trim()
      const up = /\bup\s+((\d+\s+days?,?\s*)?[\d:]+)/.exec(line)
      if (up && !out.uptime && /load average/i.test(line)) out.uptime = up[1].trim()

      // top's cpu summary line
      const cpuLine = /^%?Cpu\(s\):\s*(.+)$/.exec(line)
      if (cpuLine && !out.cpuSummary) out.cpuSummary = cpuLine[1].trim()

      // top process rows:  PID USER PR NI VIRT RES SHR S %CPU %MEM TIME+ COMMAND
      const top = /^\s*(\d{2,7})\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S\s+([\d.]+)\s+([\d.]+)\s+\S+\s+(.+)$/.exec(line)
      if (top && out.topProcesses.length < 25 && Number(top[2]) > 0) {
        out.topProcesses.push({ pid: top[1], cpu: top[2], mem: top[3], command: top[4].trim().slice(0, 60) })
      }

      // Cisco inventory blocks
      const inv = /^(NAME|DESCR|PID|VID|SN|Total RAM|Total Disk|CPU Model|CPU Core Count|NIC Count|Hard Disk Count):\s*(.+)$/.exec(line)
      if (inv && out.inventory.length < 30) {
        out.inventory.push({ key: inv[1], value: inv[2].replace(/^["']|["']$/g, '').trim().slice(0, 90) })
      }

      // Licence lines, with certificates excluded. The trust store
      // contains "Cisco Licensing Root CA", which matches on the word
      // and has nothing to do with entitlement.
      if (/licen[sc]e/i.test(line) && line.trim().length > 8 && out.licence.length < 30) {
        const t = line.trim()
        const isCertNoise = /certificate|friendly name|BEGIN|END|Root CA|Issuer|Subject/i.test(t)
        if (!isCertNoise && !/^\*{3,}|^-{3,}/.test(t)) out.licence.push(t.slice(0, 160))
      }
    }

    out.sections = [...new Set(out.sections)].slice(0, 80)
    out.hotpatches.reverse()
    out.diskAlerts = [...new Set(out.diskAlerts)].slice(0, 12)
    out.rawSections = out.rawSections.filter(s => s.lines.length > 0)
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

    const dims: Record<string, DimEntry[]> = {}
    for (const [k, c] of Object.entries(this.dims)) {
      dims[k] = c.top(k === 'endpoint' || k === 'user' ? 60 : 40)
    }

    const topOf = (m: Map<string, Counter>, code: string): KeyCount | null =>
      m.get(code)?.top(1)[0] ?? null

    const failureDetail: FailureDetail[] = this.failureCodes.top(30).map(f => {
      const nad = topOf(this.codeByNad, f.key)
      const ep = topOf(this.codeByEndpoint, f.key)
      const ssid = topOf(this.codeBySsid, f.key)
      return {
        code: f.key,
        text: this.catalogue[f.key] ?? '',
        count: f.count,
        share: this.failed ? +(f.count / this.failed).toFixed(4) : 0,
        topNad: nad?.key ?? null,
        topNadCount: nad?.count ?? 0,
        topEndpoint: ep?.key ?? null,
        topEndpointCount: ep?.count ?? 0,
        topSsid: ssid?.key ?? null,
      }
    })

    return {
      files: this.lsFiles,
      records: this.records, passed: this.passed, failed: this.failed,
      failRate: this.records ? +(this.failed / this.records).toFixed(5) : 0,
      window: { start: this.lsTsMin, end: this.lsTsMax },
      messageCodes: this.codes.top(50),
      failureCodes: this.failureCodes.top(30),
      dims,
      failureDetail,
      hourly: this.authHour.all()
        .map(({ key, count }) => ({ hour: key, total: count, fail: this.authHourFail.get(key) }))
        .sort((a, b) => a.hour.localeCompare(b.hour)),
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
          oldTls.map(v => `${v.key}: ${num(v.total)}`).join(', ') + '.')
      }

      // Concentration is the useful signal: a failure code spread evenly
      // is a configuration story, one landing on a single device is not.
      for (const f of auth.failureDetail.slice(0, 6)) {
        if (f.count < 20 || !f.topNad) continue
        const share = f.topNadCount / f.count
        if (share < 0.6) continue
        add('medium',
          `Failure ${f.code} is concentrated on one device`,
          `${num(f.topNadCount)} of ${num(f.count)} occurrences (${Math.round(share * 100)}%) came from ${f.topNad}. ` +
          `${f.text || 'See the failure table for the full message.'}`)
      }

      // An endpoint failing far more than anything else is usually one
      // broken supplicant rather than a fleet problem.
      const worstEndpoint = [...(auth.dims.endpoint ?? [])]
        .filter(e => e.fail > 0).sort((a, b) => b.fail - a.fail)[0]
      if (worstEndpoint && worstEndpoint.fail >= 20 && worstEndpoint.fail / Math.max(auth.failed, 1) > 0.1) {
        add('medium', `${worstEndpoint.key} accounts for ${Math.round(worstEndpoint.fail / auth.failed * 100)}% of all failures`,
          `${num(worstEndpoint.fail)} failures out of ${num(worstEndpoint.total)} attempts from this one endpoint.`)
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
