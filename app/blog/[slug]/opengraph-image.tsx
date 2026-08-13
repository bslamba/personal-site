// ============================================================
// app/blog/[slug]/opengraph-image.tsx
//
// A card per article, carrying its actual title.
//
// This is the one that compounds. Every time someone shares one
// of the 39 articles, the link renders as a titled card rather
// than a bare URL — and if the message-code pages get written,
// each of those gets its own card too, with the code on it.
// ============================================================

import { ImageResponse } from 'next/og'
import { getPost, getPostSlugs } from '@/lib/blog'

export const alt = 'Article'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const RED = '#D3002D'
const INK = '#08080A'
const PAPER = '#FAF8F5'

/** Pre-render a card for every article at build time. */
export function generateStaticParams() {
  return getPostSlugs().map(slug => ({ slug }))
}

export default async function Image({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug)
  const title = post?.title ?? 'Bhawneet Lamba'
  const tags = (post?.tags ?? []).slice(0, 4)

  // Long titles need to step down or they overflow the card.
  const fontSize = title.length > 95 ? 50 : title.length > 60 ? 60 : 70

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', background: PAPER, padding: '56px 66px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 46, height: 3, background: RED }} />
            <div style={{
              fontSize: 20, letterSpacing: 5, color: RED, fontWeight: 700,
              textTransform: 'uppercase',
            }}>
              The Journal
            </div>
          </div>

          <div style={{
            fontSize, fontWeight: 900, color: INK, marginTop: 30,
            lineHeight: 1.08, letterSpacing: -1.5,
          }}>
            {title}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {tags.length > 0 && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 26 }}>
              {tags.map(t => (
                <div key={t} style={{
                  fontSize: 20, color: '#5C5C64', border: '1px solid #D9D9DE',
                  padding: '7px 15px',
                }}>
                  {t}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div style={{ fontSize: 30, fontWeight: 900, color: INK }}>BHAWNEET</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: RED }}>LAMBA</div>
            <div style={{ fontSize: 22, color: '#8A8A93', marginLeft: 10 }}>
              Infrastructure &amp; cloud security
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
