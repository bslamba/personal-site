// ============================================================
// app/happy-birthday/opens/page.tsx
// ============================================================

import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import { readOpens } from '@/lib/opens'
import { Redis } from '@upstash/redis'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Opens',
  robots: { index: false, follow: false, nocache: true },
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

export default async function OpensPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const requiredKey = process.env.HB_STATS_KEY
  const { key } = await props.searchParams
  const authorised = !requiredKey || key === requiredKey

  const wrap: CSSProperties = {
    minHeight: '100svh',
    display: 'grid',
    placeItems: 'center',
    padding: '2rem 1.25rem',
    background: 'linear-gradient(180deg, #FBFAFF 0%, #EDE6FB 100%)',
    color: '#33285A',
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  }
  const card: CSSProperties = {
    width: 'min(30rem, 100%)',
    background: 'rgba(255,255,255,0.8)',
    border: '1px solid rgba(255,255,255,0.9)',
    borderRadius: '1.25rem',
    boxShadow: '0 30px 60px -28px rgba(78,58,130,0.35)',
    padding: 'clamp(1.5rem, 6vw, 2.5rem)',
    backdropFilter: 'blur(12px)',
  }

  if (!authorised) {
    return (
      <main style={wrap}>
        <div style={card}>
          <p style={{ margin: 0, color: '#6E58A8' }}>
            Add <code>?key=…</code> to the address to view this.
          </p>
        </div>
      </main>
    )
  }

  const { configured, total, last, days } = await readOpens()

  // Fetch the locations from our new database list safely
  let visits: any[] = [];
  let dbError = "";
  try {
    const redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "",
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "",
    });
    visits = (await redis.lrange('page-visits', 0, 49)) || [];
  } catch (error: any) {
    console.error("Could not load location visits", error);
    dbError = error.message || "Unknown database error";
  }

  return (
    <main style={wrap}>
      <div style={card}>
        <p
          style={{
            margin: 0,
            fontSize: '0.72rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#8A6BC8',
          }}
        >
          Nishu&rsquo;s surprise
        </p>

        {!configured ? (
          <div style={{ marginTop: '1rem', lineHeight: 1.6 }}>
            <p style={{ marginTop: 0 }}>
              The counter isn&rsquo;t switched on yet.
            </p>
          </div>
        ) : (
          <>
            <div style={{ marginTop: '0.75rem' }}>
              <span
                style={{
                  fontSize: 'clamp(3.5rem, 18vw, 5.5rem)',
                  fontWeight: 800,
                  lineHeight: 1,
                  color: '#6B4BB0',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {total}
              </span>
              <span
                style={{
                  marginLeft: '0.6rem',
                  fontSize: '1.05rem',
                  color: '#4A3D72',
                }}
              >
                {total === 1 ? 'open' : 'opens'}
              </span>
            </div>

            <p style={{ marginTop: '0.4rem', color: '#6E58A8' }}>
              {last ? (
                <>
                  Last opened <b>{timeAgo(last)}</b>
                  <span style={{ color: '#9A8AC0' }}>
                    {' '}
                    · {new Date(last).toLocaleString()}
                  </span>
                </>
              ) : (
                'Not opened yet.'
              )}
            </p>

            {days.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <p
                  style={{
                    margin: '0 0 0.5rem',
                    fontSize: '0.72rem',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: '#8A6BC8',
                  }}
                >
                  Recent days
                </p>
                {days.map(d => (
                  <div
                    key={d.date}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '0.35rem 0',
                      borderTop: '1px solid rgba(138,107,200,0.15)',
                    }}
                  >
                    <span style={{ color: '#4A3D72' }}>
                      {new Date(d.date + 'T00:00:00').toLocaleDateString(
                        undefined,
                        { weekday: 'short', month: 'short', day: 'numeric' }
                      )}
                    </span>
                    <span
                      style={{
                        fontWeight: 700,
                        color: '#6B4BB0',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {d.count}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* NEW LOCATIONS TABLE (ALWAYS VISIBLE NOW) */}
            <div style={{ marginTop: '2rem' }}>
              <p
                style={{
                  margin: '0 0 0.5rem',
                  fontSize: '0.72rem',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: '#8A6BC8',
                }}
              >
                Visit Locations
              </p>
              
              {dbError ? (
                <p style={{ color: '#D946EF', fontSize: '0.85rem' }}>
                  Database Error: {dbError}
                </p>
              ) : visits.length === 0 ? (
                <p style={{ color: '#9A8AC0', fontSize: '0.85rem', fontStyle: 'italic' }}>
                  Waiting for first location... (Make sure you clicked "Allow" on the main page!)
                </p>
              ) : (
                <div style={{ 
                  maxHeight: '250px', 
                  overflowY: 'auto',
                  borderTop: '1px solid rgba(138,107,200,0.15)'
                }}>
                  <table style={{ width: '100%', fontSize: '0.85rem', textAlign: 'left', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: '#6E58A8' }}>
                        <th style={{ padding: '0.5rem 0', fontWeight: 'normal' }}>Time</th>
                        <th style={{ padding: '0.5rem 0', fontWeight: 'normal' }}>Lat</th>
                        <th style={{ padding: '0.5rem 0', fontWeight: 'normal' }}>Lng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visits.map((v: any, i: number) => (
                        <tr key={i} style={{ borderTop: '1px solid rgba(138,107,200,0.15)', color: '#4A3D72' }}>
                          <td style={{ padding: '0.5rem 0' }}>
                            {new Date(v.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '0.5rem 0' }}>{v.lat ? v.lat.toFixed(4) : 'Denied'}</td>
                          <td style={{ padding: '0.5rem 0' }}>{v.lng ? v.lng.toFixed(4) : 'Denied'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
