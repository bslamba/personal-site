'use client'

// ============================================================
// components/tools/guide.tsx
//
// A 3D Shiba who guides the visitor through the tool.
//
// WHY THE MODEL LOOKED BLACK
//
// Not the artwork. glTF exports routinely ship metalness = 1, and
// a fully metallic surface renders as a mirror — with no
// environment in the scene there is nothing to mirror, so it
// reflects black. Two fixes, both applied below: force metalness
// down, and give the scene a real environment map to light it.
// That is also what puts colour back into the shadows, because an
// environment lights from every direction rather than one.
//
// EXPRESSION ON A MODEL WITH NO FACE
//
// Low-poly animal rigs have no blend shapes, so there is nothing
// to morph into a smile. Everything expressive here is therefore
// procedural and layered on top of the artist's clips:
//
//   · cartoon eyes parented to the head bone, which blink on an
//     irregular cycle and whose pupils track whatever he is
//     looking at. Eyes are where an audience looks first, and
//     giving him some is the single biggest win available.
//   · the head bone aimed at the button — not at a guess, at the
//     measured direction from him to the control.
//   · a front paw raised toward the target when one can be found
//     in the rig, and a rear-up of the whole body when it cannot.
//   · idle mischief: he hops, spins, wags and bounces on his own
//     schedule, so he is never merely waiting.
//
// All of it is applied AFTER mixer.update(), because the mixer
// writes the clip's pose into every bone each frame. Apply before
// and the animation silently erases your work — which looks
// exactly like the code not running.
// ============================================================

import { useEffect, useRef, useState } from 'react'

export type GuideStep = 'welcome' | 'choose' | 'analyse' | 'working' | 'done'

const DISMISS_KEY = 'ise-guide-dismissed-v3'
const MODEL_URL = '/models/dog.glb'
const STAGE = 320
// Small, because he also shifts toward the button inside his own
// canvas — the two together put him beside the control rather than
// loitering in the next postcode.
const STAND_OFF = 8

/** A warm Shiba palette. Dark values become brown, never black. */
const COAT = {
  deep:  0x6B4A33,
  mid:   0xE0954B,
  warm:  0xF0B267,
  cream: 0xFBEEDA,
}

const LINES: Record<GuideStep, string> = {
  welcome: 'Hello! Everything here runs inside your own browser — no file is ever uploaded.',
  choose:  'Over here! Pick your ISE files — a support bundle, any CSV export, or all seven dashboard files at once.',
  analyse: 'Got them! Now hit Analyse and I will put the whole lot onto one dashboard.',
  working: 'Reading them now. A big bundle takes a moment — it is all being parsed on your own machine.',
  done:    'All done! Scroll on down. Click any row to filter, or open a panel for the full sortable list.',
}

const POSE: Record<GuideStep, 'greet' | 'point' | 'work' | 'cheer'> = {
  welcome: 'greet', choose: 'point', analyse: 'point', working: 'work', done: 'cheer',
}

const CLIPS: Record<string, RegExp[]> = {
  idle:  [/^idle$/i, /idle_?1/i, /idle/i, /survey|sniff|look/i, /rest/i],
  walk:  [/^walk$/i, /walk/i, /trot/i],
  sit:   [/sit/i, /idle_?2/i, /survey/i, /idle/i],
  jump:  [/jump/i, /gallop/i, /^run$/i, /run/i],
  alert: [/attack|bark|headbutt|bite/i, /jump/i, /^run$/i, /idle_?2/i],
  eat:   [/eat/i, /idle_?3/i, /sniff|survey/i, /idle/i],
}

export function useGuideStep({ hasFiles, busy, ready }: {
  hasFiles: boolean; busy: boolean; ready: boolean
}): GuideStep {
  const [greeted, setGreeted] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setGreeted(true), 4600)
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

