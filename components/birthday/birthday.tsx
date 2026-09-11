'use client'

// ============================================================
// components/birthday/birthday.tsx
//
// A birthday page for Nishu — 25 September 2026.
//
// Built mobile first, because that is where it will be opened.
// Every measure is in svh/dvh rather than vh so the iOS address
// bar cannot cut the cover in half, every tap target is a real
// button, and nothing at all depends on hover.
//
// The motion is deliberately cheap: transform and opacity only,
// so it stays smooth on a phone, and all of it stops dead under
// prefers-reduced-motion.
// ============================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { PHOTOS, HERO_PHOTOS, HAS_PHOTOS, type Photo } from './photos'
import { SongControl, SongHolder, useBirthdaySong } from './music'

const HER = 'Nishu'
const HER_FULL = 'Parteek Kaur'
const BORN = 1996
const BIRTHDAY_ISO = '2026-09-25T00:00:00+05:30'
const TURNS = 2026 - BORN

// ------------------------------------------------------------
// Floating hearts
//
// The values are hard-coded rather than random so that the server
// and the browser render the identical thing — a Math.random() in
// here is a hydration mismatch waiting to happen. Thirty-two of
// them is enough to read as "everywhere" without becoming a fog.
// ------------------------------------------------------------
const HEARTS = [
  [4, 0.0, 15.5, 0.75, 0.55], [11, 3.2, 19.0, 1.15, 0.4],
  [18, 7.4, 13.5, 0.6, 0.6], [24, 1.1, 21.0, 0.95, 0.35],
  [31, 9.8, 16.5, 1.3, 0.5], [37, 5.3, 18.0, 0.7, 0.45],
  [43, 12.6, 14.5, 1.05, 0.55], [49, 2.4, 20.5, 0.85, 0.3],
  [55, 8.1, 17.0, 1.2, 0.5], [61, 14.2, 15.0, 0.65, 0.6],
  [67, 4.7, 19.5, 1.0, 0.4], [73, 10.9, 13.0, 0.8, 0.55],
  [79, 6.2, 22.0, 1.25, 0.35], [85, 0.9, 16.0, 0.7, 0.5],
  [91, 11.5, 18.5, 1.1, 0.45], [96, 3.8, 14.0, 0.9, 0.6],
  [8, 16.3, 20.0, 0.85, 0.35], [21, 13.1, 17.5, 1.15, 0.5],
  [34, 18.7, 15.5, 0.7, 0.45], [46, 15.4, 21.5, 1.0, 0.4],
  [58, 17.9, 13.5, 0.95, 0.55], [70, 19.6, 18.0, 1.2, 0.35],
  [82, 16.8, 16.5, 0.75, 0.5], [94, 20.3, 19.0, 1.05, 0.45],
  [14, 22.5, 14.5, 0.9, 0.4], [28, 24.1, 20.5, 1.1, 0.5],
  [40, 21.7, 17.0, 0.65, 0.55], [52, 25.8, 15.0, 1.3, 0.35],
  [64, 23.2, 19.5, 0.8, 0.5], [76, 26.4, 16.0, 1.0, 0.45],
  [88, 22.9, 21.0, 0.7, 0.4], [99, 27.6, 14.0, 1.15, 0.55],
] as const

function Hearts() {
  return (
    <div className="bday-hearts" aria-hidden="true">
      {HEARTS.map(([left, delay, duration, scale, opacity], i) => (
        <span
          key={i}
          className="bday-heart"
          style={{
            left: `${left}%`,
            animationDelay: `${delay}s`,
            animationDuration: `${duration}s`,
            // Two custom properties the keyframes read, so each
            // heart drifts its own way rather than marching.
            ['--s' as string]: scale,
            ['--o' as string]: opacity,
            ['--drift' as string]: `${(i % 5) * 14 - 28}px`,
          }}
        >
          ♥
        </span>
      ))}
    </div>
  )
}

