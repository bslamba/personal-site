// ============================================================
// lib/tools/radius.ts
//
// Analysis engine for Cisco ISE RADIUS Authentication exports.
//
// Everything here is pure computation — no React, no DOM, no
// network. It runs in the browser, which means the CSV never
// leaves the machine it was opened on. That matters: these
// exports contain usernames, MAC addresses and site names.
//
// DESIGN
// The rows are not kept as objects. Every column is dictionary
// encoded into a typed array, so 100,000 rows occupy about 8MB
// instead of several hundred, and re-aggregating after a filter
// change is a single pass over integers — fast enough to feel
// instant. That is what makes cross-filtering possible: click a
// switch and the entire dashboard recomputes for that switch.
// ============================================================

// ------------------------------------------------------------
// 1. COLUMN DETECTION
//
// ISE column names differ between 2.x and 3.x, and again between
// a scheduled report export and a Live Logs export. Rather than
// hard-coding one spelling, every field lists the names it has
// been seen under. Matching ignores case, spaces, underscores
// and hyphens, so "NAS_IP_ADDRESS", "NAS IP Address" and
// "nasIpAddress" all resolve to the same field.
// ------------------------------------------------------------

export type Field =
  | 'timestamp' | 'passed' | 'failureReason' | 'messageText'
  | 'location' | 'server' | 'nasIp' | 'device' | 'deviceType'
  | 'policySet' | 'authzRule' | 'authzProfile'
  | 'method' | 'protocol' | 'credential'
  | 'identityStore' | 'identityGroup' | 'user' | 'mac'
  | 'endpointProfile' | 'serviceType' | 'responseTime'
  | 'ssid' | 'nasPort' | 'sessionId'

const ALIASES: Record<Field, string[]> = {
  timestamp:       ['acsviewtimestamp', 'timestamp', 'date', 'loggedat', 'time'],
  passed:          ['passed', 'status', 'authstatus', 'result'],
  failureReason:   ['failurereason', 'failure', 'failurereasons'],
  messageText:     ['messagetext', 'message'],
  location:        ['location', 'networkdevicelocation', 'maplocation'],
  server:          ['acsserver', 'isenode', 'server', 'psn', 'nodename', 'devicename'],
  nasIp:           ['nasipaddress', 'nasip', 'networkdeviceip', 'deviceip', 'nasipv4address'],
  device:          ['networkdevicename', 'networkdevice', 'nasidentifier', 'devicename2'],
  deviceType:      ['devicetype', 'networkdevicetype', 'devicetypes'],
  policySet:       ['policysetname', 'policyset'],
  authzRule:       ['authorizationrule', 'authzrule', 'authorizationpolicy'],
  authzProfile:    ['selectedaznprofiles', 'authorizationprofiles', 'authzprofiles', 'selectedauthorizationprofiles'],
  method:          ['authenticationmethod', 'authmethod'],
  protocol:        ['authenticationprotocol', 'authprotocol', 'eaptype'],
  credential:      ['credentialcheck', 'credentialcheckmethod'],
  identityStore:   ['identitystore', 'identitysource', 'identitystorename'],
  identityGroup:   ['identitygroup', 'usergroup', 'identitygroups'],
  user:            ['username', 'user', 'identity'],
  mac:             ['callingstationid', 'endpointid', 'macaddress', 'endpointmacaddress'],
  endpointProfile: ['endpointmatchedprofile', 'endpointprofile', 'profile'],
  serviceType:     ['servicetype'],
  responseTime:    ['responsetime', 'latency', 'elapsedtime'],
  ssid:            ['ssid', 'calledstationid', 'calledstationid2'],
  nasPort:         ['nasportid', 'nasport', 'port'],
  sessionId:       ['auditsessionid', 'sessionid'],
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export type ColumnMap = Partial<Record<Field, string>>

export function detectColumns(headers: string[]): ColumnMap {
  const byNorm = new Map<string, string>()
  for (const h of headers) byNorm.set(norm(h), h)

  const map: ColumnMap = {}
  for (const field of Object.keys(ALIASES) as Field[]) {
    for (const alias of ALIASES[field]) {
      const hit = byNorm.get(alias)
      if (hit) { map[field] = hit; break }
    }
  }
  return map
}

/** Enough of the shape present to be worth analysing. */
export function looksLikeRadius(map: ColumnMap): boolean {
  return Boolean(map.passed || map.failureReason) &&
         Boolean(map.server || map.device || map.nasIp)
}

// ------------------------------------------------------------
// 2. VALUE PARSING
// ------------------------------------------------------------

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
}

