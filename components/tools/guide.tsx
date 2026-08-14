'use client'

// ============================================================
// components/tools/guide.tsx
//
// A dog who shows a first-time visitor where to click.
//
// WHY THE PREVIOUS VERSION LOOKED CHEAP
//
// It was a stack of independent CSS loops — each limb doing its
// own thing on its own clock, all starting together, all easing
// the same way. That is exactly what reads as "cheap animation",
// and no amount of extra keyframes fixes it. What makes drawn
// motion look alive is a small set of specific principles, and
// this rebuild applies them deliberately:
//
//   OVERLAPPING ACTION — nothing starts at once. The tail lags the
//     body, the ears lag the head, the tail tip lags the tail
//     base. Every lag is a negative animation-delay, so the parts
//     are permanently out of phase instead of marching together.
//   FOLLOW-THROUGH — the tail and ears are drawn in two hinged
//     segments so the far end keeps travelling after the near end
//     has turned back. This is most of the difference.
//   SECONDARY MOTION — breathing, weight shifting, an occasional
//     ear twitch. None of it is the "point"; all of it is why the
//     point looks like it came from something alive.
//   ANTICIPATION — before he raises a paw he dips very slightly
//     the other way first.
//   WEIGHT — the contact shadow widens and lightens as he rises,
//     on the same clock as the bounce. Without it a bouncing
//     character floats.
//   EYE LIFE — irregular blinks (a long cycle with two blinks at
//     uneven offsets, so it never looks metronomic) and pupils
//     that actually track the button being pointed at.
//
// And the pointing is measured, not guessed: the foreleg rotates
// by the real angle from the paw to the centre of the target, so
// he is correct at any viewport width rather than approximately
// correct at one.
//
// Three hard rules kept from before: he never swallows a click
// (pointer-events off except the dismiss button), his state is
// derived from what the tool is actually doing, and he can be
// dismissed for good.
// ============================================================

import { useEffect, useState } from 'react'

export type GuideStep = 'welcome' | 'choose' | 'analyse' | 'working' | 'done'
type Mood = 'greet' | 'point' | 'work' | 'cheer'

const LINES: Record<GuideStep, { text: string; mood: Mood }> = {
  welcome: {
    text: 'Hello! Everything here runs inside your browser — no file ever leaves your machine.',
    mood: 'greet',
  },
  choose: {
    text: 'Start over here — pick your files. A support bundle, any CSV export, or all seven dashboard files at once.',
    mood: 'point',
  },
  analyse: {
    text: 'Got them! Now press Analyse and I will put it all on one dashboard.',
    mood: 'point',
  },
  working: {
    text: 'Reading them now. Big bundles take a moment — it is all being parsed right here.',
    mood: 'work',
  },
  done: {
    text: 'All done! Scroll on down — click any row to filter, or open a panel for the full sortable list.',
    mood: 'cheer',
  },
}

const DISMISS_KEY = 'ise-guide-dismissed'
const DOG_W = 156
const DOG_H = 150
const GAP = 30          // clear space between the dog and the button
const PAW_X = 116       // paw pivot inside the drawing, unflipped
const PAW_Y = 88

interface Box { x: number; y: number; w: number; h: number }

/**
 * Measures a target relative to the stage.
 *
 * Measured rather than placed by hand because the two buttons move
 * with the viewport, and a mascot pointing confidently at empty
 * space is worse than no mascot.
 */
function useBox(
  stageRef: React.RefObject<HTMLElement | null>,
  targetRef: React.RefObject<HTMLElement | null>,
  active: boolean,
): Box | null {
  const [box, setBox] = useState<Box | null>(null)

  // useEffect, not useLayoutEffect: this is server-rendered and
  // useLayoutEffect warns there. Costs one frame, which the glide
  // hides anyway.
  useEffect(() => {
    if (!active) { setBox(null); return }
    const measure = () => {
      const stage = stageRef.current
      const target = targetRef.current
      if (!stage || !target) return
      const s = stage.getBoundingClientRect()
      const t = target.getBoundingClientRect()
      setBox({ x: t.left - s.left, y: t.top - s.top, w: t.width, h: t.height })
    }
    measure()
    window.addEventListener('resize', measure)
    const ro = new ResizeObserver(measure)
    if (stageRef.current) ro.observe(stageRef.current)
    return () => { window.removeEventListener('resize', measure); ro.disconnect() }
  }, [active, stageRef, targetRef])

  return box
}

