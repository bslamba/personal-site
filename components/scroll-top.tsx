'use client'

// ============================================================
// components/scroll-top.tsx
//
// A small round "back to top" button, fixed bottom-right, stacked
// above the WhatsApp float. Hidden until the reader has scrolled
// down a little, then it fades in. Click scrolls smoothly to top.
// Used on every /blog page via app/blog/layout.tsx.
// ============================================================

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'

export default function ScrollTop() {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setShown(window.scrollY > 400))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={`scroll-top${shown ? ' is-shown' : ''}`}
      aria-label="Back to top"
      title="Back to top"
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
    >
      <ArrowUp className="h-[45%] w-[45%]" aria-hidden="true" />
    </button>
  )
}