// ISE exports Oracle-style timestamps: "06-AUG-26 08.13.47.165000 AM"
const ORACLE = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})\s+(\d{1,2})[.:](\d{2})[.:](\d{2})(?:[.:](\d+))?\s*(AM|PM)?$/i

export function parseTimestamp(raw: string): number {
  if (!raw) return NaN
  const s = raw.trim()

  const m = ORACLE.exec(s)
  if (m) {
    const day = +m[1]
    const mon = MONTHS[m[2].toUpperCase()]
    if (mon === undefined) return NaN
    let year = +m[3]
    if (year < 100) year += 2000
    let hour = +m[4]
    const min = +m[5]
    const sec = +m[6]
    const frac = m[7] ? Number(('0.' + m[7])) * 1000 : 0
    const ampm = m[8]?.toUpperCase()
    if (ampm === 'PM' && hour !== 12) hour += 12
    if (ampm === 'AM' && hour === 12) hour = 0
    return Date.UTC(year, mon, day, hour, min, sec, Math.round(frac))
  }

  // ISO and anything else the platform recognises
  const t = Date.parse(s)
  return Number.isNaN(t) ? NaN : t
}

/** "All Device Types#Cisco_WLC" -> "Cisco_WLC"; "All Locations" stays. */
export function tail(value: string, sep: string): string {
  if (!value) return ''
  const i = value.lastIndexOf(sep)
  return i === -1 ? value : value.slice(i + sep.length) || value
}

/** ISE failure reasons start with a numeric code: "12520 EAP-TLS failed ..." */
export function splitFailure(raw: string): { code: string; text: string } {
  const s = (raw || '').trim()
  if (!s) return { code: '', text: '' }
  const m = /^(\d{4,6})\s+(.*)$/.exec(s)
  return m ? { code: m[1], text: m[2] } : { code: '', text: s }
}

/**
 * Group failure codes into families. The first two digits of an ISE
 * message code identify the subsystem, which is what tells you
 * whether you are looking at a supplicant problem, a certificate
 * problem or a directory problem.
 */
export function failureCategory(code: string, text: string): string {
  if (!code) {
    if (/timeout|no response/i.test(text)) return 'Timeout'
    return text ? 'Other' : 'None'
  }
  const n = Number(code)
  if (n >= 11500 && n < 11600) return 'EAP session'
  if (n >= 11000 && n < 11500) return 'RADIUS / protocol'
  if (n >= 12300 && n < 12400) return 'PEAP handshake'
  if (n >= 12500 && n < 12600) return 'EAP-TLS / certificate'
  if (n >= 12700 && n < 12800) return 'Inner method'
  if (n >= 12900 && n < 13000) return 'TLS session / fragment'
  if (n >= 12000 && n < 13000) return 'EAP negotiation'
  if (n >= 15000 && n < 16000) return 'Policy'
  if (n >= 22000 && n < 23000) return 'Identity store'
  if (n >= 24000 && n < 25000) return 'Active Directory'
  if (n >= 5400 && n < 5500) return 'Authentication rejected'
  return 'Other'
}

/**
 * Called-Station-ID on wireless is "aa-bb-cc-dd-ee-ff:SSIDNAME".
 * On wired it is just a MAC, in which case there is no SSID.
 */
