'use client'

// ============================================================
// components/tools/guide.tsx
//
// Rover — the Windows XP Search Companion — as the page guide.
//
// WHY THIS REPLACED A HAND-BUILT CHARACTER
//
// The two attempts before this were CSS transforms on vector
// shapes. That is simply a weaker medium than what Rover is: a
// professional animator drew every frame of every action, and the
// runtime plays them by stepping a sprite sheet. Thirty-odd
// hand-drawn animations cannot be approximated with keyframes on
// paths, and trying harder at the wrong technique was the mistake.
//
// ClippyJS is a fresh MIT-licensed rewrite of the original
// Microsoft Agent runtime, with the character data extracted from
// the shipped agents. The code is open; the artwork remains
// Microsoft's, which is a judgement call that was made knowingly.
//
// WHAT THIS FILE ACTUALLY DOES
//
// Very little, and that is the point. It maps page state onto
// agent commands and gets out of the way:
//
//   moveTo(x, y)     walks him beside the control
//   gestureAt(x, y)  points at it — a real animation, chosen by
//                    the runtime from the direction of travel
//   speak(text)      the balloon
//   play(name)       a named action for the non-pointing states
//
// Animation names are resolved against what the agent actually
// reports rather than hardcoded, because the action sets differ
// between characters and a missing name is a silent no-op.
// ============================================================

import { useEffect, useRef, useState } from 'react'

export type GuideStep = 'welcome' | 'choose' | 'analyse' | 'working' | 'done'

const DISMISS_KEY = 'ise-guide-dismissed'

/** Where he stands relative to the thing he is pointing at. */
const STAND_OFF = 178
const RISE = 44

interface Agent {
  show: () => void
  hide: () => void
  speak: (text: string, opts?: { hold?: boolean; tts?: boolean }) => void
  play: (name: string) => void
  animate: () => void
  animations: () => string[]
  moveTo: (x: number, y: number) => void
  gestureAt: (x: number, y: number) => void
  stop: () => void
  stopCurrent: () => void
  dispose: () => void
}

const LINES: Record<GuideStep, string> = {
  welcome:
    'Hello! I can help you here. Everything on this page runs inside your own browser — no file is ever uploaded.',
  choose:
    'Start over here. Pick your ISE files — a support bundle, any of the CSV exports, or all seven dashboard files at once.',
  analyse:
    'Got them! Now press Analyse and I will put the whole lot onto one dashboard.',
  working:
    'Reading them now. A big support bundle takes a moment — it is all being parsed on your own machine.',
  done:
    'All done! Scroll on down. Click any row to filter the dashboard, or open a panel for the full sortable list.',
}

/**
 * Picks the first animation the agent actually has.
 *
 * Rover, Links and Clippy do not share an action set, and asking
 * for a name a character does not own fails quietly — you get a
 * still character and no error to explain it.
 */
function pick(available: string[], candidates: string[]): string | null {
  for (const c of candidates) if (available.includes(c)) return c
  return null
}

const ACTIONS = {
  greet:   ['Greeting', 'Wave', 'GetAttention', 'Alert'],
  think:   ['Searching', 'Processing', 'Thinking', 'Writing', 'GetTechy'],
  cheer:   ['Congratulate', 'Pleased', 'Wave', 'Alert'],
  notice:  ['GetAttention', 'Alert', 'Greeting'],
}

export function useGuideStep({ hasFiles, busy, ready }: {
  hasFiles: boolean; busy: boolean; ready: boolean
}): GuideStep {
  const [greeted, setGreeted] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setGreeted(true), 5000)
    return () => window.clearTimeout(t)
  }, [])

  if (ready) return 'done'
  if (busy) return 'working'
  if (hasFiles) return 'analyse'
  return greeted ? 'choose' : 'welcome'
}

