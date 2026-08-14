// ============================================================
// lib/tools/clearpass.ts
//
// Aruba ClearPass log analysis.
//
// THE DESIGN DECISION THAT MATTERS
//
// This does not know what a ClearPass CSV looks like, and that is
// deliberate. Access Tracker column sets differ across 6.7 → 6.11,
// between Insight reports and Access Tracker, and again depending
// on which columns the operator ticked before exporting. Hardcoding
// a header list would produce a tool that works on one person's
// export and silently mis-reads everyone else's.
//
// So columns are INFERRED — from the header text and, more
// importantly, from what the values actually look like. A column
// of "00:1B:44:11:3A:B7" is a MAC whatever it is called; a column
// holding only ACCEPT and REJECT is a status column even if the
// header is in French. Header text is a hint that can be wrong;
// content is evidence.
//
// Every inference is then shown to the reader with the runner-up
// candidates, so a wrong guess is a dropdown away from fixed
// rather than a support email. That is the whole reason this
// approach is safe to ship before seeing a real file.
// ============================================================

export type Role =
  | 'time' | 'status' | 'user' | 'mac' | 'ip'
  | 'device' | 'service' | 'source' | 'enforcement' | 'error' | 'site'

export const ROLE_LABEL: Record<Role, string> = {
  time: 'Timestamp',
  status: 'Login status',
  user: 'Username',
  mac: 'MAC address',
  ip: 'IP address',
  device: 'Network device / NAS',
  service: 'Service',
  source: 'Authentication source',
  enforcement: 'Enforcement profile / role',
  error: 'Error or reason',
  site: 'Site / location',
}

/** Dimensions worth breaking failures down by. */
export const DIMENSIONS: Role[] = [
  'device', 'service', 'source', 'enforcement', 'user', 'mac', 'site',
]

// ------------------------------------------------------------
// content detectors
//
// Deliberately strict. A loose MAC pattern also matches a time,
// and a loose IP pattern also matches a version string — and a
// column mapped to the wrong role is worse than one left unmapped,
// because it produces a confident dashboard full of nonsense.
// ------------------------------------------------------------

const RE_MAC = /^[0-9a-f]{2}([:-])[0-9a-f]{2}(\1[0-9a-f]{2}){4}$|^[0-9a-f]{12}$|^([0-9a-f]{4}\.){2}[0-9a-f]{4}$/i
const RE_IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const RE_INT = /^-?\d{1,10}$/

const ACCEPT_WORDS = /^(accept|accepted|success|successful|allow|allowed|pass|passed|ok|permit|permitted|user_authenticated|auth_success)$/i
const REJECT_WORDS = /^(reject|rejected|fail|failed|failure|deny|denied|drop|dropped|error|timeout|auth_failure|user_not_found)$/i

function looksLikeTime(v: string): boolean {
  if (!v) return false
  // ISO, "2024-05-11 09:31:02", "May 11, 2024 09:31:02", epoch seconds/ms
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(v)) return true
  if (/^\d{2}\/\d{2}\/\d{4}[ ,]\d{2}:\d{2}/.test(v)) return true
  if (/^[A-Z][a-z]{2} \d{1,2},? \d{4}/.test(v)) return true
  if (RE_INT.test(v)) {
    const n = Number(v)
    // plausible epoch: 2001 → 2033, in seconds or milliseconds
    return (n > 1e9 && n < 2e9) || (n > 1e12 && n < 2e12)
  }
  return !Number.isNaN(Date.parse(v)) && /\d/.test(v) && v.length > 7
}

export function parseTime(v: string): number | null {
  if (!v) return null
  if (RE_INT.test(v)) {
    const n = Number(v)
    if (n > 1e12 && n < 2e12) return n
    if (n > 1e9 && n < 2e9) return n * 1000
  }
  // "2024-05-11 09:31:02" is not valid ISO in every engine; make it so
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v) ? v.replace(' ', 'T') : v
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

export function normaliseMac(v: string): string {
  const hex = v.replace(/[^0-9a-f]/gi, '').toUpperCase()
  if (hex.length !== 12) return v.toUpperCase()
  return hex.match(/.{2}/g)!.join(':')
}