export function useGuideStep({ hasFiles, busy, ready }: {
  hasFiles: boolean; busy: boolean; ready: boolean
}): GuideStep {
  const [greeted, setGreeted] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setGreeted(true), 4800)
    return () => window.clearTimeout(t)
  }, [])

  if (ready) return 'done'
  if (busy) return 'working'
  if (hasFiles) return 'analyse'
  return greeted ? 'choose' : 'welcome'
}

export default function Guide({ step, stageRef, chooseRef, analyseRef }: {
  step: GuideStep
  stageRef: React.RefObject<HTMLElement | null>
  chooseRef: React.RefObject<HTMLElement | null>
  analyseRef: React.RefObject<HTMLElement | null>
}) {
  const [dismissed, setDismissed] = useState(true)

  // Read after mount only. localStorage does not exist on the
  // server and reading it during render would make the first
  // client paint disagree with the server's.
  useEffect(() => {
    try { setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1') }
    catch { setDismissed(false) }
  }, [])

  const atChoose = step === 'choose'
  const atAnalyse = step === 'analyse'
  const chooseBox = useBox(stageRef, chooseRef, atChoose)
  const analyseBox = useBox(stageRef, analyseRef, atAnalyse)

  if (dismissed) return null

  const target = atChoose ? chooseBox : atAnalyse ? analyseBox : null
  const line = LINES[step]
  const pointing = line.mood === 'point' && target !== null

  // Stand to the left of the button, or to the right and mirrored
  // if there is not room. Never on top of it.
  let flip = false
  let left = 40
  let top = 30

  if (target) {
    const wantLeft = target.x - GAP - DOG_W
    if (wantLeft >= 0) {
      left = wantLeft
    } else {
      left = target.x + target.w + GAP
      flip = true
    }
    // Feet land just below the button's midline, so he reads as
    // standing beside it rather than floating next to it.
    top = target.y + target.h / 2 - DOG_H + 34
  }

  // The real angle from the paw to the centre of the button. In
  // the mirrored case the whole drawing is flipped, so the sign of
  // the angle has to flip with it or he points backwards.
  let pointAngle = 0
  let gazeX = 0
  let gazeY = 0
  if (target) {
    const pawX = left + (flip ? DOG_W - PAW_X : PAW_X)
    const pawY = top + PAW_Y
    const dx = (target.x + target.w / 2) - pawX
    const dy = (target.y + target.h / 2) - pawY

    // The angle has to be computed in the drawing's own coordinate
    // space, not the screen's. When the figure is mirrored, its
    // local +x runs left across the screen — so mirror dx BEFORE
    // taking the arctangent. Negating the finished angle instead
    // is the obvious move and it is wrong: it sends him pointing
    // back over his own shoulder.
    const ex = flip ? -dx : dx
    const deg = (Math.atan2(dy, ex) * 180) / Math.PI
    pointAngle = Math.max(-62, Math.min(42, deg))

    const len = Math.hypot(ex, dy) || 1
    gazeX = (ex / len) * 1.7
    gazeY = (dy / len) * 1.3
  }

  const dismiss = () => {
    setDismissed(true)
    try { window.localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode */ }
  }

  return (
    <>
      {/* A soft ring on the button itself. The dog says "that
          direction"; this says "this one". Purely decorative and
          click-through, so the button underneath is untouched. */}
      {pointing && target && (
        <span className="dog-halo" aria-hidden="true"
              style={{ left: target.x - 7, top: target.y - 7, width: target.w + 14, height: target.h + 14 }} />
      )}

      <div className="dog-guide" data-mood={line.mood} style={{ left, top }}>
        <div className="dog-bubble" style={flip ? { left: 'auto', right: 6 } : undefined}>
          <p>{line.text}</p>
          <button type="button" onClick={dismiss} className="dog-x" aria-label="Hide the guide">✕</button>
          <span className="dog-bubble-tail" style={flip ? { left: 'auto', right: 30 } : undefined} />
        </div>

        <svg
          className="dog-svg"
          viewBox="0 0 156 150"
          role="img"
          aria-label="An illustrated dog pointing at the next step"
          style={{
            transform: flip ? 'scaleX(-1)' : undefined,
            ['--pt' as string]: `${pointAngle}deg`,
            ['--gx' as string]: `${gazeX}px`,
            ['--gy' as string]: `${gazeY}px`,
          }}
        >
          <defs>
            {/* Volume comes from gradients rather than outlines —
                a flat fill with a black stroke is what makes vector
                characters look like clip-art. */}
            <radialGradient id="dogCoat" cx="38%" cy="28%" r="82%">
              <stop offset="0%" stopColor="#F2B968" />
              <stop offset="58%" stopColor="#DE9A45" />
              <stop offset="100%" stopColor="#B87830" />
            </radialGradient>
            <radialGradient id="dogHead" cx="36%" cy="26%" r="80%">
              <stop offset="0%" stopColor="#F6C377" />
              <stop offset="62%" stopColor="#E2A050" />
              <stop offset="100%" stopColor="#BE7F35" />
            </radialGradient>
            <linearGradient id="dogCream" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFF6E4" />
              <stop offset="100%" stopColor="#F2DCB6" />
            </linearGradient>
            <linearGradient id="dogEar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C4832F" />
              <stop offset="100%" stopColor="#8E5A21" />
            </linearGradient>
            <radialGradient id="dogNose" cx="34%" cy="28%" r="76%">
              <stop offset="0%" stopColor="#5C5560" />
              <stop offset="55%" stopColor="#2B2630" />
              <stop offset="100%" stopColor="#171319" />
            </radialGradient>
            <radialGradient id="dogEye" cx="36%" cy="30%" r="76%">
              <stop offset="0%" stopColor="#6B4A2E" />
              <stop offset="70%" stopColor="#2A1A0E" />
              <stop offset="100%" stopColor="#140C06" />
            </radialGradient>
            <linearGradient id="dogTongue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F58098" />
              <stop offset="100%" stopColor="#D8506E" />
            </linearGradient>
          </defs>

          {/* contact shadow — spreads and pales as he rises */}
          <ellipse className="dog-shadow" cx="74" cy="141" rx="40" ry="6.5" fill="#0A1622" opacity=".26" />

          {/*
            Everything above the ground goes in one rig group. The
            whole-body moves — sway, hop — belong here and nowhere
            else: put them on the individual limb groups and they
            overwrite the limb's own animation, because two
            animations on one element do not compose, the last one
            simply wins.
          */}
          <g className="dog-rig">

          {/* ---- tail: two hinged segments so the tip follows through ---- */}
          <g className="dog-tail-a">
            <path d="M40 96 C22 92 12 78 14 62"
                  stroke="url(#dogCoat)" strokeWidth="13" strokeLinecap="round" fill="none" />
            <g className="dog-tail-b">
              <path d="M14 62 C13 50 18 41 27 36"
                    stroke="url(#dogCoat)" strokeWidth="11" strokeLinecap="round" fill="none" />
              <path d="M27 36 C31 33 35 32 38 33"
                    stroke="#FFF3DC" strokeWidth="9" strokeLinecap="round" fill="none" />
            </g>
          </g>

          {/* ---- far hind leg, behind the body ---- */}
          <path d="M56 104 C50 118 52 130 58 136" stroke="#C98A3B" strokeWidth="15"
                strokeLinecap="round" fill="none" />

          {/* ---- body ---- */}
          <g className="dog-torso">
            <path d="M96 62 C72 60 52 74 50 96 C48 118 60 134 82 136
                     C104 138 118 126 120 104 C122 82 114 66 96 62 Z"
                  fill="url(#dogCoat)" />
            {/* cream chest and belly */}
            <path d="M104 84 C92 84 84 94 84 108 C84 124 94 134 106 134
                     C116 134 122 124 122 108 C122 92 114 84 104 84 Z"
                  fill="url(#dogCream)" opacity=".95" />
            {/* ambient occlusion where the head meets the chest */}
            <ellipse cx="100" cy="70" rx="24" ry="9" fill="#8E5A21" opacity=".22" />
          </g>

          {/* ---- near hind leg ---- */}
          <g className="dog-hind">
            <path d="M74 106 C66 120 68 132 76 138" stroke="url(#dogCoat)" strokeWidth="19"
                  strokeLinecap="round" fill="none" />
            <ellipse cx="78" cy="138" rx="11" ry="6" fill="#F0DCB6" />
          </g>

          {/* ---- standing foreleg ---- */}
          <g className="dog-fore-b">
            <path d="M100 106 C99 120 100 130 101 136" stroke="url(#dogCoat)" strokeWidth="14"
                  strokeLinecap="round" fill="none" />
            <ellipse cx="101" cy="138" rx="10" ry="5.5" fill="#F6E6C6" />
          </g>

          {/* ---- pointing foreleg: rotates by the measured angle ---- */}
          <g className="dog-fore-a">
            <path d="M112 96 C122 96 132 94 141 90" stroke="url(#dogCoat)" strokeWidth="13"
                  strokeLinecap="round" fill="none" />
            <g className="dog-paw">
              <ellipse cx="144" cy="89" rx="9" ry="7.5" fill="#F6E6C6" transform="rotate(-14 144 89)" />
              <ellipse cx="149" cy="86" rx="2.6" ry="2.2" fill="#E0BE8E" />
              <ellipse cx="146" cy="93" rx="2.6" ry="2.2" fill="#E0BE8E" />
            </g>
          </g>

          {/* ---- head ---- */}
          <g className="dog-head">
            {/* far ear, behind the skull */}
            <g className="dog-ear-far">
              <path d="M92 30 C86 14 92 6 102 8 C112 10 114 24 108 36 Z" fill="#B0721F" />
            </g>

            <path d="M96 22 C76 22 62 38 62 58 C62 76 76 88 96 88
                     C116 88 128 74 128 56 C128 36 116 22 96 22 Z"
                  fill="url(#dogHead)" />

            {/* muzzle */}
            <path d="M74 62 C64 62 58 70 58 78 C58 87 66 92 76 92
                     C88 92 96 86 96 76 C96 67 86 62 74 62 Z"
                  fill="url(#dogCream)" />
            {/* blaze up the forehead */}
            <path d="M92 26 C86 34 84 46 86 58 C90 60 96 60 100 58
                     C102 46 100 34 94 26 Z" fill="#FFF3DC" opacity=".55" />

            <g className="dog-snout">
              <path d="M62 74 C60 72 60 69 63 68 C66 67 69 69 69 72 C69 75 65 76 62 74 Z"
                    fill="url(#dogNose)" />
              <ellipse cx="63.5" cy="70" rx="1.5" ry="1" fill="#8C8494" opacity=".8" />
            </g>
            {/* mouth */}
            <path className="dog-mouth" d="M64 80 C68 85 76 86 81 82"
                  stroke="#8A5A28" strokeWidth="2.2" strokeLinecap="round" fill="none" />
            {/* tongue, only out when he is panting or pleased */}
            <path className="dog-tongue" d="M70 84 C66 84 64 88 65 92 C66 96 72 97 75 94 C77 91 75 85 70 84 Z"
                  fill="url(#dogTongue)" />

            {/* eyes: whites, tracking pupils, highlights, lids */}
            <g className="dog-eyes">
              <ellipse cx="82" cy="54" rx="7.2" ry="7.6" fill="#FFFDF7" />
              <ellipse cx="104" cy="52" rx="7.2" ry="7.6" fill="#FFFDF7" />
              <g className="dog-pupils">
                <circle cx="82" cy="54" r="4.6" fill="url(#dogEye)" />
                <circle cx="104" cy="52" r="4.6" fill="url(#dogEye)" />
                <circle cx="80.3" cy="52.2" r="1.7" fill="#FFFFFF" opacity=".95" />
                <circle cx="102.3" cy="50.2" r="1.7" fill="#FFFFFF" opacity=".95" />
                <circle cx="84" cy="56.4" r=".9" fill="#FFFFFF" opacity=".55" />
                <circle cx="106" cy="54.4" r=".9" fill="#FFFFFF" opacity=".55" />
              </g>
              {/* lids drop from above — a scaled eyeball reads as a
                  shrinking ball, a lid reads as a blink */}
              <g className="dog-lids">
                <ellipse cx="82" cy="46.4" rx="7.6" ry="8" fill="url(#dogHead)" />
                <ellipse cx="104" cy="44.4" rx="7.6" ry="8" fill="url(#dogHead)" />
              </g>
            </g>

            {/* brows carry almost all of the expression */}
            <g className="dog-brows">
              <path d="M75 42 C79 39 86 39 89 42" stroke="#A9691F" strokeWidth="2.6"
                    strokeLinecap="round" fill="none" />
              <path d="M98 40 C101 37 108 37 112 40" stroke="#A9691F" strokeWidth="2.6"
                    strokeLinecap="round" fill="none" />
            </g>

            {/* near ear, two segments so the tip whips a beat late */}
            <g className="dog-ear-near">
              <path d="M118 30 C126 16 138 16 140 28 C142 40 132 50 122 52 Z" fill="url(#dogEar)" />
              <g className="dog-ear-tip">
                <path d="M132 44 C138 44 142 40 142 34 C142 44 138 50 130 52 Z" fill="#8E5A21" />
              </g>
            </g>
          </g>
          </g>
        </svg>
      </div>

      <style>{`
        .dog-guide {
          position: absolute;
          z-index: 4;
          width: ${DOG_W}px;
          pointer-events: none;
          transition: left 1.05s cubic-bezier(.34,.72,.28,1),
                      top  1.05s cubic-bezier(.34,.72,.28,1);
        }
        .dog-svg { width: ${DOG_W}px; height: ${DOG_H}px; overflow: visible; }

        /* ---------------------------------------------------------
           Breathing. Always on, in every mood. It is the cheapest
           possible signal that a drawing is alive, and its absence
           is why a still character reads as a sticker.
           --------------------------------------------------------- */
        @keyframes dog-breathe {
          0%, 100% { transform: scale(1, 1); }
          45%      { transform: scale(1.018, 1.03); }
        }
        .dog-torso { animation: dog-breathe 3.1s ease-in-out infinite; transform-origin: 86px 130px; }

        /* Weight shift on the rig: slower than the breath and a
           different duration, so the two never fall into step. Two
           loops that share a period read as one mechanism. */
        @keyframes dog-sway {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          50%      { transform: translateX(1.5px) rotate(.7deg); }
        }
        .dog-rig {
          transform-origin: 82px 140px;
          animation: dog-sway 4.7s ease-in-out infinite;
        }

        /* ---------------------------------------------------------
           Tail. Two segments, and the tip runs on the same duration
           with a negative delay — so it is permanently a fraction of
           a cycle behind the base. That lag is follow-through, and
           it is most of what separates this from a windscreen wiper.
           --------------------------------------------------------- */
        @keyframes dog-wag-a {
          0%, 100% { transform: rotate(-11deg); }
          50%      { transform: rotate(13deg); }
        }
        @keyframes dog-wag-b {
          0%, 100% { transform: rotate(-15deg); }
          50%      { transform: rotate(17deg); }
        }
        .dog-tail-a {
          transform-origin: 42px 96px;
          animation: dog-wag-a 1.15s ease-in-out infinite;
        }
        .dog-tail-b {
          transform-origin: 15px 63px;
          animation: dog-wag-b 1.15s ease-in-out infinite;
          animation-delay: -.17s;
        }
        .dog-guide[data-mood="greet"] .dog-tail-a,
        .dog-guide[data-mood="greet"] .dog-tail-b { animation-duration: .5s; }
        .dog-guide[data-mood="cheer"] .dog-tail-a,
        .dog-guide[data-mood="cheer"] .dog-tail-b { animation-duration: .34s; }
        .dog-guide[data-mood="work"]  .dog-tail-a,
        .dog-guide[data-mood="work"]  .dog-tail-b { animation-duration: 1.9s; }
        .dog-guide[data-mood="greet"] .dog-tail-b,
        .dog-guide[data-mood="cheer"] .dog-tail-b { animation-delay: -.09s; }

        /* ---------------------------------------------------------
           Head. A slow figure-of-eight rather than a single axis —
           real heads never rotate about one point — plus a distinct
           inquisitive tilt when he is pointing.
           --------------------------------------------------------- */
        @keyframes dog-head-idle {
          0%, 100% { transform: rotate(0deg) translate(0, 0); }
          30%      { transform: rotate(-2.4deg) translate(-.6px, .5px); }
          65%      { transform: rotate(1.8deg) translate(.5px, -.4px); }
        }
        .dog-head {
          transform-origin: 96px 82px;
          animation: dog-head-idle 5.3s ease-in-out infinite;
        }
        @keyframes dog-head-tilt {
          0%, 100% { transform: rotate(-9deg); }
          50%      { transform: rotate(-13.5deg); }
        }
        .dog-guide[data-mood="point"] .dog-head {
          animation: dog-head-tilt 2.6s ease-in-out infinite;
        }

        /* ---------------------------------------------------------
           Ears. Independent phases, and the near ear's tip lags its
           own base — the same trick as the tail, at a smaller scale.
           The occasional single-ear twitch is what sells it as an
           animal rather than a puppet.
           --------------------------------------------------------- */
        @keyframes dog-ear-swing {
          0%, 100% { transform: rotate(0deg); }
          50%      { transform: rotate(5.5deg); }
        }
        @keyframes dog-ear-twitch {
          0%, 88%, 100% { transform: rotate(0deg); }
          91%           { transform: rotate(-13deg); }
          94%           { transform: rotate(4deg); }
        }
        .dog-ear-near {
          transform-origin: 120px 32px;
          animation: dog-ear-swing 2.9s ease-in-out infinite,
                     dog-ear-twitch 7.3s ease-in-out infinite;
        }
        .dog-ear-tip {
          transform-origin: 133px 44px;
          animation: dog-ear-swing 2.9s ease-in-out infinite;
          animation-delay: -.24s;
        }
        .dog-ear-far {
          transform-origin: 100px 32px;
          animation: dog-ear-swing 3.4s ease-in-out infinite;
          animation-delay: -.55s;
        }
        /* Ears up and forward when there is something to look at.
           Done as a second keyframe set rather than a plain
           transform, because a running animation always beats a
           static declaration on the same property. */
        @keyframes dog-ear-alert {
          0%, 100% { transform: rotate(-8deg); }
          50%      { transform: rotate(-3deg); }
        }
        .dog-guide[data-mood="point"] .dog-ear-near,
        .dog-guide[data-mood="point"] .dog-ear-far {
          animation: dog-ear-alert 2.2s ease-in-out infinite;
        }
        .dog-guide[data-mood="point"] .dog-ear-far { animation-delay: -.4s; }

        /* ---------------------------------------------------------
           Eyes. One long cycle carrying two blinks at uneven
           offsets, so the rhythm never resolves into a beat. The
           lids travel; the eyeball does not squash.
           --------------------------------------------------------- */
        @keyframes dog-blink {
          0%, 34%, 100% { transform: translateY(0); }
          36%, 38%      { transform: translateY(8.4px); }
          40%           { transform: translateY(0); }
          72%           { transform: translateY(0); }
          74%, 75.5%    { transform: translateY(8.4px); }
          78%           { transform: translateY(0); }
        }
        .dog-lids { animation: dog-blink 6.4s ease-in-out infinite; }

        /* Pupils sit where the button is. --gx/--gy come from the
           measured direction to the target, so his gaze is correct
           at any width rather than aimed at a guess. */
        .dog-pupils {
          transform: translate(var(--gx, 0px), var(--gy, 0px));
          transition: transform .5s cubic-bezier(.3,.7,.3,1);
        }
        @keyframes dog-glance {
          0%, 100% { transform: translate(var(--gx, 0px), var(--gy, 0px)); }
          52%      { transform: translate(calc(var(--gx, 0px) * .3), calc(var(--gy, 0px) * .3 - .8px)); }
        }
        .dog-guide[data-mood="point"] .dog-pupils {
          animation: dog-glance 3.4s ease-in-out infinite;
        }

        /* brows lift when pointing — the expression lives here */
        .dog-brows { transition: transform .4s ease; transform-origin: 94px 41px; }
        .dog-guide[data-mood="point"] .dog-brows { transform: translateY(-1.8px); }
        .dog-guide[data-mood="cheer"] .dog-brows { transform: translateY(-2.6px) scaleY(.85); }

        /* ---------------------------------------------------------
           The point itself. --pt is the measured angle from paw to
           button. The keyframe overshoots slightly past it and
           settles back, which is the anticipation-and-settle that
           makes a gesture look intended rather than snapped into
           place.
           --------------------------------------------------------- */
        .dog-fore-a {
          transform-origin: 108px 98px;
          transform: rotate(6deg);
          transition: transform .55s cubic-bezier(.3,.8,.3,1);
        }
        @keyframes dog-point {
          0%    { transform: rotate(calc(var(--pt) + 7deg)); }
          22%   { transform: rotate(calc(var(--pt) - 5deg)); }
          46%   { transform: rotate(var(--pt)); }
          70%   { transform: rotate(calc(var(--pt) - 3.5deg)); }
          100%  { transform: rotate(var(--pt)); }
        }
        .dog-guide[data-mood="point"] .dog-fore-a {
          animation: dog-point 2.2s cubic-bezier(.32,.72,.3,1) infinite;
        }
        /* a small extension of the paw along the same line */
        @keyframes dog-paw-reach {
          0%, 100% { transform: translate(0, 0); }
          46%      { transform: translate(3.5px, -1px); }
        }
        .dog-guide[data-mood="point"] .dog-paw {
          animation: dog-paw-reach 2.2s cubic-bezier(.32,.72,.3,1) infinite;
        }

        /* greeting wave, from the shoulder */
        @keyframes dog-wave {
          0%, 100% { transform: rotate(-34deg); }
          28%      { transform: rotate(-58deg); }
          62%      { transform: rotate(-24deg); }
        }
        .dog-guide[data-mood="greet"] .dog-fore-a {
          animation: dog-wave 1.05s ease-in-out infinite;
        }

        /* ---------------------------------------------------------
           Celebration bounce. The shadow is on the same clock and
           moves the opposite way — wider and fainter at the top of
           the arc. Without that a jumping character has no weight.
           --------------------------------------------------------- */
        @keyframes dog-hop {
          0%, 100% { transform: translateY(0) scale(1, 1); }
          18%      { transform: translateY(2px) scale(1.05, .94); }   /* anticipation, squash */
          46%      { transform: translateY(-15px) scale(.96, 1.06); } /* airborne, stretch */
          74%      { transform: translateY(1.5px) scale(1.04, .95); } /* landing, squash */
        }
        .dog-guide[data-mood="cheer"] .dog-rig {
          animation: dog-hop .92s cubic-bezier(.3,.6,.35,1) infinite;
        }
        @keyframes dog-shadow-idle {
          0%, 100% { transform: scaleX(1); opacity: .26; }
          45%      { transform: scaleX(.97); opacity: .23; }
        }
        @keyframes dog-shadow-hop {
          0%, 100% { transform: scaleX(1);   opacity: .28; }
          46%      { transform: scaleX(.62); opacity: .12; }
          74%      { transform: scaleX(1.08); opacity: .3; }
        }
        .dog-shadow {
          transform-origin: 74px 141px;
          animation: dog-shadow-idle 3.1s ease-in-out infinite;
        }
        .dog-guide[data-mood="cheer"] .dog-shadow {
          animation: dog-shadow-hop .92s cubic-bezier(.3,.6,.35,1) infinite;
        }

        /* ---------------------------------------------------------
           Panting. Tongue out only while he is working or pleased,
           with the mouth opening on the same clock.
           --------------------------------------------------------- */
        .dog-tongue { opacity: 0; transform-origin: 70px 84px; transform: scaleY(.2); }
        @keyframes dog-pant {
          0%, 100% { transform: scaleY(.82) translateY(0); }
          50%      { transform: scaleY(1.12) translateY(1.6px); }
        }
        .dog-guide[data-mood="work"] .dog-tongue,
        .dog-guide[data-mood="cheer"] .dog-tongue,
        .dog-guide[data-mood="greet"] .dog-tongue {
          opacity: 1;
          animation: dog-pant .58s ease-in-out infinite;
        }
        /* hind leg keeps a tiny counter-motion to the breath */
        @keyframes dog-hind-idle {
          0%, 100% { transform: rotate(0deg); }
          50%      { transform: rotate(-1.4deg); }
        }
        .dog-hind { transform-origin: 76px 108px; animation: dog-hind-idle 3.1s ease-in-out infinite;
                    animation-delay: -1.1s; }

        /* ---------------------------------------------------------
           The ring on the button.
           --------------------------------------------------------- */
        .dog-halo {
          position: absolute;
          z-index: 3;
          border-radius: 999px;
          pointer-events: none;
          box-shadow: 0 0 0 2px var(--accent, #5AC8FA);
          animation: dog-halo 2.2s cubic-bezier(.32,.72,.3,1) infinite;
        }
        @keyframes dog-halo {
          0%   { opacity: .0;  transform: scale(.96); }
          40%  { opacity: .85; transform: scale(1); }
          100% { opacity: 0;   transform: scale(1.07); }
        }

        /* ---------------------------------------------------------
           Speech bubble.
           --------------------------------------------------------- */
        .dog-bubble {
          position: absolute;
          bottom: ${DOG_H - 16}px;
          left: 6px;
          width: 254px;
          padding: 11px 26px 11px 13px;
          border-radius: 16px;
          background: rgba(255,255,255,.95);
          color: #16202E;
          font-size: 12.5px;
          line-height: 1.45;
          box-shadow: 0 12px 30px -14px rgba(10,18,34,.6), inset 0 0 0 1px rgba(255,255,255,.9);
          animation: dog-pop .42s cubic-bezier(.2,1.12,.3,1) both;
        }
        .dog-bubble p { margin: 0; }
        .dog-bubble-tail {
          position: absolute; bottom: -6px; left: 30px;
          width: 13px; height: 13px;
          background: rgba(255,255,255,.95);
          transform: rotate(45deg);
          border-radius: 0 0 3px 0;
        }
        @keyframes dog-pop {
          from { opacity: 0; transform: translateY(9px) scale(.93); }
          to   { opacity: 1; transform: none; }
        }
        .dog-x {
          position: absolute; top: 5px; right: 6px;
          width: 18px; height: 18px;
          border-radius: 50%;
          font-size: 10px; line-height: 1;
          color: #5A6472;
          pointer-events: auto;
          cursor: pointer;
        }
        .dog-x:hover { background: rgba(10,18,34,.08); color: #16202E; }

        @media (max-width: 900px) {
          /* Below this he cannot stand clear of the button, and a
             mascot overlapping the control it is pointing at is
             worse than no mascot. */
          .dog-guide, .dog-halo { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dog-guide *, .dog-halo { animation: none !important; transition: none !important; }
          .dog-guide { transition: none !important; }
          .dog-fore-a { transform: rotate(var(--pt)); }
        }
      `}</style>
    </>
  )
}