export default function Guide({ step, chooseRef, analyseRef }: {
  step: GuideStep
  /** kept for call-site compatibility; page coordinates are used */
  stageRef?: React.RefObject<HTMLElement | null>
  chooseRef: React.RefObject<HTMLElement | null>
  analyseRef: React.RefObject<HTMLElement | null>
}) {
  const agentRef = useRef<Agent | null>(null)
  const namesRef = useRef<string[]>([])
  const [ready, setReady] = useState(false)
  const [dismissed, setDismissed] = useState(true)

  // localStorage does not exist on the server, and reading it
  // during render would make the first client paint disagree with
  // the server's. So: after mount, always.
  useEffect(() => {
    try { setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1') }
    catch { setDismissed(false) }
  }, [])

  // ---- load the agent ----
  useEffect(() => {
    if (dismissed) return
    let cancelled = false
    let local: Agent | null = null

    ;(async () => {
      try {
        // Dynamic import keeps roughly 200KB of sprite sheet and
        // runtime off the critical path, and out of the server
        // bundle entirely — this package touches document on load.
        const [{ initAgent }, { Rover }] = await Promise.all([
          import('clippyjs'),
          import('clippyjs/agents'),
        ])
        if (cancelled) return

        const agent = (await initAgent(Rover)) as unknown as Agent
        if (cancelled) { agent.dispose(); return }

        local = agent
        agentRef.current = agent
        namesRef.current = agent.animations() ?? []
        agent.show()
        setReady(true)
      } catch {
        // A missing package or a blocked CDN must not take the tool
        // down with it. The page works perfectly without him.
        if (!cancelled) setReady(false)
      }
    })()

    return () => {
      cancelled = true
      try { local?.dispose() } catch { /* already gone */ }
      agentRef.current = null
    }
  }, [dismissed])

  // ---- drive him from page state ----
  useEffect(() => {
    const agent = agentRef.current
    if (!agent || !ready) return

    const names = namesRef.current
    const target =
      step === 'choose' ? chooseRef.current
      : step === 'analyse' ? analyseRef.current
      : null

    // Everything is queued and runs in order, so this reads as one
    // continuous performance rather than four commands racing.
    agent.stop()

    if (target) {
      const r = target.getBoundingClientRect()
      const cx = r.left + window.scrollX + r.width / 2
      const cy = r.top + window.scrollY + r.height / 2

      // Stand clear of the control, on whichever side has room.
      // Standing on top of the thing you are pointing at is the
      // one failure that makes a guide worse than no guide.
      const leftSide = r.left + window.scrollX - STAND_OFF
      const x = leftSide > 16 ? leftSide : r.right + window.scrollX + 40
      const y = Math.max(window.scrollY + 12, r.top + window.scrollY - RISE)

      agent.moveTo(x, y)
      const notice = pick(names, ACTIONS.notice)
      if (notice) agent.play(notice)
      agent.gestureAt(cx, cy)
      agent.speak(LINES[step], { hold: true })
      return
    }

    const action =
      step === 'welcome' ? pick(names, ACTIONS.greet)
      : step === 'working' ? pick(names, ACTIONS.think)
      : step === 'done' ? pick(names, ACTIONS.cheer)
      : null

    if (action) agent.play(action)
    agent.speak(LINES[step], { hold: true })
  }, [step, ready, chooseRef, analyseRef])

  const dismiss = () => {
    try { agentRef.current?.stop(); agentRef.current?.hide() } catch { /* fine */ }
    setDismissed(true)
    try { window.localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode */ }
  }

  if (dismissed || !ready) return null

  return (
    <>
      <button type="button" onClick={dismiss} className="rover-off lg-pill">
        Hide Rover
      </button>

      <style>{`
        .rover-off {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 10000;
          padding: 6px 12px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .09em;
          text-transform: uppercase;
          color: #16202E;
          background: rgba(255,255,255,.9);
          cursor: pointer;
        }
        .rover-off:hover { background: #fff; }

        /* The agent is appended to <body>, so it sits outside every
           stacking context on the page. This keeps it under the
           site header rather than over it, and stops it eating
           clicks meant for the controls it is pointing at. */
        .clippy, .clippy-balloon {
          z-index: 9990 !important;
        }
        .clippy { pointer-events: none !important; }
        .clippy-balloon { pointer-events: auto; }

        @media (max-width: 900px) {
          .clippy, .clippy-balloon, .rover-off { display: none !important; }
        }
      `}</style>
    </>
  )
}