// ------------------------------------------------------------
// A photo that quietly removes itself if the file is not there.
// The page is being built before the pictures land, and a grid of
// broken-image icons would be worse than a slightly shorter rail.
// ------------------------------------------------------------
function SafeImage({
  photo,
  className,
  sizes,
  priority,
  small,
}: {
  photo: Photo
  className?: string
  sizes?: string
  priority?: boolean
  /** Load the small copy — enough for a card, a fraction of the weight. */
  small?: boolean
}) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/media/birthday/${small ? photo.thumb : photo.src}`}
      alt={photo.caption}
      className={className}
      sizes={sizes}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      style={{ objectPosition: photo.focus }}
      onError={() => setFailed(true)}
      draggable={false}
    />
  )
}

// ------------------------------------------------------------
// Countdown
// ------------------------------------------------------------
// The clock is an external system, so it is subscribed to rather
// than copied into state by an effect. getSnapshot returns whole
// seconds: it is called on every render and has to return the same
// value until something has actually changed, or React re-renders
// in a loop chasing the millisecond.
function subscribeToSeconds(onTick: () => void) {
  const id = setInterval(onTick, 1000)
  return () => clearInterval(id)
}
const getSecond = () => Math.floor(Date.now() / 1000)
const getServerSecond = () => 0

function useCountdown(targetIso: string) {
  const target = useMemo(() => new Date(targetIso).getTime(), [targetIso])
  const second = useSyncExternalStore(
    subscribeToSeconds,
    getSecond,
    getServerSecond
  )

  // 0 only ever comes from the server snapshot, so this is "not
  // hydrated yet" — render the reserved space, not a wrong number.
  if (second === 0) return null

  const diff = target - second * 1000
  if (diff <= 0) return { arrived: true as const }

  return {
    arrived: false as const,
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff / 3600000) % 24),
    minutes: Math.floor((diff / 60000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

function Countdown() {
  const c = useCountdown(BIRTHDAY_ISO)

  if (!c) return <div className="bday-count" aria-hidden="true" />

  if (c.arrived) {
    return (
      <p className="bday-count bday-count-now">
        It&rsquo;s today. Happy birthday, my love.
      </p>
    )
  }

  const parts: [number, string][] = [
    [c.days, c.days === 1 ? 'day' : 'days'],
    [c.hours, 'hrs'],
    [c.minutes, 'min'],
    [c.seconds, 'sec'],
  ]

  return (
    <div className="bday-count">
      <span className="bday-count-label">until your day</span>
      <span className="bday-count-nums">
        {parts.map(([value, label]) => (
          <span key={label} className="bday-count-cell">
            <b>{String(value).padStart(2, '0')}</b>
            <i>{label}</i>
          </span>
        ))}
      </span>
    </div>
  )
}

// ------------------------------------------------------------
// A drifting rail of photographs
//
// The motion used to be a CSS marquee paused on :hover. On a
// touchscreen that is a trap: a tap counts as hover, the rail
// stops, and it stays stopped until you tap somewhere else. So the
// position is driven here instead, which also makes the rail
// draggable.
//
// What a finger does:
//   a tap            nothing — it keeps moving, and the tap opens
//                    the picture as before
//   press and hold   it stops, and stays stopped while held
//   hold and drag    it follows the finger, left or right
//   let go           it picks up again on its own
//
// Nothing latches. The rail only ever stops while a finger or a
// mouse button is actually down on it.
// ------------------------------------------------------------

/** How long a press has to last before it counts as a hold, in ms. */
const HOLD_MS = 180
/** How far a finger has to travel before it counts as a drag, in px. */
const DRAG_SLOP = 8
/** Drift speed in px per second. */
const RAIL_SPEED = 32

function Rail({
  photos,
  index,
  onPick,
}: {
  photos: Photo[]
  index: number
  onPick: (photo: Photo) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)

  // All of this is per-frame scratch, so it lives in a ref: putting
  // it in state would re-render the rail sixty times a second.
  const drag = useRef({
    offset: 0,
    down: false,
    held: false,
    dragging: false,
    lastX: 0,
    travelled: 0,
    holdTimer: 0 as ReturnType<typeof setTimeout> | 0,
  })

  // Odd rails run against their neighbours.
  const direction = index % 2 === 0 ? -1 : 1
  // A few per cent apart, so the three do not march in step.
  const speed = RAIL_SPEED * (1 + index * 0.07)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduced.matches) return

    let frame = 0
    let last = performance.now()

    const tick = (now: number) => {
      const d = drag.current
      // Clamp the delta: a backgrounded tab returns with a huge one,
      // which would otherwise teleport the rail.
      const dt = Math.min(64, now - last)
      last = now

      if (!d.down) d.offset += direction * speed * (dt / 1000)

      // The list is rendered twice end to end, so wrapping at half
      // the track width lands on an identical frame — no seam.
      const half = track.scrollWidth / 2
      if (half > 0) d.offset = ((d.offset % half) + half) % half

      track.style.transform = `translate3d(${-d.offset}px, 0, 0)`
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [direction, speed])

  const clearHold = () => {
    if (drag.current.holdTimer) clearTimeout(drag.current.holdTimer)
    drag.current.holdTimer = 0
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore anything but the primary button, so a right-click or a
    // second finger does not take the rail over.
    if (e.button !== 0) return
    const d = drag.current
    d.down = true
    d.held = false
    d.dragging = false
    d.lastX = e.clientX
    d.travelled = 0
    clearHold()
    d.holdTimer = setTimeout(() => {
      d.held = true
    }, HOLD_MS)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d.down) return
    const dx = e.clientX - d.lastX
    d.lastX = e.clientX
    d.travelled += Math.abs(dx)

    if (!d.dragging && d.travelled > DRAG_SLOP) {
      d.dragging = true
      clearHold()
      // Take the pointer so the drag survives leaving the rail.
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (d.dragging) d.offset -= dx
  }

  const release = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    clearHold()
    if (d.dragging && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    d.down = false
    d.held = false
    // Leave `dragging` set until the click has come and gone, so a
    // drag that finishes over a picture does not also open it.
    setTimeout(() => {
      d.dragging = false
    }, 0)
  }

  return (
    <div
      className="bday-rail"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      // Vertical swipes still scroll the page; horizontal ones are
      // ours, which is what stops a drag fighting the page scroll.
      style={{ touchAction: 'pan-y' }}
    >
      <div className="bday-rail-track" ref={trackRef}>
        {[...photos, ...photos].map((photo, i) => (
          <button
            key={`${index}-${i}`}
            type="button"
            className={`bday-card ${photo.portrait ? 'is-tall' : ''}`}
            onClick={() => {
              // A drag that ends on a card is not a tap on it.
              if (drag.current.dragging) return
              onPick(photo)
            }}
            style={{
              ['--tilt' as string]: `${(((i + index) % 5) - 2) * 1.6}deg`,
            }}
            aria-label={photo.caption}
          >
            <SafeImage photo={photo} className="bday-card-img" small />
          </button>
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// The page
// ------------------------------------------------------------
export default function BirthdayPage() {
  const [opened, setOpened] = useState(false)
  const [lightbox, setLightbox] = useState<Photo | null>(null)
  const { holderRef, start, toggle, state } = useBirthdaySong()
  const mainRef = useRef<HTMLElement>(null)

  // The one gesture that does everything: it satisfies the
  // browser's autoplay rule and opens the page in the same tap.
  // The track is already rolling silently by now, so the sound
  // arrives immediately rather than after a load.
  const open = useCallback(() => {
    setOpened(true)
    start()
  }, [start])

  // Keep the page from scrolling behind the cover or the lightbox.
  useEffect(() => {
    const locked = !opened || lightbox !== null
    document.body.style.overflow = locked ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [opened, lightbox])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  // Three rails, alternating direction: the first and third carry
  // pictures left to right, the middle one runs against them. The
  // set is dealt across the three so no photograph is on screen
  // twice, and each rail's list is rendered twice end to end so the
  // loop has no seam.
  const rails = useMemo(() => {
    const out: Photo[][] = [[], [], []]
    // Dealt round-robin rather than sliced into thirds, so each rail
    // gets a mix of the good photographs and the call frames instead
    // of one rail taking all of one kind.
    PHOTOS.forEach((photo, i) => out[i % 3].push(photo))
    return out.filter(r => r.length > 0)
  }, [])


  return (
    <div className="bday-root">
      <Hearts />

      {/* ================= THE COVER ================= */}
      {!opened && (
        <div className="bday-cover">
          <div className="bday-cover-glow" aria-hidden="true" />
          <div className="bday-cover-inner">
            <p className="bday-cover-kicker">25 · 09 · 2026</p>
            <h1 className="bday-cover-title">
              For the love
              <br />
              of my life
            </h1>
            <p className="bday-cover-sub">
              There&rsquo;s something here for you, {HER}.
            </p>

            <button
              type="button"
              onClick={open}
              className="bday-open"
              autoFocus
            >
              <span className="bday-open-heart" aria-hidden="true">
                ♥
              </span>
              Tap to open your surprise
            </button>

            <p className="bday-cover-note">
              Turn the sound on — there&rsquo;s a song.
            </p>
          </div>
        </div>
      )}

      {/* ================= THE PAGE ================= */}
      <main
        ref={mainRef}
        className={`bday-main ${opened ? 'is-open' : ''}`}
        aria-hidden={!opened}
      >
        {/* ---- hero ---- */}
        <section className="bday-hero">
          <div className="bday-hero-stage" aria-hidden="true">
            {HERO_PHOTOS.map((photo, i) => (
              <div
                key={photo.src}
                className="bday-hero-slide"
                style={{
                  animationDelay: `${i * 6}s`,
                  animationDuration: `${HERO_PHOTOS.length * 6}s`,
                }}
              >
                <SafeImage photo={photo} className="bday-hero-img" priority={i === 0} />
              </div>
            ))}
            <div className="bday-hero-veil" />
          </div>

          <div className="bday-hero-copy">
            <p className="bday-eyebrow">Happy Birthday</p>
            <h1 className="bday-name">{HER}</h1>
            <p className="bday-fullname">{HER_FULL}</p>

            <p className="bday-age">
              <span>{TURNS}</span> years of you.
              <br />
              And the best of them have been the ones with me in them.
            </p>

            <Countdown />
          </div>

          <div className="bday-scroll-cue" aria-hidden="true">
            <span>keep going</span>
            <i>↓</i>
          </div>
        </section>

        {/* ---- the drifting photographs ---- */}
        {/* Nothing to drift until the pictures are added, and an
            empty rail with a heading over it looks like a fault
            rather than a page waiting for its photographs. */}
        {HAS_PHOTOS && (
        <section className="bday-rails" aria-label="Our photographs">
          <h2 className="bday-h2">
            Every one of these
            <em> is my favourite</em>
          </h2>

          {rails.map((rail, r) => (
            <Rail key={r} photos={rail} index={r} onPick={setLightbox} />
          ))}

          <p className="bday-rail-hint">tap any picture</p>
        </section>
        )}

        {/* ---- the letter ---- */}
        <section className="bday-letter" aria-label="A letter for you">
          <div className="bday-letter-card">
            <p className="bday-letter-to">To my Nishi,</p>

            <p>Happy birthday, my love. Happy, happy birthday.</p>

            <p>
              I still cannot believe how we found each other. Out of
              everyone in the whole world, somehow it was you and
              somehow it was me, and somehow the two of us ended up in
              the same small corner of it at the same time.
            </p>

            <p>
              It started with one &ldquo;Hi.&rdquo; That was all. One
              word, sent without knowing it was the most important
              thing I would ever type. Then the first time I heard your
              voice on the phone, then the video calls, one after
              another after another, till late, till neither of us
              could keep our eyes open and we stayed on anyway.
            </p>

            <p>
              And now here we are, where a day without you in it feels
              like something is missing from it. Not lonely exactly
              &mdash; &ldquo;Incomplete&rdquo;. I do things and they are
              only half done until I have told you. Something funny
              happens and it has not properly happened until you have
              laughed at it too. That is what you have done to me, and
              I would not undo a second of it.
            </p>

            <p className="bday-letter-big">
              I love you so much. More than I know how to put down
              here, and more than I manage to say out loud.
            </p>

            <p>
              And I need you. Badly, completely, on the good days and
              on the ones where I am no fun at all. You are the person
              I want to tell first. You are the plan, not part of it.
            </p>

            <p>
              Thank you to your Mom and Dad, for the 25th of September
              1996. They did not know what they were doing for me that
              day, but I am grateful for it. You were born for me,
              baby. I think I loved you in our last life too, that is
              the only thing that explains how easy it was, how quickly
              you felt like somewhere I had already been.
            </p>

            <p>
              Happy birthday, my whole heart. Here is to this one, and
              to every single one after it, all of them with me. I am
              permanently, entirely yours.
            </p>

            <p className="bday-letter-sign">
              <span className="bday-signature">Loviee Bhawiee</span>
              <span className="bday-signature-role">your better half</span>
            </p>
          </div>

          <p className="bday-foot">
            <span aria-hidden="true">♥</span> 25 September 2026{' '}
            <span aria-hidden="true">♥</span>
          </p>
        </section>
      </main>

      {/* ================= LIGHTBOX ================= */}
      {lightbox && (
        <div
          className="bday-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.caption}
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="bday-lightbox-close"
            aria-label="Close"
            onClick={() => setLightbox(null)}
          >
            ✕
          </button>
          <figure onClick={e => e.stopPropagation()}>
            <SafeImage photo={lightbox} className="bday-lightbox-img" priority />
          </figure>
        </div>
      )}

      {/* ================= THE SONG ================= */}
      {/* The player is built on mount so the track is buffered and
          rolling before she taps anything; only the control waits
          for the page to open. */}
      <SongHolder holderRef={holderRef} />
      {opened && <SongControl state={state} onToggle={toggle} />}
    </div>
  )
}
