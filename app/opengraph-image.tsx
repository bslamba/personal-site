// ============================================================
// app/opengraph-image.tsx
//
// The card that renders when the site root is shared anywhere —
// LinkedIn, Slack, Teams, X, WhatsApp, Discord.
//
// The filename is the whole API. Next finds any file called
// opengraph-image in a route folder, runs it at build time, and
// writes the correct <meta property="og:image"> tags itself.
// A file in app/ covers the site; one in a route folder overrides
// it for that route.
//
// NOTE ON FONTS
// This deliberately uses no custom font. ImageResponse renders
// with Satori, which needs the actual font binary fetched at
// build time — and a Google Fonts fetch is exactly what broke
// the build a few days ago. A card that always renders in a
// system face beats a prettier one that fails the deploy.
// ============================================================

import { ImageResponse } from 'next/og'

export const alt = 'Bhawneet Lamba — Infrastructure, cloud and application security'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const RED = '#D3002D'
const INK = '#08080A'
const PAPER = '#FAF8F5'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', background: INK, padding: '64px 72px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 18, height: 18, background: RED }} />
            <div style={{
              fontSize: 22, letterSpacing: 6, color: RED, fontWeight: 700,
              textTransform: 'uppercase',
            }}>
              Est. 2013 · Bangalore
            </div>
          </div>

          <div style={{
            display: 'flex', flexDirection: 'column', marginTop: 44, lineHeight: 0.88,
          }}>
            <div style={{ fontSize: 118, fontWeight: 900, color: PAPER, letterSpacing: -3 }}>
              BHAWNEET
            </div>
            <div style={{ fontSize: 118, fontWeight: 900, color: RED, letterSpacing: -3 }}>
              LAMBA
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 3, background: RED, width: 190 }} />
          <div style={{
            fontSize: 34, color: PAPER, marginTop: 26, fontWeight: 600, lineHeight: 1.3,
          }}>
            Infrastructure, cloud and application security
          </div>
          <div style={{ fontSize: 25, color: '#8A8A93', marginTop: 12 }}>
            Cisco ISE · Network Access Control · Azure · WAF
          </div>
        </div>
      </div>
    ),
    size,
  )
}
