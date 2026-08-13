// ============================================================
// app/tools/ise-radius/opengraph-image.tsx
//
// The card for the analyser. This is the one that matters most —
// it is what a Cisco Community post or a LinkedIn share will
// render, and it has about one second to say what the thing does
// and why it is safe to use.
//
// So the privacy claim is on the card itself rather than buried
// on the page. An ISE engineer's first reaction to "upload your
// logs" is refusal, and answering that before they click is
// worth more than any adjective.
// ============================================================

import { ImageResponse } from 'next/og'

export const alt = 'Cisco ISE Report Analyser — runs entirely in your browser'
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
          justifyContent: 'space-between', background: PAPER, padding: '58px 68px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{
            fontSize: 21, letterSpacing: 5, color: RED, fontWeight: 700,
            textTransform: 'uppercase',
          }}>
            Free tool · No sign-up · No upload
          </div>

          <div style={{
            fontSize: 76, fontWeight: 900, color: INK, marginTop: 26,
            lineHeight: 1.02, letterSpacing: -2,
          }}>
            Cisco ISE Report Analyser
          </div>

          <div style={{ fontSize: 29, color: '#3A3A40', marginTop: 24, lineHeight: 1.4 }}>
            Support bundles, RADIUS Authentications, Key Performance Metrics
            and Active Sessions — every failure reason resolved to its ISE code.
          </div>
        </div>

        {/* the objection, answered before the click */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 5, height: 92, background: RED }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: INK }}>
              Nothing is uploaded. Ever.
            </div>
            <div style={{ fontSize: 23, color: '#5C5C64', marginTop: 8 }}>
              Runs entirely in your browser — disconnect from the network and it still works.
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
