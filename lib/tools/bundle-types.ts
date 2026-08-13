// ============================================================
// lib/tools/bundle-types.ts
//
// The shape of a support bundle report.
//
// Two things produce this: the in-browser worker, and the
// standalone CLI for bundles too large to open in a tab. One
// renderer draws both, so the shape lives on its own rather than
// inside either producer.
// ============================================================

export interface KeyCount { key: string; count: number }

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
      client: { count: number; mean: number; p50: number; p90: number; p95: number; p99: number; max: number }
      request: { count: number; mean: number; p50: number; p90: number; p95: number; p99: number; max: number }
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
  /** files inside the archive that were read, for transparency */
  filesRead?: { name: string; bytes: number }[]
}

export function isBundleReport(v: unknown): v is BundleReport {
  return Boolean(v) && typeof v === 'object' &&
    (v as { kind?: string }).kind === 'ise-bundle-report'
}

// ------------------------------------------------------------
// messages between the worker and the page
// ------------------------------------------------------------
export type WorkerIn = { file: File; passphrase: string }

export type WorkerOut =
  | { type: 'stage'; stage: string }
  | { type: 'progress'; bytes: number; entry: string | null }
  | { type: 'done'; report: BundleReport }
  | { type: 'error'; message: string }