/** Is this value a pass, a fail, or neither? */
export function verdict(v: string): 'pass' | 'fail' | null {
  const s = (v || '').trim()
  if (!s) return null
  if (ACCEPT_WORDS.test(s)) return 'pass'
  if (REJECT_WORDS.test(s)) return 'fail'
  // Some exports use a numeric error code column: 0 means success.
  if (RE_INT.test(s)) return s === '0' ? 'pass' : 'fail'
  return null
}

// ------------------------------------------------------------
// column inference
// ------------------------------------------------------------

const HEADER_HINTS: Array<[Role, RegExp, number]> = [
  ['time',        /\b(time|timestamp|date|when|req(uest)?[_ ]?time)\b/i, 60],
  ['status',      /\b(login[_ ]?status|status|result|outcome|disposition|auth[_ ]?result)\b/i, 60],
  ['user',        /\b(user|username|user[_ ]?name|identity|account|login|principal)\b/i, 55],
  ['mac',         /\b(mac|mac[_ ]?address|endpoint|calling[_ ]?station|client[_ ]?mac)\b/i, 55],
  ['ip',          /\b(ip|ip[_ ]?address|client[_ ]?ip|framed[_ ]?ip|nas[_ ]?ip)\b/i, 45],
  ['device',      /\b(nas|nad|network[_ ]?device|device[_ ]?name|switch|controller|authenticator|called[_ ]?station)\b/i, 55],
  ['service',     /\b(service|policy|rule|access[_ ]?policy)\b/i, 50],
  ['source',      /\b(auth(entication)?[_ ]?source|identity[_ ]?store|repository|source)\b/i, 55],
  ['enforcement', /\b(enforcement|role|profile|vlan|posture|attribute)\b/i, 45],
  ['error',       /\b(error|reason|alert|message|failure|detail|code)\b/i, 50],
  ['site',        /\b(site|location|zone|building|region|group|cluster)\b/i, 45],
]

export interface Candidate { index: number; header: string; score: number }
export type Mapping = Partial<Record<Role, number>>

export interface Inference {
  mapping: Mapping
  /** every column ranked per role, so the UI can offer alternatives */
  candidates: Record<Role, Candidate[]>
  headers: string[]
}

/**
 * Scores each column for each role using header text plus the
 * shape of the sampled values, then assigns greedily by score so
 * no two roles claim the same column.
 */
export function infer(headers: string[], sample: string[][]): Inference {
  const n = headers.length
  const col = (i: number) => sample.map(r => (r[i] ?? '').trim()).filter(Boolean)

  const scores: Record<Role, Candidate[]> = {} as Record<Role, Candidate[]>
  for (const role of Object.keys(ROLE_LABEL) as Role[]) scores[role] = []

  for (let i = 0; i < n; i++) {
    const head = headers[i] ?? ''
    const vals = col(i)
    if (vals.length === 0) continue

    const frac = (test: (v: string) => boolean) =>
      vals.filter(test).length / vals.length
    const uniq = new Set(vals.slice(0, 400)).size
    const cardinality = uniq / Math.min(vals.length, 400)

    const macFrac = frac(v => RE_MAC.test(v))
    const ipFrac = frac(v => RE_IPV4.test(v))
    const timeFrac = frac(looksLikeTime)
    const verdictFrac = frac(v => verdict(v) !== null)

    const add = (role: Role, s: number) => {
      if (s > 0) scores[role].push({ index: i, header: head, score: s })
    }

    // content evidence, weighted well above header text
    if (macFrac > 0.8) add('mac', 100 * macFrac)
    if (ipFrac > 0.8) add('ip', 95 * ipFrac)
    if (timeFrac > 0.85) add('time', 100 * timeFrac)
    // a status column is a small closed set of pass/fail words
    if (verdictFrac > 0.85 && uniq <= 12) add('status', 95 * verdictFrac)

    // categorical dimensions: repeated values, not free text, not numbers
    const isCategorical = cardinality < 0.6 && uniq > 1 && frac(v => RE_INT.test(v)) < 0.6
    if (isCategorical) {
      for (const role of ['device', 'service', 'source', 'enforcement', 'site'] as Role[]) {
        add(role, 8)
      }
    }
    // usernames are high-cardinality short strings
    if (cardinality > 0.25 && macFrac < 0.2 && timeFrac < 0.2) add('user', 10)
    // error/reason text is long-ish and often blank on success
    const blankFrac = 1 - vals.length / Math.max(1, sample.length)
    if (blankFrac > 0.3) add('error', 12)

    // header hints
    for (const [role, re, weight] of HEADER_HINTS) {
      if (re.test(head)) add(role, weight)
    }
  }

  for (const role of Object.keys(scores) as Role[]) {
    scores[role].sort((a, b) => b.score - a.score || a.index - b.index)
  }

  // Greedy assignment, strongest claim first. Without this, 'user'
  // and 'error' both grab the same free-text column and one of the
  // two dashboards ends up empty.
  const order = (Object.keys(scores) as Role[])
    .map(r => ({ role: r, best: scores[r][0]?.score ?? 0 }))
    .sort((a, b) => b.best - a.best)

  const taken = new Set<number>()
  const mapping: Mapping = {}
  for (const { role } of order) {
    const pick = scores[role].find(c => !taken.has(c.index) && c.score >= 20)
    if (pick) { mapping[role] = pick.index; taken.add(pick.index) }
  }

  return { mapping, candidates: scores, headers }
}