export function extractSsid(calledStation: string): string {
  if (!calledStation) return ''
  const i = calledStation.lastIndexOf(':')
  if (i === -1) return ''
  const candidate = calledStation.slice(i + 1).trim()
  // A trailing hex pair is part of a MAC, not an SSID
  if (/^[0-9A-Fa-f]{2}$/.test(candidate)) return ''
  return candidate
}

const PASS_WORDS = /^(pass|passed|success|succeeded|true|1)$/i

export function isPass(passedValue: string, messageText: string, failure: string): boolean {
  const p = (passedValue || '').trim()
  if (p) return PASS_WORDS.test(p)
  if (messageText) return /succe/i.test(messageText)
  return !failure
}

// ------------------------------------------------------------
// 3. COLUMNAR STORE
// ------------------------------------------------------------

/** Dimensions that get dictionary-encoded and can be filtered on. */
export const DIMENSIONS = [
  'location', 'server', 'nasIp', 'device', 'deviceType',
  'policySet', 'authzRule', 'authzProfile',
  'method', 'protocol', 'credential',
  'identityStore', 'identityGroup', 'user', 'mac',
  'endpointProfile', 'serviceType', 'ssid', 'failure',
  'source',
] as const

export type Dimension = typeof DIMENSIONS[number]

export const DIMENSION_LABELS: Record<Dimension, string> = {
  location:        'Location',
  server:          'ISE node (PSN)',
  nasIp:           'NAD IP address',
  device:          'Network device',
  deviceType:      'Device type',
  policySet:       'Policy set',
  authzRule:       'Authorization rule',
  authzProfile:    'Authorization profile',
  method:          'Authentication method',
  protocol:        'Authentication protocol',
  credential:      'Credential check',
  identityStore:   'Identity store',
  identityGroup:   'Identity group',
  user:            'User name',
  mac:             'Endpoint MAC',
  endpointProfile: 'Endpoint profile',
  serviceType:     'Service type',
  ssid:            'SSID',
  failure:         'Failure reason',
  source:          'Source file',
}

class Dict {
  values: string[] = []
  private index = new Map<string, number>()
  id(v: string): number {
    const key = v || '(none)'
    let i = this.index.get(key)
    if (i === undefined) {
      i = this.values.length
      this.values.push(key)
      this.index.set(key, i)
    }
    return i
  }
}

export interface Store {
  rows: number
  /** epoch ms; NaN where the timestamp could not be read */
  ts: Float64Array
  pass: Uint8Array
  rt: Int32Array          // response time in ms, -1 when absent
  codes: Record<Dimension, Int32Array>
  dicts: Record<Dimension, string[]>
  /** failure code and text, parallel to dicts.failure */
  failureCode: string[]
  failureText: string[]
  failureCat: string[]
  columns: ColumnMap
  headers: string[]
  /** headers that were present but contained no value on any row */
  emptyColumns: string[]
  truncated: boolean
}

const MAX_ROWS = 3_000_000

/**
 * Accumulates any number of files into one dataset.
 *
 * Each file declares its own headers through setSource(), so a
 * batch can mix exports from different ISE versions — the column
 * map is recomputed per file while the encoded columns keep
 * accumulating into the same arrays.
 */
export class StoreBuilder {
  private map: ColumnMap = {}
  private headers: string[] = []
  private headerSet = new Set<string>()
  private sourceName = ''
  private dicts: Record<string, Dict> = {}
  private cols: Record<string, number[]> = {}
  private tsArr: number[] = []
  private passArr: number[] = []
  private rtArr: number[] = []
  private nonEmpty = new Set<string>()
  private n = 0
  truncated = false

  constructor() {
    for (const d of DIMENSIONS) {
      this.dicts[d] = new Dict()
      this.cols[d] = []
    }
  }

  /** Call once per file, before pushing that file's rows. */
  setSource(headers: string[], name: string): void {
    this.map = detectColumns(headers)
    this.sourceName = name
    for (const h of headers) {
      if (!this.headerSet.has(h)) { this.headerSet.add(h); this.headers.push(h) }
    }
  }

  get columnMap() { return this.map }
  get count() { return this.n }

