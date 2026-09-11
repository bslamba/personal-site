// ============================================================
// lib/opens.ts
//
// A count of how many times the surprise has been opened. Nothing
// about who — no names, no location, no identifiers of any kind. A
// number, the time of the most recent open, and a per-day tally so
// the private page can show a little history. That is all that is
// ever stored.
//
// It runs on the store the site is connected to (Vercel KV /
// Upstash Redis). If no store is connected the whole thing is inert:
// recording is a no-op and the page says it is not switched on yet,
// so the site never breaks for the sake of a counter.
// ============================================================

import { Redis } from '@upstash/redis'

const KEY_TOTAL = 'hb:opens'
const KEY_LAST = 'hb:last'
const dayKey = (iso: string) => `hb:day:${iso.slice(0, 10)}`

// Vercel injects KV_REST_API_* when you connect a KV store; a plain
// Upstash integration uses UPSTASH_REDIS_REST_*. Accept either, so
// whichever way the store is connected just works.
function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

export const opensConfigured = () => getRedis() !== null

/** Count one open. Fire-and-forget; never throws to the caller. */
export async function recordOpen(): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  const now = new Date().toISOString()
  try {
    await Promise.all([
      redis.incr(KEY_TOTAL),
      redis.set(KEY_LAST, now),
      redis.incr(dayKey(now)),
    ])
  } catch {
    /* the counter is a nicety, never load-bearing */
  }
}

export interface OpensSummary {
  configured: boolean
  total: number
  last: string | null
  days: { date: string; count: number }[]
}

/** Read the tally for the private page. */
export async function readOpens(): Promise<OpensSummary> {
  const redis = getRedis()
  if (!redis) return { configured: false, total: 0, last: null, days: [] }

  try {
    const dates: string[] = []
    for (let i = 0; i < 14; i++) {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - i)
      dates.push(d.toISOString().slice(0, 10))
    }

    const [total, last, ...counts] = await Promise.all([
      redis.get<number>(KEY_TOTAL),
      redis.get<string>(KEY_LAST),
      ...dates.map(d => redis.get<number>(`hb:day:${d}`)),
    ])

    const days = dates
      .map((date, i) => ({ date, count: Number(counts[i] ?? 0) }))
      .filter(d => d.count > 0)

    return {
      configured: true,
      total: Number(total ?? 0),
      last: last ?? null,
      days,
    }
  } catch {
    return { configured: true, total: 0, last: null, days: [] }
  }
}