// ------------------------------------------------------------
// analysis
// ------------------------------------------------------------

export interface Bucket { key: string; total: number; fail: number }
export interface TimeBucket { t: number; total: number; fail: number }

export interface ClearPassAnalysis {
  files: string[]
  rows: number
  unmapped: boolean
  mapping: Mapping
  headers: string[]
  totals: { total: number; pass: number; fail: number; unknown: number }
  window: { from: number; to: number } | null
  timeline: TimeBucket[]
  bucketMs: number
  dims: Partial<Record<Role, Bucket[]>>
  errors: Bucket[]
  findings: Array<{ severity: 'high' | 'medium' | 'info'; headline: string; detail: string }>
}

class Counter {
  private m = new Map<string, Bucket>()
  add(key: string, failed: boolean) {
    if (!key) return
    let b = this.m.get(key)
    if (!b) { b = { key, total: 0, fail: 0 }; this.m.set(key, b) }
    b.total++
    if (failed) b.fail++
  }
  top(limit = 400): Bucket[] {
    return [...this.m.values()].sort((a, b) => b.total - a.total).slice(0, limit)
  }
  get size() { return this.m.size }
}

const STEPS = [
  60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000,
  3_600_000, 3 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000, 86_400_000,
]

/**
 * Accumulates rows as they stream in, so a 200MB export never
 * exists in memory as an array of arrays. Only the aggregates are
 * kept, and those are bounded.
 */
export class Accumulator {
  private counters = new Map<Role, Counter>()
  private errs = new Counter()
  private times: number[] = []
  private timeFail: boolean[] = []
  rows = 0
  pass = 0
  fail = 0
  unknown = 0
  from = Infinity
  to = -Infinity

  constructor(private mapping: Mapping) {
    for (const d of DIMENSIONS) this.counters.set(d, new Counter())
  }

  push(row: string[]) {
    this.rows++
    const m = this.mapping

    const statusIdx = m.status
    const v = statusIdx !== undefined ? verdict(row[statusIdx] ?? '') : null
    const failed = v === 'fail'
    if (v === 'pass') this.pass++
    else if (v === 'fail') this.fail++
    else this.unknown++

    if (m.time !== undefined) {
      const t = parseTime(row[m.time] ?? '')
      if (t !== null) {
        this.times.push(t)
        this.timeFail.push(failed)
        if (t < this.from) this.from = t
        if (t > this.to) this.to = t
      }
    }

    for (const d of DIMENSIONS) {
      const idx = m[d]
      if (idx === undefined) continue
      let key = (row[idx] ?? '').trim()
      if (!key) continue
      if (d === 'mac') key = normaliseMac(key)
      this.counters.get(d)!.add(key, failed)
    }

    if (failed && m.error !== undefined) {
      const e = (row[m.error] ?? '').trim()
      if (e) this.errs.add(e.slice(0, 160), true)
    }
  }

