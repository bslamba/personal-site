'use client'

// ============================================================
// components/article-toc.tsx
//
// Sticky table of contents for article pages.
//
//   · Tracks which section you're reading and highlights it
//   · The active item grows slightly and turns red
//   · The list auto-scrolls to keep the active item visible
//   · A thin progress rail shows how far through you are
//   · Collapses to a <details> block on small screens
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'

export interface Heading {
  id: string
  text: string
  level: number
}

export default function ArticleToc({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState<string>(headings[0]?.id ?? '')
  const [progress, setProgress] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  // ---- Track the section currently being read ----
  useEffect(() => {
    if (headings.length === 0) return

    let frame = 0

    const measure = () => {
      const offset = window.scrollY + 140   // just below the sticky header

      let current = headings[0].id
      for (const h of headings) {
        const el = document.getElementById(h.id)
        if (!el) continue
        const top = el.getBoundingClientRect().top + window.scrollY
        if (top <= offset) current = h.id
        else break
      }
      setActive(current)

      // Reading progress across the whole document
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      setProgress(scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0)
    }

    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [headings])

  // ---- Keep the active item visible inside the sidebar ----
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-toc-id="${active}"]`)
    // block: 'nearest' scrolls the sidebar only, never the page
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active])

  const jump = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault()
    const el = document.getElementById(id)
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - 110
    window.scrollTo({ top, behavior: 'smooth' })
    history.replaceState(null, '', `#${id}`)
  }, [])

  if (headings.length < 3) return null

  const links = (
    <ul ref={listRef} className="toc-list">
      {headings.map(h => (
        <li key={h.id} className={h.level === 3 ? 'toc-sub' : undefined}>
          <a
            href={`#${h.id}`}
            data-toc-id={h.id}
            onClick={e => jump(e, h.id)}
            aria-current={active === h.id ? 'location' : undefined}
            className={`toc-link${active === h.id ? ' is-active' : ''}`}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  )

  return (
    <>
      {/* ---------------- DESKTOP: sticky rail ---------------- */}
      <nav aria-label="On this page" className="toc-desktop">
        <div className="toc-inner">
          <div className="toc-head">
            <span className="label text-signal-500">On this page</span>
            <span className="toc-pct" aria-hidden="true">
              {Math.round(progress * 100)}%
            </span>
          </div>

          <div className="toc-rail" aria-hidden="true">
            <span
              className="toc-rail-fill"
              style={{ transform: `scaleY(${progress})` }}
            />
          </div>

          {links}
        </div>
      </nav>

      {/* ---------------- MOBILE: collapsible ---------------- */}
      <details className="toc-mobile">
        <summary>
          <span className="label text-signal-500">On this page</span>
          <span className="toc-count">{headings.length}</span>
        </summary>
        <div className="mt-4">{links}</div>
      </details>
    </>
  )
}