interface DogApi {
  setPose: (p: string) => void
  lookAt: (nx: number, ny: number) => void
  /** Face a direction in screen terms: +x right, +z toward viewer. */
  faceDir: (x: number, z: number) => void
  side: (s: number) => void
  point: (on: boolean) => void
  hop: () => void
  spin: () => void
}

export default function Guide({ step, stageRef, chooseRef, analyseRef }: {
  step: GuideStep
  stageRef: React.RefObject<HTMLElement | null>
  chooseRef: React.RefObject<HTMLElement | null>
  analyseRef: React.RefObject<HTMLElement | null>
}) {
  const holderRef = useRef<HTMLDivElement | null>(null)
  const apiRef = useRef<DogApi | null>(null)
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

  // ---- stand beside the control, never on it ----
  let flip = false
  let left = 24
  let top = 20
  if (target) {
    const wantLeft = target.x - STAND_OFF - STAGE
    if (wantLeft >= 0) left = wantLeft
    else { left = target.x + target.w + STAND_OFF; flip = true }
    top = target.y + target.h / 2 - STAGE + 108
  }

  // Direction from the dog's own centre to the button, in canvas
  // units. This is what the head and eyes actually aim along.
  let aimX = 0
  let aimY = 0
  if (target) {
    const cx = left + STAGE / 2
    const cy = top + STAGE * 0.62
    const dx = (target.x + target.w / 2) - cx
    const dy = (target.y + target.h / 2) - cy
    const len = Math.hypot(dx, dy) || 1
    aimX = dx / len
    aimY = dy / len
  }

  // ---------------- three.js ----------------
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
        const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js')
        if (cancelled) return

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(STAGE, STAGE, false)
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        // Filmic tone mapping keeps the warm coat from clipping to
        // flat orange under the key light.
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.15
        renderer.domElement.style.cssText = `width:${STAGE}px;height:${STAGE}px;display:block`
        holder.appendChild(renderer.domElement)

        const scene = new THREE.Scene()

        // THE fix for dark glTF. An environment lights the model
        // from every direction; without one, any material with
        // metalness above zero has nothing to reflect and goes
        // black. Costs nothing — it is generated, not downloaded.
        const pmrem = new THREE.PMREMGenerator(renderer)
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

        const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60)
        camera.position.set(0.15, 1.7, 6.2)
        camera.lookAt(0, 0.9, 0)

        scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.4))
        const key = new THREE.DirectionalLight(0xfff0dc, 2.2)
        key.position.set(3.4, 5.6, 3.8)
        key.castShadow = true
        key.shadow.mapSize.set(1024, 1024)
        key.shadow.camera.near = 0.5
        key.shadow.camera.far = 20
        key.shadow.bias = -0.0012
        scene.add(key)
        const fill = new THREE.DirectionalLight(0xbfe0ff, 0.9)
        fill.position.set(-3.6, 2.2, -2.8)
        scene.add(fill)

        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(16, 16),
          new THREE.ShadowMaterial({ opacity: 0.2 }),
        )
        floor.rotation.x = -Math.PI / 2
        floor.receiveShadow = true
        scene.add(floor)

        const gltf = await new GLTFLoader().loadAsync(MODEL_URL)
        if (cancelled) { renderer.dispose(); return }
        const dog = gltf.scene

        // ---- repair the materials ----
        const c = new THREE.Color()
        dog.traverse((o: import('three').Object3D) => {
          const m = o as import('three').Mesh
          if (!m.isMesh) return
          m.castShadow = true
          const mats = Array.isArray(m.material) ? m.material : [m.material]
          for (const raw of mats) {
            const mat = raw as import('three').MeshStandardMaterial
            if (!mat) continue
            // Non-negotiable: fur is not metal. This single line is
            // most of why he was black.
            if ('metalness' in mat) mat.metalness = 0
            if ('roughness' in mat) mat.roughness = 0.78
            if ('envMapIntensity' in mat) mat.envMapIntensity = 0.85

            // Remap by luminance rather than by material name, which
            // is unreliable across exporters. Anything near-black
            // becomes warm brown; flat greys become cream; the rest
            // is nudged toward the coat colour.
            if (mat.color && !mat.map) {
              c.copy(mat.color)
              const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
              const sat = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)
              if (lum < 0.20) mat.color.setHex(COAT.deep)
              else if (sat < 0.06 && lum > 0.55) mat.color.setHex(COAT.cream)
              else if (sat < 0.06) mat.color.setHex(COAT.mid)
              else mat.color.lerp(new THREE.Color(COAT.warm), 0.35)
            }
          }
        })

        // ---- normalise size and seat him on the floor ----
        const b1 = new THREE.Box3().setFromObject(dog)
        const size = new THREE.Vector3(); b1.getSize(size)
        dog.scale.setScalar(2.15 / Math.max(size.x, size.y, size.z))
        const b2 = new THREE.Box3().setFromObject(dog)
        dog.position.y -= b2.min.y
        scene.add(dog)

        // ---- rig discovery ----
        let head: import('three').Object3D | null = null
        let paw: import('three').Object3D | null = null
        dog.traverse((o: import('three').Object3D) => {
          const n = o.name || ''
          if (!head && /head|skull|neck/i.test(n)) head = o
          if (!paw && /(front|fore).*(leg|arm|paw|foot)|(leg|arm|paw)_?(l|left|f)\b/i.test(n)) paw = o
        })
        const headRest = head ? (head as import('three').Object3D).quaternion.clone() : null
        const pawRest = paw ? (paw as import('three').Object3D).quaternion.clone() : null

        // ---- which way does this model face? ----
        //
        // Every previous version of this guessed, and the last one
        // guessed wrong — he pointed his tail at the button. It is
        // not a guess: a quadruped's head sits at the front, so the
        // vector from the body's centre to the head bone IS the
        // forward axis, sign included. Measure it once at load and
        // every later rotation is arithmetic.
        //
        // Falls back to +Z if there is no head bone, which is the
        // glTF convention.
        let baseYaw = 0
        {
          const centre = new THREE.Vector3()
          new THREE.Box3().setFromObject(dog).getCenter(centre)
          if (head) {
            const hp = (head as import('three').Object3D).getWorldPosition(new THREE.Vector3())
            const fwd = hp.sub(centre)
            fwd.y = 0
            if (fwd.lengthSq() > 1e-6) baseYaw = Math.atan2(fwd.x, fwd.z)
          }
        }
        // Turn him to face `dir` on screen. dir is in view terms:
        // +x is right, +z is out of the screen toward the reader.
        const yawFor = (dx: number, dz: number) => Math.atan2(dx, dz) - baseYaw

        // No procedural eyes. The model ships with its own, and
        // welding spheres onto a rig whose head geometry I cannot
        // see was never going to land — the offsets were a guess
        // dressed up as a calculation. Expression comes from head
        // aim, posture and timing instead.

        // ---- clips ----
        const mixer = new THREE.AnimationMixer(dog)
        const resolve = (ps: RegExp[]) => {
          for (const p of ps) for (const cl of gltf.animations) if (p.test(cl.name)) return cl
          return gltf.animations[0] ?? null
        }
        const actions: Record<string, import('three').AnimationAction> = {}
        for (const k of Object.keys(CLIPS)) {
          const clip = resolve(CLIPS[k])
          if (clip) actions[k] = mixer.clipAction(clip)
        }
        let current = actions.idle ?? Object.values(actions)[0]
        current?.reset().play()

        const setPose = (name: string) => {
          const next = actions[name] ?? actions.idle
          if (!next || next === current) return
          next.reset().setEffectiveWeight(1).play()
          if (current) current.crossFadeTo(next, 0.32, false)
          current = next
        }

        // ---- state driven from React ----
        const aim = { x: 0, y: 0 }        // where he is looking, -1..1
        const gaze = { x: 0, y: 0 }        // smoothed
        let wantYaw = 0
        let pointing = false
        let hopT = -1                      // >=0 while a hop is in flight
        let spinFrom = 0, spinTo = 0, spinT = -1
        let mischiefAt = 5 + Math.random() * 4

        // Where he stands inside his own canvas. Shifting him toward
        // the button closes the dead space that made him look like
        // he was loitering three hundred pixels away from it.
        let wantX = 0

        const api: DogApi = {
          setPose,
          lookAt: (nx, ny) => { aim.x = nx; aim.y = ny },
          faceDir: (dx, dz) => { wantYaw = yawFor(dx, dz) },
          side: s => { wantX = s * 0.85 },
          point: on => { pointing = on },
          hop: () => { if (hopT < 0) hopT = 0 },
          spin: () => { if (spinT < 0) { spinFrom = dog.rotation.y; spinTo = spinFrom + Math.PI * 2; spinT = 0 } },
        }
        api.faceDir(0, 1)

        // clicking him is the whole point of a pet
        const onClick = (e: MouseEvent) => {
          const r = renderer.domElement.getBoundingClientRect()
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return
          api.hop()
          setPose('alert')
          window.setTimeout(() => setPose(pointing ? 'sit' : 'idle'), 900)
        }
        const onMove = (e: MouseEvent) => {
          if (pointing) return   // when pointing, the button wins
          const r = renderer.domElement.getBoundingClientRect()
          aim.x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 380))
          aim.y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 380))
        }
        window.addEventListener('click', onClick, { passive: true })
        window.addEventListener('mousemove', onMove, { passive: true })

        const clock = new THREE.Clock()
        let raf = 0
        const euler = new THREE.Euler()
        const q = new THREE.Quaternion()
        const baseY = dog.position.y

        const tick = () => {
          raf = requestAnimationFrame(tick)
          const dt = Math.min(clock.getDelta(), 0.05)
          const t = clock.elapsedTime
          mixer.update(dt)

          // ---- idle mischief ----
          // He does things unprompted. A character that only moves
          // when told is furniture.
          mischiefAt -= dt
          if (mischiefAt <= 0) {
            // More often while pointing: he is trying to get you to
            // click something, and a guide that goes quiet at the
            // moment it wants your attention has the timing exactly
            // backwards.
            mischiefAt = pointing ? 2.6 + Math.random() * 2 : 5 + Math.random() * 5
            const r = Math.random()
            if (pointing) {
              api.hop()
              if (r < 0.3) { setPose('alert'); window.setTimeout(() => setPose('sit'), 700) }
            } else if (r < 0.4) api.spin()
            else api.hop()
          }

          // ---- hop, with squash on the way out and in ----
          if (hopT >= 0) {
            hopT += dt / 0.62
            if (hopT >= 1) { hopT = -1; dog.position.y = baseY; dog.scale.y = dog.scale.x }
            else {
              const p = hopT
              dog.position.y = baseY + Math.sin(p * Math.PI) * 0.62
              const squash = p < 0.16 ? 1 - (p / 0.16) * 0.1
                : p > 0.84 ? 1 - ((1 - p) / 0.16) * 0.1
                : 1 + Math.sin(p * Math.PI) * 0.05
              dog.scale.y = dog.scale.x * squash
            }
          }

          // ---- spin ----
          if (spinT >= 0) {
            spinT += dt / 0.9
            if (spinT >= 1) { spinT = -1; dog.rotation.y = spinTo % (Math.PI * 2); wantYaw = dog.rotation.y }
            else {
              const e = 1 - Math.pow(1 - spinT, 3)
              dog.rotation.y = spinFrom + (spinTo - spinFrom) * e
            }
          } else {
            // ease toward the requested facing
            let d = wantYaw - dog.rotation.y
            while (d > Math.PI) d -= Math.PI * 2
            while (d < -Math.PI) d += Math.PI * 2
            dog.rotation.y += d * Math.min(1, dt * 4)
          }

          // slide toward his standing spot inside the canvas
          dog.position.x += (wantX - dog.position.x) * Math.min(1, dt * 3)

          // gentle breathing on top of the clip
          dog.scale.x = dog.scale.z
          if (hopT < 0) dog.scale.y = dog.scale.x * (1 + Math.sin(t * 1.9) * 0.012)

          // ---- head. AFTER the mixer, always. ----
          //
          // Deliberately gentle now. The body does the facing,
          // because body yaw is computed from a measured axis and
          // is therefore correct; the head bone's own local axes
          // are not knowable from here, so a large rotation on it
          // is a coin flip. A small one reads as a glance either
          // way, which is the safe failure.
          gaze.x += (aim.x - gaze.x) * Math.min(1, dt * 6)
          gaze.y += (aim.y - gaze.y) * Math.min(1, dt * 6)
          if (head && headRest) {
            const tilt = pointing ? Math.sin(t * 1.25) * 0.13 : Math.sin(t * 0.6) * 0.05
            euler.set(gaze.y * 0.22, gaze.x * 0.2, tilt, 'XYZ')
            q.setFromEuler(euler)
            ;(head as import('three').Object3D).quaternion.copy(headRest).multiply(q)
          }

          // ---- the point ----
          if (pointing) {
            if (paw && pawRest) {
              // raise the found foreleg, with a small pulse along
              // the line so the gesture repeats rather than freezes
              const lift = -0.95 - Math.sin(t * 2.4) * 0.16
              euler.set(lift, 0, 0, 'XYZ')
              q.setFromEuler(euler)
              ;(paw as import('three').Object3D).quaternion.copy(pawRest).multiply(q)
            } else {
              // No named foreleg in this rig — rear the whole body
              // instead. Less precise, still unmistakably "there".
              dog.rotation.x = -0.13 - Math.sin(t * 2.4) * 0.03
            }
          } else {
            dog.rotation.x += (0 - dog.rotation.x) * Math.min(1, dt * 5)
          }

          renderer.render(scene, camera)
        }
        tick()

        apiRef.current = api
        setLive(true)

        cleanup = () => {
          cancelAnimationFrame(raf)
          window.removeEventListener('click', onClick)
          window.removeEventListener('mousemove', onMove)
          mixer.stopAllAction()
          pmrem.dispose()
          scene.traverse((o: import('three').Object3D) => {
            const m = o as import('three').Mesh
            m.geometry?.dispose()
            const mat = m.material as import('three').Material | import('three').Material[] | undefined
            if (Array.isArray(mat)) mat.forEach(x => x.dispose())
            else mat?.dispose()
          })
          renderer.dispose()
          renderer.domElement.remove()
        }
      } catch (err) {
        console.warn(
          `[guide] 3D dog did not start. Most likely ${MODEL_URL} is missing from /public, ` +
          `or WebGL is unavailable. Underlying error:`, err,
        )
        if (!cancelled) setLive(false)
      }
    })()

    return () => { cancelled = true; cleanup?.(); apiRef.current = null }
  }, [dismissed])

  // ---- pose from page state ----
  useEffect(() => {
    const api = apiRef.current
    if (!api || !live) return
    api.point(pointing)
    api.setPose(pose === 'point' ? 'sit' : pose === 'work' ? 'eat' : pose === 'cheer' ? 'jump' : 'idle')
    if (pose === 'cheer' || pose === 'greet') api.hop()
  }, [pose, pointing, live])

  // ---- face the button, and stand on the side nearest it ----
  useEffect(() => {
    const api = apiRef.current
    if (!api || !live) return
    if (pointing) {
      // 0.5 on z keeps a three-quarter view, so he is angled at the
      // button but the reader still sees his face rather than his
      // flank. Pure profile reads as ignoring you.
      api.faceDir(aimX, 0.5)
      api.lookAt(aimX, aimY)
      api.side(flip ? -1 : 1)
    } else {
      api.faceDir(0, 1)     // square to the reader
      api.lookAt(0, 0)
      api.side(0)
    }
  }, [pointing, aimX, aimY, flip, live])

  // ---- walk to the next spot, facing the way he is going ----
  useEffect(() => {
    const api = apiRef.current
    if (!api || !live || !target) return
    api.setPose('walk')
    api.faceDir(flip ? -1 : 1, 0.25)          // look where you're going
    const t = window.setTimeout(() => {
      api.setPose('sit')
      api.faceDir(aimX, 0.5)                   // then turn to the button
    }, 1150)
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
              style={{ left: target.x - 8, top: target.y - 8, width: target.w + 16, height: target.h + 16 }} />
      )}

      <div className="dog3" style={{ left, top, opacity: live ? 1 : 0 }}>
        {live && (
          <div className="dog3-bubble" style={flip ? { left: 'auto', right: 4 } : undefined}>
            <p>{LINES[step]}</p>
            <button type="button" onClick={dismiss} className="dog3-x" aria-label="Hide the guide">✕</button>
            <span className="dog3-tail" style={flip ? { left: 'auto', right: 40 } : undefined} />
          </div>
        )}
        <div ref={holderRef} className="dog3-canvas" />
      </div>

      <style>{`
        .dog3 {
          position: absolute;
          z-index: 4;
          width: ${STAGE}px; height: ${STAGE}px;
          pointer-events: none;
          transition: left 1.1s cubic-bezier(.34,.72,.28,1),
                      top  1.1s cubic-bezier(.34,.72,.28,1),
                      opacity .5s ease;
        }
        .dog3-canvas { width: ${STAGE}px; height: ${STAGE}px; }

        .dog3-halo {
          position: absolute; z-index: 3;
          border-radius: 999px; pointer-events: none;
          box-shadow: 0 0 0 2px var(--accent, #5AC8FA);
          animation: dog3-halo 1.9s cubic-bezier(.32,.72,.3,1) infinite;
        }
        @keyframes dog3-halo {
          0%   { opacity: 0;  transform: scale(.95); }
          38%  { opacity: .95; transform: scale(1); }
          100% { opacity: 0;  transform: scale(1.1); }
        }

        /* Sits above his head and well clear of the canvas, so it
           never lands on the text he is standing next to. */
        .dog3-bubble {
          position: absolute;
          bottom: ${STAGE - 30}px;
          left: 4px;
          width: 244px;
          padding: 10px 26px 10px 13px;
          border-radius: 16px;
          background: rgba(255,255,255,.96);
          color: #16202E;
          font-size: 12.5px; line-height: 1.45;
          box-shadow: 0 12px 30px -14px rgba(10,18,34,.55), inset 0 0 0 1px rgba(255,255,255,.9);
          animation: dog3-pop .4s cubic-bezier(.2,1.12,.3,1) both;
        }
        .dog3-bubble p { margin: 0; }
        .dog3-tail {
          position: absolute; bottom: -6px; left: 40px;
          width: 13px; height: 13px;
          background: rgba(255,255,255,.96);
          transform: rotate(45deg); border-radius: 0 0 3px 0;
        }
        @keyframes dog3-pop {
          from { opacity: 0; transform: translateY(9px) scale(.93); }
          to   { opacity: 1; transform: none; }
        }
        .dog3-x {
          position: absolute; top: 5px; right: 6px;
          width: 18px; height: 18px; border-radius: 50%;
          font-size: 10px; line-height: 1; color: #5A6472;
          pointer-events: auto; cursor: pointer;
        }
        .dog3-x:hover { background: rgba(10,18,34,.08); color: #16202E; }

        @media (max-width: 1000px) { .dog3, .dog3-halo { display: none; } }
        @media (prefers-reduced-motion: reduce) { .dog3 { transition: none; } }
      `}</style>
    </>
  )
}