  finish(files: string[], headers: string[]): ClearPassAnalysis {
    const total = this.rows
    const hasWindow = this.from < this.to

    // Pick a bucket that yields a readable number of bars rather
    // than one per row or one for everything.
    let bucketMs = STEPS[STEPS.length - 1]
    if (hasWindow) {
      const span = this.to - this.from
      bucketMs = STEPS.find(s => span / s <= 240) ?? STEPS[STEPS.length - 1]
    }

    const tl = new Map<number, TimeBucket>()
    for (let i = 0; i < this.times.length; i++) {
      const slot = Math.floor(this.times[i] / bucketMs) * bucketMs
      let b = tl.get(slot)
      if (!b) { b = { t: slot, total: 0, fail: 0 }; tl.set(slot, b) }
      b.total++
      if (this.timeFail[i]) b.fail++
    }

    const dims: Partial<Record<Role, Bucket[]>> = {}
    for (const [role, c] of this.counters) if (c.size) dims[role] = c.top()

    const a: ClearPassAnalysis = {
      files,
      rows: total,
      unmapped: this.mapping.status === undefined,
      mapping: this.mapping,
      headers,
      totals: { total, pass: this.pass, fail: this.fail, unknown: this.unknown },
      window: hasWindow ? { from: this.from, to: this.to } : null,
      timeline: [...tl.values()].sort((x, y) => x.t - y.t),
      bucketMs,
      dims,
      errors: this.errs.top(200),
      findings: [],
    }
    a.findings = findingsFor(a)
    return a
  }
}

/**
 * Findings are deliberately conservative. The bar for saying "this
 * is your problem" is a concentration well above the file's own
 * baseline on a population big enough to mean something — anything
 * looser produces a wall of noise that trains people to ignore it.
 */
function findingsFor(a: ClearPassAnalysis): ClearPassAnalysis['findings'] {
  const out: ClearPassAnalysis['findings'] = []
  const denom = a.totals.pass + a.totals.fail
  if (!denom) return out
  const base = a.totals.fail / denom

  if (a.totals.fail > 0) {
    out.push({
      severity: base > 0.2 ? 'high' : base > 0.05 ? 'medium' : 'info',
      headline: `${(base * 100).toFixed(1)}% of authentications failed`,
      detail: `${a.totals.fail.toLocaleString()} of ${denom.toLocaleString()} requests were rejected.`
        + (a.totals.unknown ? ` ${a.totals.unknown.toLocaleString()} rows had a status this tool did not recognise.` : ''),
    })
  }

  const top = a.errors[0]
  if (top && a.totals.fail > 0) {
    const share = top.total / a.totals.fail
    if (share > 0.25) {
      out.push({
        severity: share > 0.5 ? 'high' : 'medium',
        headline: `One reason accounts for ${(share * 100).toFixed(0)}% of failures`,
        detail: `“${top.key}” appears ${top.total.toLocaleString()} times. Fixing this one thing removes most of the failures in this export.`,
      })
    }
  }

  for (const role of DIMENSIONS) {
    const rows = a.dims[role]
    if (!rows) continue
    for (const b of rows.slice(0, 40)) {
      if (b.total < Math.max(25, denom * 0.005)) continue
      if (b.total > denom * 0.6) continue          // that is just the estate
      const rate = b.fail / b.total
      if (rate < 0.5 || rate < base * 2) continue
      out.push({
        severity: rate > 0.9 ? 'high' : 'medium',
        headline: `${ROLE_LABEL[role]} “${b.key}” fails ${(rate * 100).toFixed(0)}% of the time`,
        detail: `${b.fail.toLocaleString()} of ${b.total.toLocaleString()} requests failed, against a ${(base * 100).toFixed(1)}% baseline across the whole export.`,
      })
      break     // one per dimension; the panels carry the rest
    }
  }

  return out
}

export function toCsv(a: ClearPassAnalysis): string {
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = ['Section,Key,Total,Failed']
  lines.push(['Totals', 'All requests', a.totals.total, a.totals.fail].map(esc).join(','))
  for (const role of DIMENSIONS) {
    for (const b of a.dims[role] ?? []) {
      lines.push([ROLE_LABEL[role], b.key, b.total, b.fail].map(esc).join(','))
    }
  }
  for (const e of a.errors) lines.push(['Failure reason', e.key, e.total, e.fail].map(esc).join(','))
  return lines.join('\n')
}