  push(rec: Record<string, string>): void {
    if (this.n >= MAX_ROWS) { this.truncated = true; return }

    const get = (f: Field): string => {
      const col = this.map[f]
      if (!col) return ''
      const v = rec[col]
      return v == null ? '' : String(v).trim()
    }

    // Track which source columns actually carry data, so the UI can
    // explain why a panel is empty rather than just showing nothing.
    // A column counts as populated if ANY file filled it.
    for (const h of this.headers) {
      if (!this.nonEmpty.has(h)) {
        const v = rec[h]
        if (v != null && String(v).trim() !== '') this.nonEmpty.add(h)
      }
    }

    const failureRaw = get('failureReason')
    const pass = isPass(get('passed'), get('messageText'), failureRaw)

    this.tsArr.push(parseTimestamp(get('timestamp')))
    this.passArr.push(pass ? 1 : 0)

    const rtRaw = get('responseTime')
    const rt = rtRaw === '' ? -1 : Number(rtRaw)
    this.rtArr.push(Number.isFinite(rt) ? rt : -1)

    const calledStation = get('ssid')
    const ssid = this.map.ssid && norm(this.map.ssid) === 'ssid'
      ? calledStation
      : extractSsid(calledStation)

    const put = (d: Dimension, v: string) => {
      this.cols[d].push(this.dicts[d].id(v))
    }

    put('location',        tail(get('location'), '#'))
    put('server',          get('server'))
    put('nasIp',           get('nasIp'))
    put('device',          get('device'))
    put('deviceType',      tail(get('deviceType'), '#'))
    put('policySet',       get('policySet'))
    put('authzRule',       get('authzRule'))
    put('authzProfile',    get('authzProfile'))
    put('method',          get('method'))
    put('protocol',        get('protocol'))
    put('credential',      get('credential'))
    put('identityStore',   get('identityStore'))
    put('identityGroup',   tail(get('identityGroup'), ':'))
    put('user',            get('user'))
    put('mac',             get('mac').toUpperCase())
    put('endpointProfile', get('endpointProfile'))
    put('serviceType',     get('serviceType'))
    put('ssid',            ssid)
    put('failure',         failureRaw)
    put('source',          this.sourceName)

    this.n++
  }

  finish(): Store {
    const codes = {} as Record<Dimension, Int32Array>
    const dicts = {} as Record<Dimension, string[]>
    for (const d of DIMENSIONS) {
      codes[d] = Int32Array.from(this.cols[d])
      dicts[d] = this.dicts[d].values
      // free the intermediate
      this.cols[d] = []
    }

    const failureCode: string[] = []
    const failureText: string[] = []
    const failureCat: string[] = []
    for (const raw of dicts.failure) {
      const value = raw === '(none)' ? '' : raw
      const { code, text } = splitFailure(value)
      failureCode.push(code)
      failureText.push(text)
      failureCat.push(value ? failureCategory(code, text) : 'None')
    }

    return {
      rows: this.n,
      ts: Float64Array.from(this.tsArr),
      pass: Uint8Array.from(this.passArr),
      rt: Int32Array.from(this.rtArr),
      codes, dicts,
      failureCode, failureText, failureCat,
      columns: this.map,
      headers: this.headers,
      emptyColumns: this.headers.filter(h => !this.nonEmpty.has(h)),
      truncated: this.truncated,
    }
  }
}

// ------------------------------------------------------------
// 4. AGGREGATION
// ------------------------------------------------------------

export interface Bucket {
  key: string
  total: number
  fail: number
  failRate: number
  /** failures beyond what the overall rate would predict */
  excess: number
  /** binomial z-score of the failure rate against the baseline */
  z: number
  rtSum: number
  rtCount: number
  rtAvg: number
}

export interface TimeBucket { t: number; total: number; fail: number }

export interface FailureRow {
  code: string
  text: string
  category: string
  count: number
  share: number
  topDevice: string
  topDeviceCount: number
}

export interface Finding {
  dimension: Dimension
  label: string
  key: string
  total: number
  fail: number
  failRate: number
  excess: number
  z: number
  headline: string
  detail: string
}

