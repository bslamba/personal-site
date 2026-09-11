// ============================================================
// app/happy-birthday/opens/page.tsx
//
// The private tally — how many times the surprise has been opened,
// and when. Yours to look at; nothing about who opened it, because
// nothing about who is ever collected.
//
// Not indexed, and if you set an HB_STATS_KEY environment variable
// the page will only show with ?key=<that value> on the URL, so a
// stray guess of the path shows nothing.
// ============================================================

import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import { readOpens } from '@/lib/opens'

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
              The counter isn&rsquo;t switched on yet. In your Vercel
              dashboard: <b>Storage → Create → Upstash Redis (KV)</b>,
              connect it to this project, and redeploy. Nothing else to
              change — it starts counting on its own.
            </p>
            <p style={{ marginBottom: 0, color: '#6E58A8' }}>
              It only ever stores a number and a time. No names, no
              location, nothing about anyone.
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

            <p
              style={{
                marginTop: '1.75rem',
                marginBottom: 0,
                fontSize: '0.85rem',
                color: '#9A8AC0',
                lineHeight: 1.5,
              }}
            >
              A count only — no names, no location, nothing about who.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
