'use client'

// ============================================================
// components/tools/guide.tsx
//
// A real 3D dog who guides the visitor through the tool.
//
// HOW THIS DIFFERS FROM THE THREE ATTEMPTS BEFORE IT
//
// Those were code pretending to be art: CSS transforms on vector
// shapes, then a sprite sheet with a fixed set of clips. The
// ceiling was in the medium, not the code, and writing more code
// could never raise it.
//
// This one loads a rigged, animated model made by an actual 3D
// artist — Quaternius' CC0 animal pack — and does what integration
// code is genuinely good at: blending between the artist's clips,
// aiming the head bone, and reacting to the page. The animation
// quality now comes from the animator, which is where it should
// have come from in the first place.
//
// THE THREE THINGS THAT MAKE IT FEEL ALIVE
//
//   1. He watches you. The head bone is rotated toward the cursor
//      every frame, AFTER the mixer has written the clip pose —
//      order matters, or the animation overwrites the look.
//      Nothing else in here reads as "aware" the way this does.
//   2. He blends. Clips cross-fade over a fraction of a second
//      rather than cutting, so idle-to-walk-to-sit is continuous.
//   3. He reacts. Click him and he responds. That closed loop is
//      most of what makes a character feel like a character
//      rather than a decoration playing at you.
//
// DEFENSIVE BY DESIGN
//
// Clip and bone names differ between models, so both are resolved
// by pattern against what the file actually contains — asking for
// a name the rig does not have fails silently, which is the worst
// kind of failure. And if the model is missing or WebGL is
// unavailable, this renders nothing at all: the analysis tools are
// the product, and they must never be taken down by the mascot.
// ============================================================

import { useEffect, useRef, useState } from 'react'

export type GuideStep = 'welcome' | 'choose' | 'analyse' | 'working' | 'done'

const DISMISS_KEY = 'ise-guide-dismissed'
const MODEL_URL = '/models/dog.glb'

const STAGE = 300      // canvas edge, px
const STAND_OFF = 34   // clear space between dog and button

const LINES: Record<GuideStep, string> = {
  welcome:
    'Hello! Everything on this page runs inside your own browser — no file is ever uploaded.',
  choose:
    'Start over here — pick your ISE files. A support bundle, any CSV export, or all seven dashboard files at once.',
  analyse:
    'Got them! Now press Analyse and I will put the whole lot onto one dashboard.',
  working:
    'Reading them now. A big bundle takes a moment — it is all being parsed on your own machine.',
  done:
    'All done! Scroll on down. Click any row to filter, or open a panel for the full sortable list.',
}

/** What each step wants the dog to be doing. */
const POSE: Record<GuideStep, 'greet' | 'point' | 'work' | 'cheer'> = {
  welcome: 'greet', choose: 'point', analyse: 'point', working: 'work', done: 'cheer',
}

/**
 * Clip names vary between rigs, so every action is a list of
 * patterns tried in order. Quaternius packs generally ship Idle,
 * Walk, Run, Jump, Attack, Eating and a couple of Idle variants,
 * but nothing guarantees it and a missing clip is invisible.
 */