export interface Analysis {
  rows: number
  total: number
  pass: number
  fail: number
  failRate: number
  windowStart: number
  windowEnd: number
  windowMs: number
  perSecond: number
  peakPerMinute: number
  distinct: Record<Dimension, number>
  dims: Record<Dimension, Bucket[]>
  failures: FailureRow[]
  categories: Bucket[]
  timeline: TimeBucket[]
  bucketMs: number
  rtPercentiles: { p50: number; p90: number; p95: number; p99: number; max: number; avg: number }
  rtHistogram: { from: number; to: number; count: number }[]
  slowest: Bucket[]
  findings: Finding[]
  emptyColumns: string[]
  hasSsid: boolean
  truncated: boolean
}

export interface Filter { dimension: Dimension; key: string }

export interface AnalyseOptions {
  /** Force a timeline bucket size in ms. Omit for automatic. */
  bucketMs?: number
}

/** Bucket sizes offered in the timeline control, smallest first. */
export const BUCKET_STEPS = [
  1_000, 2_000, 5_000, 10_000, 15_000, 20_000, 30_000, 45_000,
  60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000, 30 * 60_000,
  60 * 60_000, 3 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000, 24 * 3_600_000,
]

/** Rendering more than this many bars stops being readable. */
const MAX_BUCKETS = 1_400

function bucketsFor(
  store: Store, dim: Dimension, mask: Uint8Array | null, baseline: number,
): Bucket[] {
  const codes = store.codes[dim]
  const dict = store.dicts[dim]
  const total = new Int32Array(dict.length)
  const fail = new Int32Array(dict.length)
  const rtSum = new Float64Array(dict.length)
  const rtCount = new Int32Array(dict.length)

  for (let i = 0; i < store.rows; i++) {
    if (mask && !mask[i]) continue
    const c = codes[i]
    total[c]++
    if (!store.pass[i]) fail[c]++
    const rt = store.rt[i]
    if (rt >= 0) { rtSum[c] += rt; rtCount[c]++ }
  }

  const out: Bucket[] = []
  for (let c = 0; c < dict.length; c++) {
    if (total[c] === 0) continue
    const n = total[c]
    const f = fail[c]
    const rate = f / n
    const expected = n * baseline
    const variance = n * baseline * (1 - baseline)
    out.push({
      key: dict[c],
      total: n,
      fail: f,
      failRate: rate,
      excess: f - expected,
      z: variance > 0 ? (f - expected) / Math.sqrt(variance) : 0,
      rtSum: rtSum[c],
      rtCount: rtCount[c],
      rtAvg: rtCount[c] ? rtSum[c] / rtCount[c] : 0,
    })
  }
  out.sort((a, b) => b.total - a.total)
  return out
}

function percentile(hist: Int32Array, totalCount: number, q: number): number {
  if (totalCount === 0) return 0
  const target = q * totalCount
  let seen = 0
  for (let v = 0; v < hist.length; v++) {
    seen += hist[v]
    if (seen >= target) return v
  }
  return hist.length - 1
}

const RT_MAX = 60_000

