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

  // Two rails drifting opposite ways. With a handful of pictures
  // each rail shows all of them; past that the set is split so the
  // two rails are never the same wall of photographs going by
  // twice, and neither track carries the whole gallery.
  const [railA, railB] = useMemo(() => {
    if (PHOTOS.length < 6) return [PHOTOS, [...PHOTOS].reverse()]
    const half = Math.ceil(PHOTOS.length / 2)
    return [PHOTOS.slice(0, half), [...PHOTOS.slice(half)].reverse()]
  }, [])

  // A card is roughly 190px wide including its gap, and about
  // 26 seconds per screenful reads as a drift rather than a
  // conveyor belt. The marquee travels half the doubled track, so
  // the duration is proportional to the number of cards in one
  // copy of it.
  const railDuration = (cards: number) => `${Math.max(34, cards * 5.2)}s`

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
            <p className="bday-eyebrow">Happy birthday</p>
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

          <div className="bday-rail" data-dir="left">
            <div
              className="bday-rail-track"
              style={{ ['--rail-duration' as string]: railDuration(railA.length) }}
            >
              {[...railA, ...railA].map((photo, i) => (
                <button
                  key={`a${i}`}
                  type="button"
                  className={`bday-card ${photo.portrait ? 'is-tall' : ''}`}
                  onClick={() => setLightbox(photo)}
                  style={{ ['--tilt' as string]: `${((i % 5) - 2) * 1.6}deg` }}
                  aria-label={photo.caption}
                >
                  <SafeImage photo={photo} className="bday-card-img" small />
                  <span className="bday-card-cap">{photo.caption}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bday-rail" data-dir="right">
            <div
              className="bday-rail-track"
              style={{ ['--rail-duration' as string]: railDuration(railB.length) }}
            >
              {[...railB, ...railB].map((photo, i) => (
                <button
                  key={`b${i}`}
                  type="button"
                  className={`bday-card ${photo.portrait ? 'is-tall' : ''}`}
                  onClick={() => setLightbox(photo)}
                  style={{ ['--tilt' as string]: `${((i % 4) - 1.5) * -1.8}deg` }}
                  aria-label={photo.caption}
                >
                  <SafeImage photo={photo} className="bday-card-img" small />
                  <span className="bday-card-cap">{photo.caption}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="bday-rail-hint">tap any picture</p>
        </section>
        )}

        {/* ---- the letter ---- */}
        <section className="bday-letter" aria-label="A letter for you">
          <div className="bday-letter-card">
            <p className="bday-letter-to">To my Nishi,</p>

            <p>
              Thirty years ago the world got quietly, permanently better,
              and it had no idea. I did not know it either — not for a long
              time. Then I met you, and every ordinary thing since has had
              you somewhere in it.
            </p>

            <p>
              I love the way you laugh before the funny part. I love that
              you look at me like that in the middle of a food court, with
              a paper cup between us and nothing special happening at all.
              I love that the days I remember are almost never the big ones.
              They&rsquo;re a shared drink, a bad photo, you mid-sentence
              about something that mattered to you.
            </p>

            <p className="bday-letter-big">
              I love you so much. More than I know how to put down here,
              and more than I manage to say out loud.
            </p>

            <p>
              And I need you — badly, completely, on the good days and the
              ones where I&rsquo;m no fun at all. You are the person I want
              to tell first. You are the plan, not part of it.
            </p>

            <p>
              So: happy birthday, my love. Here&rsquo;s to your thirtieth,
              and to every single one after it, all of them with me,
              hopelessly and permanently yours.
            </p>

            <p className="bday-letter-sign">
              Always &amp; all ways,
              <br />
              <span>your Bhawneet</span>
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
            <figcaption>{lightbox.caption}</figcaption>
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
