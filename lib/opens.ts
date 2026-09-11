// ============================================================
// lib/opens.ts
//
// A count of how many times the surprise has been opened, and when
// — nothing about who. No names, no location, no identifiers. A
// running number, the time of the most recent open, and a per-day
// tally. That is all that is ever stored.
//
// It talks to the store (Vercel KV / Upstash Redis) directly over
// its REST API with fetch — no client library, so there is no extra
// dependency to install or bundle. If no store is connected the
// whole thing is inert: recording is a no-op and the page says it
// is not switched on, so the site never breaks for a counter.
// ============================================================

const KEY_TOTAL = 'hb:opens'
const KEY_LAST = 'hb:last'
const dayKey = (iso: string) => `hb:day:${iso.slice(0, 10)}`

// Vercel injects KV_REST_API_* when you connect a KV store; a plain
// Upstash integration uses UPSTASH_REDIS_REST_*. Accept either.
function creds(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

export const opensConfigured = () => creds() !== null

/**
 * Run one or more Redis commands through the Upstash REST pipeline.
 * Each command is an array like ['INCR', 'hb:opens']. Returns the
 * list of results, or null if anything goes wrong — the caller
 * decides what a null means, and it is never allowed to throw.
 */
async function pipeline(
  commands: (string | number)[][]
): Promise<unknown[] | null> {
  const c = creds()
  if (!c) return null
  try {
    const res = await fetch(`${c.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as { result?: unknown; error?: string }[]
    return data.map(d => (d && 'result' in d ? d.result : null))
  } catch {
    return null
  }
}

/** Count one open. Fire-and-forget; never throws to the caller. */
export async function recordOpen(): Promise<void> {
  const now = new Date().toISOString()
  await pipeline([
    ['INCR', KEY_TOTAL],
    ['SET', KEY_LAST, now],
    ['INCR', dayKey(now)],
  ])
}

export interface OpensSummary {
  configured: boolean
  total: number
  last: string | null
  days: { date: string; count: number }[]
}

/** Read the tally for the private page. */
export async function readOpens(): Promise<OpensSummary> {
  if (!creds()) return { configured: false, total: 0, last: null, days: [] }

  const dates: string[] = []
  for (let i = 0; i < 14; i++) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }

  const results = await pipeline([
    ['GET', KEY_TOTAL],
    ['GET', KEY_LAST],
    ...dates.map(d => ['GET', `hb:day:${d}`]),
  ])

  // Configured, but the store could not be reached this time.
  if (!results) return { configured: true, total: 0, last: null, days: [] }

  const total = Number(results[0] ?? 0)
  const last = (results[1] as string | null) ?? null
  const days = dates
    .map((date, i) => ({ date, count: Number(results[i + 2] ?? 0) }))
    .filter(d => d.count > 0)

  return { configured: true, total, last, days }
}
