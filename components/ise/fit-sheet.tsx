'use client'

// ============================================================
// components/ise/fit-sheet.tsx
//
// Scales a fixed-width sheet down until it fits the space it is
// given, so a topic is always visible in a single screen with no
// scrolling. Type gets smaller; the page never gets longer.
//
// A CSS transform is used rather than a font-size change, so the
// whole composition — tables, rules, arrows, code blocks — keeps
// its proportions, and text stays crisp because the browser
// rasterises after the transform.
//
// The reader can override the fit with the zoom control; past
// the fit ratio the container simply becomes pannable.
// ============================================================

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Minus, Plus, Maximize2 } from 'lucide-react'

export const CANVAS = 1480

// Candidate canvas widths, narrowest first.
//
// A sheet holds a roughly fixed amount of content, so laying it
// out narrow makes it tall and laying it out wide makes it short.
// Only one width makes the sheet's aspect ratio match the screen's,
// and that width is the one that can be scaled up the most before
// it runs out of room. Anything else wastes space along one axis.
//
// The wide end of the range only ever wins on a wide screen, where
// winning means the sheet renders at close to 1:1 — so the lines get
// physically long but the type is full size, which is the trade a
// large monitor exists to make. On a laptop the arithmetic rejects
// those widths by itself and settles around the middle.
const WIDTHS = [1180, 1320, 1480, 1640, 1800, 1980, 2180, 2400, 2650]

const HEAD = { fontFamily: 'var(--font-heading)' } as const

export default function FitSheet({
  children,
  canvas,
  maxScale = 1.9,
  padding = 10,
}: {
  children: React.ReactNode
  /** Pin the canvas width instead of choosing the best fit. */
  canvas?: number
  maxScale?: number
  padding?: number
}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const [fit, setFit] = useState(1)
  const [zoom, setZoom] = useState<number | null>(null)
  const [contentH, setContentH] = useState(0)
  const [width, setWidth] = useState(canvas ?? CANVAS)

  const measure = useCallback(() => {
    const outer = outerRef.current
    const content = contentRef.current
    if (!outer || !content) return

    const availW = outer.clientWidth - padding * 2
    const availH = outer.clientHeight - padding * 2
    if (availW <= 0 || availH <= 0) return

    const candidates = canvas ? [canvas] : WIDTHS

    let bestW = candidates[0]
    let bestS = 0
    let bestH = 0

    for (const w of candidates) {
      // Lay the content out at this width and read the height it
      // settles to. scrollHeight is the untransformed layout height —
      // a CSS transform takes no part in layout — so measuring here
      // cannot feed back on the scale we are about to apply.
      content.style.width = `${w}px`
      const h = content.scrollHeight
      if (h <= 0) continue
      const s = Math.min(availW / w, availH / h, maxScale)
      if (s > bestS) {
        bestS = s
        bestW = w
        bestH = h
      }
    }

    content.style.width = `${bestW}px`
    setWidth(bestW)
    setContentH(bestH)
    setFit(bestS > 0 ? bestS : 1)
  }, [canvas, maxScale, padding])

  useLayoutEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    if (outerRef.current) ro.observe(outerRef.current)
    if (contentRef.current) ro.observe(contentRef.current)
    return () => ro.disconnect()
  }, [measure])

  // Re-measure once webfonts land, since Inter Tight and the mono
  // stack change every metric on the sheet.
  useEffect(() => {
    let cancelled = false
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    fonts?.ready.then(() => {
      if (!cancelled) measure()
    })
    return () => {
      cancelled = true
    }
  }, [measure])

  const scale = zoom ?? fit
  const atFit = zoom === null

  const step = (delta: number) =>
    setZoom(z => {
      const base = z ?? fit
      return Math.min(4, Math.max(0.2, +(base + delta).toFixed(3)))
    })

  return (
    // h-full, not flex-1: the parent is an ordinary block that has
    // already been given a definite height by the page's column
    // flex. A flex-1 here would resolve against nothing and the
    // sheet would grow to its content instead of fitting the screen.
    <div className="relative h-full w-full">
      <div
        ref={outerRef}
        className="ise-fit-outer h-full w-full overflow-auto"
        style={{ padding }}
      >
        <div
          className="ise-fit-scaler mx-auto"
          style={{
            width: width * scale,
            height: contentH ? contentH * scale : undefined,
          }}
        >
          <div
            ref={contentRef}
            className="ise-fit-content origin-top-left"
            style={{
              width,
              transform: `scale(${scale})`,
            }}
          >
            {children}
          </div>
        </div>
      </div>

      {/* ---- zoom control ----
           Bottom left, because the site's floating WhatsApp button
           owns the bottom right corner on every page. */}
      <div className="ise-noprint absolute bottom-2 left-3 flex items-center gap-px border border-ink-200 bg-white/95 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => step(-0.1)}
          className="px-1.5 py-1 text-ink-500 hover:bg-paper-dim hover:text-ink-950"
          aria-label="Zoom out"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span
          className="min-w-[3.1rem] border-x border-ink-200 px-1 py-1 text-center text-[9.5px] font-bold tabular-nums text-ink-600"
          style={HEAD}
        >
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => step(0.1)}
          className="px-1.5 py-1 text-ink-500 hover:bg-paper-dim hover:text-ink-950"
          aria-label="Zoom in"
        >
          <Plus className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => setZoom(null)}
          disabled={atFit}
          className="border-l border-ink-200 px-1.5 py-1 text-ink-500 hover:bg-paper-dim hover:text-ink-950 disabled:opacity-35 disabled:hover:bg-transparent"
          aria-label="Fit to screen"
          title="Fit to screen"
        >
          <Maximize2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