export function analyse(
  store: Store, filters: Filter[] = [], options: AnalyseOptions = {},
): Analysis {
  // ---- build the row mask from active filters ----
  let mask: Uint8Array | null = null
  if (filters.length) {
    mask = new Uint8Array(store.rows).fill(1)
    for (const f of filters) {
      const dict = store.dicts[f.dimension]
      const wanted = dict.indexOf(f.key)
      const codes = store.codes[f.dimension]
      if (wanted === -1) { mask.fill(0); break }
      for (let i = 0; i < store.rows; i++) {
        if (mask[i] && codes[i] !== wanted) mask[i] = 0
      }
    }
  }

  // ---- headline pass ----
  let total = 0, fail = 0
  let tMin = Infinity, tMax = -Infinity
  const rtHist = new Int32Array(RT_MAX + 1)
  let rtCount = 0, rtSum = 0, rtOver = 0, rtMax = 0

  for (let i = 0; i < store.rows; i++) {
    if (mask && !mask[i]) continue
    total++
    if (!store.pass[i]) fail++
    const t = store.ts[i]
    if (!Number.isNaN(t)) { if (t < tMin) tMin = t; if (t > tMax) tMax = t }
    const rt = store.rt[i]
    if (rt >= 0) {
      rtCount++; rtSum += rt
      if (rt > rtMax) rtMax = rt
      if (rt <= RT_MAX) rtHist[rt]++; else rtOver++
    }
  }

  const baseline = total > 0 ? fail / total : 0
  const hasWindow = tMin !== Infinity && tMax !== -Infinity
  const windowMs = hasWindow ? Math.max(tMax - tMin, 0) : 0

  // ---- per-dimension ----
  const dims = {} as Record<Dimension, Bucket[]>
  const distinct = {} as Record<Dimension, number>
  for (const d of DIMENSIONS) {
    dims[d] = bucketsFor(store, d, mask, baseline)
    distinct[d] = dims[d].filter(b => b.key !== '(none)').length
  }

  // ---- failure reasons, with the device most responsible for each ----
  const failureBuckets = dims.failure.filter(b => b.key !== '(none)')
  const deviceCodes = store.codes.device
  const deviceDict = store.dicts.device
  const failureCodes = store.codes.failure

  const perFailureDevice = new Map<number, Map<number, number>>()
  for (let i = 0; i < store.rows; i++) {
    if (mask && !mask[i]) continue
    if (store.pass[i]) continue
    const fc = failureCodes[i]
    let inner = perFailureDevice.get(fc)
    if (!inner) { inner = new Map(); perFailureDevice.set(fc, inner) }
    const dc = deviceCodes[i]
    inner.set(dc, (inner.get(dc) ?? 0) + 1)
  }

  const failures: FailureRow[] = failureBuckets.map(b => {
    const idx = store.dicts.failure.indexOf(b.key)
    const inner = perFailureDevice.get(idx)
    let topDevice = '', topDeviceCount = 0
    if (inner) {
      for (const [dc, n] of inner) {
        if (n > topDeviceCount) { topDeviceCount = n; topDevice = deviceDict[dc] }
      }
    }
    return {
      code: store.failureCode[idx],
      text: store.failureText[idx],
      category: store.failureCat[idx],
      count: b.total,
      share: fail > 0 ? b.total / fail : 0,
      topDevice, topDeviceCount,
    }
  }).sort((a, b) => b.count - a.count)

  // ---- failure categories ----
  const catTotals = new Map<string, number>()
  for (const f of failures) catTotals.set(f.category, (catTotals.get(f.category) ?? 0) + f.count)
  const categories: Bucket[] = [...catTotals.entries()]
    .map(([key, n]) => ({
      key, total: n, fail: n, failRate: 1,
      excess: 0, z: 0, rtSum: 0, rtCount: 0, rtAvg: 0,
    }))
    .sort((a, b) => b.total - a.total)

  // ---- timeline ----
  let timeline: TimeBucket[] = []
  let bucketMs = 60_000
  let peakPerMinute = 0
  if (hasWindow && windowMs > 0) {
    if (options.bucketMs && options.bucketMs > 0) {
      bucketMs = options.bucketMs
    } else {
      // Aim for a fine-grained picture. 240 buckets across the window
      // means a one-hour export lands on 15-second bars, which is
      // enough resolution to see a burst of failures rather than an
      // hour-long average that hides it.
      const raw = windowMs / 240
      bucketMs = BUCKET_STEPS.find(s => s >= raw) ?? BUCKET_STEPS[BUCKET_STEPS.length - 1]
    }

    // Never render so many bars that they stop being distinguishable.
    while (windowMs / bucketMs > MAX_BUCKETS) {
      const next = BUCKET_STEPS.find(s => s > bucketMs)
      if (!next) break
      bucketMs = next
    }

    const start = Math.floor(tMin / bucketMs) * bucketMs
    const count = Math.floor((tMax - start) / bucketMs) + 1
    const tot = new Int32Array(count)
    const fl = new Int32Array(count)
    for (let i = 0; i < store.rows; i++) {
      if (mask && !mask[i]) continue
      const t = store.ts[i]
      if (Number.isNaN(t)) continue
      const b = Math.floor((t - start) / bucketMs)
      if (b < 0 || b >= count) continue
      tot[b]++
      if (!store.pass[i]) fl[b]++
    }
    timeline = Array.from({ length: count }, (_, b) => ({
      t: start + b * bucketMs, total: tot[b], fail: fl[b],
    }))
    const perMin = 60_000 / bucketMs
    peakPerMinute = Math.max(0, ...timeline.map(b => b.total * perMin))
  }

  // ---- response time ----
  const rtPercentiles = {
    p50: percentile(rtHist, rtCount - rtOver, 0.50),
    p90: percentile(rtHist, rtCount - rtOver, 0.90),
    p95: percentile(rtHist, rtCount - rtOver, 0.95),
    p99: percentile(rtHist, rtCount - rtOver, 0.99),
    max: rtMax,
    avg: rtCount ? rtSum / rtCount : 0,
  }

  const edges = [0, 10, 25, 50, 75, 100, 150, 200, 300, 500, 1000, 2000, 5000, Infinity]
  const rtHistogram = edges.slice(0, -1).map((from, i) => {
    const to = edges[i + 1]
    let count = 0
    const hi = Math.min(to === Infinity ? RT_MAX + 1 : to, RT_MAX + 1)
    for (let v = from; v < hi; v++) count += rtHist[v]
    if (to === Infinity) count += rtOver
    return { from, to, count }
  })

  const slowest = [...dims.device]
    .filter(b => b.rtCount >= 30)
    .sort((a, b) => b.rtAvg - a.rtAvg)
    .slice(0, 12)

  // ---- findings ----
  const findings = buildFindings(dims, baseline, total, rtPercentiles.p95)

  return {
    rows: store.rows,
    total, pass: total - fail, fail,
    failRate: baseline,
    windowStart: hasWindow ? tMin : 0,
    windowEnd: hasWindow ? tMax : 0,
    windowMs,
    perSecond: windowMs > 0 ? total / (windowMs / 1000) : 0,
    peakPerMinute,
    distinct, dims, failures, categories,
    timeline, bucketMs,
    rtPercentiles, rtHistogram, slowest,
    findings,
    emptyColumns: store.emptyColumns,
    hasSsid: dims.ssid.some(b => b.key !== '(none)'),
    truncated: store.truncated,
  }
}