const CLIPS: Record<string, RegExp[]> = {
  idle:  [/^idle$/i, /idle_?1/i, /idle/i, /rest/i],
  walk:  [/^walk$/i, /walk/i, /trot/i],
  sit:   [/sit/i, /idle_?2/i, /idle/i],
  jump:  [/jump/i, /gallop/i, /run/i],
  alert: [/attack|bark|headbutt/i, /jump/i, /idle_?2/i],
  eat:   [/eat/i, /idle_?3/i, /idle/i],
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

interface Box { x: number; y: number; w: number; h: number }

function useBox(
  stageRef: React.RefObject<HTMLElement | null>,
  targetRef: React.RefObject<HTMLElement | null>,
  active: boolean,
): Box | null {
  const [box, setBox] = useState<Box | null>(null)
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

export default function Guide({ step, stageRef, chooseRef, analyseRef }: {
  step: GuideStep
  stageRef: React.RefObject<HTMLElement | null>
  chooseRef: React.RefObject<HTMLElement | null>
  analyseRef: React.RefObject<HTMLElement | null>
}) {
  const holderRef = useRef<HTMLDivElement | null>(null)
  const apiRef = useRef<{
    setPose: (p: string) => void
    faceTo: (deg: number) => void
    react: () => void
  } | null>(null)

  const [live, setLive] = useState(false)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try { setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1') }
    catch { setDismissed(false) }
  }, [])

  const pose = POSE[step]
  const pointing = pose === 'point'
  const chooseBox = useBox(stageRef, chooseRef, step === 'choose')
  const analyseBox = useBox(stageRef, analyseRef, step === 'analyse')
  const target = step === 'choose' ? chooseBox : step === 'analyse' ? analyseBox : null

  // ---- placement: beside the control, never on it ----
  let flip = false
  let left = 24
  let top = 20
  if (target) {
    const wantLeft = target.x - STAND_OFF - STAGE
    if (wantLeft >= 0) left = wantLeft
    else { left = target.x + target.w + STAND_OFF; flip = true }
    top = target.y + target.h / 2 - STAGE + 96
  }

  // ---------- three.js ----------
  useEffect(() => {
    if (dismissed) return
    const holder = holderRef.current
    if (!holder) return

    let cancelled = false
    let cleanup: (() => void) | null = null

    ;(async () => {
      try {
        const THREE = await import('three')
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
        if (cancelled) return

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(STAGE, STAGE, false)
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        renderer.domElement.style.width = `${STAGE}px`
        renderer.domElement.style.height = `${STAGE}px`
        holder.appendChild(renderer.domElement)

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60)
        camera.position.set(0, 1.55, 6.0)
        camera.lookAt(0, 0.85, 0)

        // Three-point-ish lighting. A single light makes a low-poly
        // model read as flat card; the rim light along the back is
        // what separates him from the sky behind.
        scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5568, 2.1))
        const key = new THREE.DirectionalLight(0xfff2e0, 2.4)
        key.position.set(3.2, 5.4, 3.6)
        key.castShadow = true
        key.shadow.mapSize.set(1024, 1024)
        key.shadow.camera.near = 0.5
        key.shadow.camera.far = 18
        scene.add(key)
        const rim = new THREE.DirectionalLight(0x9fd3ff, 1.5)
        rim.position.set(-3.4, 2.4, -3.2)
        scene.add(rim)

        // Contact shadow only — a ShadowMaterial plane catches the
        // shadow without painting a visible floor, so he sits on the
        // page rather than on a grey disc.
        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(14, 14),
          new THREE.ShadowMaterial({ opacity: 0.22 }),
        )
        floor.rotation.x = -Math.PI / 2
        floor.receiveShadow = true
        scene.add(floor)

        const gltf = await new GLTFLoader().loadAsync(MODEL_URL)
        if (cancelled) { renderer.dispose(); return }

        const dog = gltf.scene
        dog.traverse((o: import('three').Object3D) => {
          const m = o as import('three').Mesh
          if (m.isMesh) { m.castShadow = true; m.receiveShadow = false }
        })

        // Normalise scale and seat him on the floor. Model packs
        // disagree wildly about units and origin, so measuring the
        // bounding box beats trusting a magic number.
        const box = new THREE.Box3().setFromObject(dog)
        const size = new THREE.Vector3()
        box.getSize(size)
        const s = 2.05 / Math.max(size.x, size.y, size.z)
        dog.scale.setScalar(s)
        const box2 = new THREE.Box3().setFromObject(dog)
        dog.position.y -= box2.min.y
        dog.position.x = -0.1
        scene.add(dog)

        // ---- find the head bone, for cursor tracking ----
        let head: import('three').Object3D | null = null
        dog.traverse((o: import('three').Object3D) => {
          if (!head && /head|neck/i.test(o.name)) head = o
        })
        const headRest = head
          ? (head as import('three').Object3D).quaternion.clone()
          : null

        // ---- animation ----
        const mixer = new THREE.AnimationMixer(dog)
        const byName = new Map<string, import('three').AnimationClip>()
        for (const c of gltf.animations) byName.set(c.name, c)

        const resolve = (patterns: RegExp[]) => {
          for (const p of patterns) {
            for (const c of gltf.animations) if (p.test(c.name)) return c
          }
          return gltf.animations[0] ?? null
        }

        const actions: Record<string, import('three').AnimationAction> = {}
        for (const key of Object.keys(CLIPS)) {
          const clip = resolve(CLIPS[key])
          if (clip) actions[key] = mixer.clipAction(clip)
        }

        let current = actions.idle ?? Object.values(actions)[0]
        current?.reset().play()

        // Cross-fade rather than cut. A hard clip switch is the
        // single most obvious tell of amateur 3D on the web.
        const setPose = (name: string) => {
          const next = actions[name] ?? actions.idle
          if (!next || next === current) return
          next.reset()
          next.setEffectiveWeight(1)
          next.play()
          if (current) current.crossFadeTo(next, 0.35, false)
          current = next
        }

        // one-shot reaction, then back to whatever we were doing
        const react = () => {
          const jump = actions.jump ?? actions.alert
          if (!jump) return
          const back = current
          jump.reset()
          jump.setLoop(THREE.LoopOnce, 1)
          jump.clampWhenFinished = true
          jump.play()
          if (current && current !== jump) current.crossFadeTo(jump, 0.14, false)
          current = jump
          const onDone = () => {
            mixer.removeEventListener('finished', onDone)
            if (back && back !== jump) { back.reset().play(); jump.crossFadeTo(back, 0.3, false); current = back }
          }
          mixer.addEventListener('finished', onDone)
        }

        // ---- body yaw, cursor tracking, render loop ----
        let wantYaw = 0
        const faceTo = (deg: number) => { wantYaw = (deg * Math.PI) / 180 }
        const gaze = { x: 0, y: 0 }

        const onMove = (e: MouseEvent) => {
          const r = renderer.domElement.getBoundingClientRect()
          // Normalised offset from the dog's own centre, clamped so
          // he never cranes past what a neck can do.
          gaze.x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 420))
          gaze.y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 420))
        }
        const onClick = (e: MouseEvent) => {
          const r = renderer.domElement.getBoundingClientRect()
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return
          react()
        }
        window.addEventListener('mousemove', onMove, { passive: true })
        window.addEventListener('click', onClick, { passive: true })

        const clock = new THREE.Clock()
        let raf = 0
        const euler = new THREE.Euler()
        const q = new THREE.Quaternion()

        const tick = () => {
          raf = requestAnimationFrame(tick)
          const dt = clock.getDelta()
          mixer.update(dt)

          // ease the whole body toward the requested facing
          dog.rotation.y += (wantYaw - dog.rotation.y) * Math.min(1, dt * 4)

          // The head look is applied AFTER mixer.update, because the
          // mixer writes the clip's pose into the bone every frame.
          // Do it before, and the animation silently erases it —
          // which looks exactly like the tracking not working.
          if (head && headRest) {
            euler.set(gaze.y * 0.45, -gaze.x * 0.7, 0, 'XYZ')
            q.setFromEuler(euler)
            ;(head as import('three').Object3D).quaternion.copy(headRest).multiply(q)
          }

          renderer.render(scene, camera)
        }
        tick()

        apiRef.current = { setPose, faceTo, react }
        setLive(true)

        cleanup = () => {
          cancelAnimationFrame(raf)
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('click', onClick)
          mixer.stopAllAction()
          scene.traverse((o: import('three').Object3D) => {
            const m = o as import('three').Mesh
            if (m.geometry) m.geometry.dispose()
            const mat = m.material as import('three').Material | import('three').Material[] | undefined
            if (Array.isArray(mat)) mat.forEach(x => x.dispose())
            else mat?.dispose()
          })
          renderer.dispose()
          renderer.domElement.remove()
        }
      } catch {
        // No WebGL, no model, no network — the tool is the product.
        if (!cancelled) setLive(false)
      }
    })()

    return () => { cancelled = true; cleanup?.(); apiRef.current = null }
  }, [dismissed])

  // ---- drive pose and facing from page state ----
  useEffect(() => {
    const api = apiRef.current
    if (!api || !live) return

    api.setPose(
      pose === 'point' ? 'sit'
      : pose === 'work' ? 'eat'
      : pose === 'cheer' ? 'jump'
      : 'idle',
    )

    // Turn to face the button. Not a look — a quarter-turn of the
    // whole body, which is what actually reads as "over there".
    api.faceTo(pointing ? (flip ? 34 : -34) : 0)
  }, [pose, pointing, flip, live])

  // walk animation while the holder is gliding to a new position
  useEffect(() => {
    const api = apiRef.current
    if (!api || !live || !target) return
    api.setPose('walk')
    const t = window.setTimeout(() => api.setPose('sit'), 1000)
    return () => window.clearTimeout(t)
  }, [target?.x, target?.y, live])   // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => {
    setDismissed(true)
    try { window.localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode */ }
  }

  if (dismissed) return null

  return (
    <>
      {pointing && target && live && (
        <span className="dog3-halo" aria-hidden="true"
              style={{ left: target.x - 7, top: target.y - 7, width: target.w + 14, height: target.h + 14 }} />
      )}

      <div className="dog3" style={{ left, top, opacity: live ? 1 : 0 }}>
        {live && (
          <div className="dog3-bubble" style={flip ? { left: 'auto', right: 10 } : undefined}>
            <p>{LINES[step]}</p>
            <button type="button" onClick={dismiss} className="dog3-x" aria-label="Hide the guide">✕</button>
            <span className="dog3-tail" style={flip ? { left: 'auto', right: 34 } : undefined} />
          </div>
        )}
        {/* The canvas is click-through; clicks on the dog are picked
            up from a window listener and bounds-checked, so he can
            stand anywhere without ever stealing a click from a
            control underneath him. */}
        <div ref={holderRef} className="dog3-canvas" />
      </div>

      <style>{`
        .dog3 {
          position: absolute;
          z-index: 4;
          width: ${STAGE}px;
          height: ${STAGE}px;
          pointer-events: none;
          transition: left 1.15s cubic-bezier(.36,.7,.28,1),
                      top  1.15s cubic-bezier(.36,.7,.28,1),
                      opacity .5s ease;
        }
        .dog3-canvas { width: ${STAGE}px; height: ${STAGE}px; }
        .dog3-canvas canvas { display: block; }

        .dog3-halo {
          position: absolute;
          z-index: 3;
          border-radius: 999px;
          pointer-events: none;
          box-shadow: 0 0 0 2px var(--accent, #5AC8FA);
          animation: dog3-halo 2.1s cubic-bezier(.32,.72,.3,1) infinite;
        }
        @keyframes dog3-halo {
          0%   { opacity: 0;   transform: scale(.96); }
          40%  { opacity: .9;  transform: scale(1); }
          100% { opacity: 0;   transform: scale(1.08); }
        }

        .dog3-bubble {
          position: absolute;
          bottom: ${STAGE - 46}px;
          left: 10px;
          width: 262px;
          padding: 11px 26px 11px 13px;
          border-radius: 16px;
          background: rgba(255,255,255,.95);
          color: #16202E;
          font-size: 12.5px;
          line-height: 1.45;
          box-shadow: 0 12px 30px -14px rgba(10,18,34,.6), inset 0 0 0 1px rgba(255,255,255,.9);
          animation: dog3-pop .42s cubic-bezier(.2,1.12,.3,1) both;
        }
        .dog3-bubble p { margin: 0; }
        .dog3-tail {
          position: absolute; bottom: -6px; left: 34px;
          width: 13px; height: 13px;
          background: rgba(255,255,255,.95);
          transform: rotate(45deg);
          border-radius: 0 0 3px 0;
        }
        @keyframes dog3-pop {
          from { opacity: 0; transform: translateY(9px) scale(.93); }
          to   { opacity: 1; transform: none; }
        }
        .dog3-x {
          position: absolute; top: 5px; right: 6px;
          width: 18px; height: 18px;
          border-radius: 50%;
          font-size: 10px; line-height: 1;
          color: #5A6472;
          pointer-events: auto;
          cursor: pointer;
        }
        .dog3-x:hover { background: rgba(10,18,34,.08); color: #16202E; }

        @media (max-width: 1000px) {
          .dog3, .dog3-halo { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dog3 { transition: none; }
        }
      `}</style>
    </>
  )
}
