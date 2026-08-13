'use client'

// ============================================================
// components/tools/guide.tsx
//
// A small guide who walks a first-time visitor through the tool.
//
// Three deliberate constraints:
//
//   1. He never blocks anything. pointer-events are off on the
//      figure and the bubble, so he can stand over the drop zone
//      without swallowing a click meant for the button behind him.
//   2. He is dismissible and he remembers. A mascot you cannot
//      turn off stops being charming on the second visit, so the
//      dismissal is written to localStorage and he stays gone.
//   3. He is drawn, not animated frame by frame. Everything is
//      SVG transforms driven by CSS, which means it is a few
//      kilobytes and scales to any display without a sprite sheet.
//
// He is also honest about state: the step is derived from what
// the page is actually doing — no files, files chosen, working,
// done — rather than a timer pretending to know.
// ============================================================

import { useEffect, useState } from 'react'

export type GuideStep = 'welcome' | 'choose' | 'analyse' | 'working' | 'done'

const LINES: Record<GuideStep, { text: string; mood: 'wave' | 'point' | 'cheer' }> = {
  welcome: {
    text: 'Sat sri akal! Glad you are here. This page reads Cisco ISE exports right inside your browser — nothing is uploaded, ever.',
    mood: 'wave',
  },
  choose: {
    text: 'Start here — pick your files. A support bundle, any of the CSV exports, or all seven dashboard files at once.',
    mood: 'point',
  },
  analyse: {
    text: 'Got them. Now press Analyse and I will put it all on one dashboard.',
    mood: 'point',
  },
  working: {
    text: 'Reading them now. Big bundles take a moment — everything is being parsed on your own machine.',
    mood: 'cheer',
  },
  done: {
    text: 'All done. Scroll on through — click any row to filter, and open any panel for the full sortable list.',
    mood: 'cheer',
  },
}

const DISMISS_KEY = 'ise-guide-dismissed'

/**
 * Anchors the guide beside a target element.
 *
 * Measurement rather than fixed placement, because the two buttons
 * he points at move with the viewport width. Positions are taken
 * relative to the stage so the figure can be absolutely placed
 * inside it without caring where the stage sits on the page.
 */
function useAnchor(
  stageRef: React.RefObject<HTMLElement | null>,
  targetRef: React.RefObject<HTMLElement | null>,
  active: boolean,
) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  // useEffect, not useLayoutEffect: this component is server-
  // rendered, and useLayoutEffect warns there. The cost is one
  // frame before he moves, which the 0.9s glide hides anyway.
  useEffect(() => {
    if (!active) return
    const measure = () => {
      const stage = stageRef.current
      const target = targetRef.current
      if (!stage || !target) { setPos(null); return }
      const s = stage.getBoundingClientRect()
      const t = target.getBoundingClientRect()
      setPos({
        x: t.left - s.left + t.width / 2,
        y: t.top - s.top,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    // Fonts and images landing late move the buttons; re-measure
    // when the layout of the stage itself changes.
    const ro = new ResizeObserver(measure)
    if (stageRef.current) ro.observe(stageRef.current)
    return () => { window.removeEventListener('resize', measure); ro.disconnect() }
  }, [active, stageRef, targetRef])

  return pos
}

export function useGuideStep({ hasFiles, busy, ready }: {
  hasFiles: boolean; busy: boolean; ready: boolean
}): GuideStep {
  const [seenWelcome, setSeenWelcome] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setSeenWelcome(true), 5200)
    return () => window.clearTimeout(t)
  }, [])

  if (ready) return 'done'
  if (busy) return 'working'
  if (hasFiles) return 'analyse'
  return seenWelcome ? 'choose' : 'welcome'
}