// ------------------------------------------------------------
// 5. FINDINGS
//
// The point of the dashboard is to answer "where is the problem".
// A dimension value matters when its failure rate is both
// statistically distinguishable from the baseline AND responsible
// for a meaningful number of failures. Ranking on excess failures
// rather than on failure rate keeps a device with 3 attempts and
// 3 failures from outranking one with 8,000 attempts and 3,000.
// ------------------------------------------------------------

const FINDING_DIMS: Dimension[] = [
  'device', 'nasIp', 'server', 'deviceType', 'location',
  'policySet', 'authzRule', 'protocol', 'method', 'credential',
  'identityStore', 'identityGroup', 'ssid', 'endpointProfile',
]

const pct = (v: number) => (v * 100).toFixed(1) + '%'

function buildFindings(
  dims: Record<Dimension, Bucket[]>, baseline: number, grandTotal: number, p95: number,
): Finding[] {
  const out: Finding[] = []
  const minRows = Math.max(30, Math.round(grandTotal * 0.0005))

  for (const d of FINDING_DIMS) {
    for (const b of dims[d]) {
      if (b.key === '(none)') continue
      if (b.total < minRows) continue
      if (b.z < 3 || b.excess < 10) continue

      // A value covering most of the data IS the baseline. Reporting
      // that "dot1x is failing at 4.8% against a baseline of 4.6%" is
      // noise — it is 94% of the rows, so of course it is.
      if (b.total > grandTotal * 0.6) continue

      // Statistical significance alone is not enough at this row count;
      // with 80,000 samples a 0.2 point difference clears z=3 easily.
      // Require the difference to be worth someone's afternoon.
      const meaningfullyWorse =
        b.failRate >= baseline * 1.3 || b.failRate - baseline >= 0.03
      if (!meaningfullyWorse) continue

      out.push({
        dimension: d,
        label: DIMENSION_LABELS[d],
        key: b.key,
        total: b.total,
        fail: b.fail,
        failRate: b.failRate,
        excess: b.excess,
        z: b.z,
        headline: `${b.key} is failing at ${pct(b.failRate)}`,
        detail:
          `${b.fail.toLocaleString()} of ${b.total.toLocaleString()} attempts failed, ` +
          `against a baseline of ${pct(baseline)}. That is ` +
          `${Math.round(b.excess).toLocaleString()} more failures than expected.`,
      })
    }
  }

  // Latency outliers, ranked separately so a slow node still surfaces
  // even when its failure rate looks ordinary.
  for (const b of dims.server) {
    if (b.key === '(none)' || b.rtCount < minRows) continue
    if (p95 > 0 && b.rtAvg > p95 * 1.5) {
      out.push({
        dimension: 'server',
        label: DIMENSION_LABELS.server,
        key: b.key,
        total: b.total, fail: b.fail, failRate: b.failRate,
        excess: 0, z: 0,
        headline: `${b.key} is answering slowly`,
        detail:
          `Mean response time ${Math.round(b.rtAvg)}ms across ${b.rtCount.toLocaleString()} ` +
          `authentications, against a fleet 95th percentile of ${p95}ms.`,
      })
    }
  }

  // Load imbalance across PSNs — a common and easily missed problem.
  const psns = dims.server.filter(b => b.key !== '(none)')
  if (psns.length >= 3) {
    const totals = psns.map(b => b.total)
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length
    const max = Math.max(...totals)
    const min = Math.min(...totals)
    if (mean > 0 && max > min * 3 && max > minRows) {
      const busiest = psns.find(b => b.total === max)!
      const quietest = psns.find(b => b.total === min)!
      out.push({
        dimension: 'server',
        label: DIMENSION_LABELS.server,
        key: busiest.key,
        total: busiest.total, fail: busiest.fail, failRate: busiest.failRate,
        excess: 0, z: 0,
        headline: 'Authentication load is unevenly spread across ISE nodes',
        detail:
          `${busiest.key} handled ${busiest.total.toLocaleString()} authentications while ` +
          `${quietest.key} handled ${quietest.total.toLocaleString()} — a ratio of ` +
          `${(max / Math.max(min, 1)).toFixed(1)} to 1. Worth checking the load balancer ` +
          `or the RADIUS server list on the network devices.`,
      })
    }
  }

  out.sort((a, b) => (b.excess || b.z * 100) - (a.excess || a.z * 100))
  return out.slice(0, 14)
}

// ------------------------------------------------------------
// 6. EXPORT
// ------------------------------------------------------------

export function toCsv(analysis: Analysis): string {
  const lines: string[] = []
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const row = (...cells: unknown[]) => lines.push(cells.map(esc).join(','))

  row('Section', 'Key', 'Total', 'Failed', 'Fail rate %', 'Excess failures', 'Avg response ms')
  row('Overall', 'All authentications', analysis.total, analysis.fail,
      (analysis.failRate * 100).toFixed(2), '', analysis.rtPercentiles.avg.toFixed(1))

  for (const d of DIMENSIONS) {
    for (const b of analysis.dims[d]) {
      if (b.key === '(none)') continue
      row(DIMENSION_LABELS[d], b.key, b.total, b.fail,
          (b.failRate * 100).toFixed(2),
          Math.round(b.excess),
          b.rtCount ? b.rtAvg.toFixed(1) : '')
    }
  }
  return lines.join('\n')
}