export default function Guide({ step, stageRef, chooseRef, analyseRef }: {
  step: GuideStep
  stageRef: React.RefObject<HTMLElement | null>
  chooseRef: React.RefObject<HTMLElement | null>
  analyseRef: React.RefObject<HTMLElement | null>
}) {
  const [dismissed, setDismissed] = useState(true)

  // Read the preference after mount only — localStorage does not
  // exist on the server, and reading it during render would make
  // the first client paint disagree with the server's.
  useEffect(() => {
    try { setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1') }
    catch { setDismissed(false) }
  }, [])

  const pointingAtChoose = step === 'choose'
  const pointingAtAnalyse = step === 'analyse'
  const chooseAt = useAnchor(stageRef, chooseRef, pointingAtChoose)
  const analyseAt = useAnchor(stageRef, analyseRef, pointingAtAnalyse)

  if (dismissed) return null

  const anchor = pointingAtChoose ? chooseAt : pointingAtAnalyse ? analyseAt : null
  const line = LINES[step]

  // Standing to the left of a target unless that would run him off
  // the stage, in which case he stands to the right and flips.
  const flip = anchor ? anchor.x < 200 : false
  const left = anchor ? anchor.x + (flip ? 76 : -76) : 96
  const top = anchor ? anchor.y - 132 : 40

  const dismiss = () => {
    setDismissed(true)
    try { window.localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode */ }
  }

  return (
    <div
      className="guide"
      style={{ left, top, transform: flip ? 'scaleX(-1)' : undefined }}
      data-mood={line.mood}
    >
      <div className="guide-bubble" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
        <p>{line.text}</p>
        {/* The only interactive part, so it is the only part that
            re-enables pointer events. */}
        <button type="button" onClick={dismiss} className="guide-x" aria-label="Hide the guide">
          ✕
        </button>
      </div>

      <svg className="guide-figure" viewBox="0 0 120 170" role="img"
           aria-label="An illustrated guide pointing at the next step">
        <defs>
          <linearGradient id="guideTurban" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF9E4A" />
            <stop offset="100%" stopColor="#E8701F" />
          </linearGradient>
          <linearGradient id="guideKurta" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7FD7F5" />
            <stop offset="100%" stopColor="#3FA6D8" />
          </linearGradient>
        </defs>

        {/* shadow on the ground */}
        <ellipse className="guide-shadow" cx="60" cy="163" rx="26" ry="5" fill="#0A1622" opacity=".22" />

        <g className="guide-body">
          {/* legs */}
          <path d="M50 128 L47 156" stroke="#2C3A52" strokeWidth="9" strokeLinecap="round" />
          <path d="M70 128 L73 156" stroke="#2C3A52" strokeWidth="9" strokeLinecap="round" />
          <path d="M40 158 h16" stroke="#1B2536" strokeWidth="6" strokeLinecap="round" />
          <path d="M64 158 h16" stroke="#1B2536" strokeWidth="6" strokeLinecap="round" />

          {/* kurta */}
          <path d="M60 68 C42 70 36 84 36 100 L38 130 C46 134 74 134 82 130 L84 100 C84 84 78 70 60 68 Z"
                fill="url(#guideKurta)" />
          <path d="M60 70 L60 128" stroke="#2A8DC0" strokeWidth="1.6" opacity=".55" />

          {/* left arm, tucked */}
          <g className="guide-arm-left">
            <path d="M40 92 C32 100 30 112 32 122" stroke="url(#guideKurta)" strokeWidth="10"
                  strokeLinecap="round" fill="none" />
            <circle cx="32" cy="124" r="5.5" fill="#E8B98C" />
          </g>

          {/* right arm — this is the one that points */}
          <g className="guide-arm-right">
            <path d="M80 92 C92 96 100 92 106 84" stroke="url(#guideKurta)" strokeWidth="10"
                  strokeLinecap="round" fill="none" />
            <g className="guide-hand">
              <circle cx="108" cy="82" r="6" fill="#E8B98C" />
              {/* index finger, extended */}
              <path d="M112 80 L120 74" stroke="#E8B98C" strokeWidth="4.4" strokeLinecap="round" />
            </g>
          </g>

          {/* head */}
          <g className="guide-head">
            <path d="M60 66 L60 60" stroke="#E8B98C" strokeWidth="9" strokeLinecap="round" />
            <circle cx="60" cy="42" r="21" fill="#EFC195" />

            {/* beard, short */}
            <path d="M41 44 C42 60 50 66 60 66 C70 66 78 60 79 44 C74 56 46 56 41 44 Z"
                  fill="#2B2118" opacity=".85" />

            {/* eyes, with a slow blink */}
            <g className="guide-eyes">
              <ellipse cx="52" cy="40" rx="2.6" ry="3" fill="#17202E" />
              <ellipse cx="68" cy="40" rx="2.6" ry="3" fill="#17202E" />
            </g>
            <path d="M52 50 C56 54 64 54 68 50" stroke="#8A4A32" strokeWidth="2.2"
                  strokeLinecap="round" fill="none" />

            {/* the turban: dome, wrap lines and the front knot */}
            <path d="M37 36 C37 17 47 8 60 8 C73 8 83 17 83 36 C74 30 46 30 37 36 Z"
                  fill="url(#guideTurban)" />
            <path d="M39 30 C48 24 72 24 81 30" stroke="#B85510" strokeWidth="1.7"
                  fill="none" opacity=".75" />
            <path d="M41 22 C50 16 70 16 79 22" stroke="#B85510" strokeWidth="1.7"
                  fill="none" opacity=".6" />
            <path d="M56 12 L64 12 L61 22 L59 22 Z" fill="#FFD08A" opacity=".95" />
            <path d="M37 36 C44 40 76 40 83 36 L82 41 C74 45 46 45 38 41 Z" fill="#D96A16" />
          </g>
        </g>
      </svg>

      <style>{`
        .guide {
          position: absolute;
          z-index: 4;
          width: 120px;
          pointer-events: none;
          transition: left .9s cubic-bezier(.22,.7,.24,1), top .9s cubic-bezier(.22,.7,.24,1);
        }
        .guide-figure { width: 120px; height: 170px; overflow: visible; }

        /* a slow, small idle — big enough to read as alive, small
           enough that it never pulls the eye off the data */
        @keyframes guide-idle {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }
        .guide-body { animation: guide-idle 3.4s ease-in-out infinite; transform-origin: 60px 160px; }

        @keyframes guide-shadow {
          0%, 100% { transform: scaleX(1); opacity: .22; }
          50%      { transform: scaleX(.9); opacity: .16; }
        }
        .guide-shadow { animation: guide-shadow 3.4s ease-in-out infinite; transform-origin: 60px 163px; }

        @keyframes guide-blink {
          0%, 92%, 100% { transform: scaleY(1); }
          95%           { transform: scaleY(.08); }
        }
        .guide-eyes { animation: guide-blink 5.2s infinite; transform-origin: 60px 40px; }

        @keyframes guide-nod {
          0%, 100% { transform: rotate(0deg); }
          50%      { transform: rotate(-3deg); }
        }
        .guide-head { animation: guide-nod 4.6s ease-in-out infinite; transform-origin: 60px 62px; }

        /* wave: the whole arm swings from the shoulder */
        @keyframes guide-wave {
          0%, 100% { transform: rotate(0deg); }
          25%      { transform: rotate(-22deg); }
          60%      { transform: rotate(8deg); }
        }
        .guide[data-mood="wave"] .guide-arm-right {
          animation: guide-wave 1.5s ease-in-out infinite;
          transform-origin: 80px 92px;
        }

        /* point: hold the arm out and pulse the finger toward the
           target, which is what actually draws the eye down the arm */
        @keyframes guide-point {
          0%, 100% { transform: translate(0,0); }
          50%      { transform: translate(5px,-4px); }
        }
        .guide[data-mood="point"] .guide-hand {
          animation: guide-point 1.1s ease-in-out infinite;
        }
        .guide[data-mood="point"] .guide-arm-right { transform: rotate(-6deg); transform-origin: 80px 92px; }

        @keyframes guide-cheer {
          0%, 100% { transform: rotate(-38deg); }
          50%      { transform: rotate(-52deg); }
        }
        .guide[data-mood="cheer"] .guide-arm-right {
          animation: guide-cheer .9s ease-in-out infinite;
          transform-origin: 80px 92px;
        }

        .guide-bubble {
          position: absolute;
          bottom: 152px;
          left: 50%;
          width: 250px;
          margin-left: -30px;
          padding: 11px 13px;
          border-radius: 16px;
          background: rgba(255,255,255,.94);
          color: #16202E;
          font-size: 12.5px;
          line-height: 1.45;
          box-shadow: 0 10px 28px -12px rgba(10,18,34,.55), inset 0 0 0 1px rgba(255,255,255,.9);
          animation: guide-pop .45s cubic-bezier(.2,1.1,.3,1) both;
        }
        .guide-bubble p { margin: 0; padding-right: 12px; }
        .guide-bubble::after {
          content: '';
          position: absolute; bottom: -7px; left: 26px;
          width: 14px; height: 14px;
          background: rgba(255,255,255,.94);
          transform: rotate(45deg);
          border-radius: 0 0 3px 0;
        }
        @keyframes guide-pop {
          from { opacity: 0; transform: translateY(8px) scale(.94); }
          to   { opacity: 1; transform: none; }
        }
        .guide-x {
          position: absolute; top: 4px; right: 5px;
          width: 18px; height: 18px;
          border-radius: 50%;
          font-size: 10px; line-height: 1;
          color: #5A6472;
          pointer-events: auto;
          cursor: pointer;
        }
        .guide-x:hover { background: rgba(10,18,34,.08); color: #16202E; }

        @media (max-width: 780px) {
          /* On a narrow screen he would sit on top of the buttons he
             is pointing at, which is worse than not having him. */
          .guide { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .guide, .guide-body, .guide-shadow, .guide-eyes, .guide-head,
          .guide-arm-right, .guide-hand, .guide-bubble {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  )
}
