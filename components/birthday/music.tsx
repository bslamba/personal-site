'use client'

// ============================================================
// components/birthday/music.tsx
//
// The song, played through YouTube's own embedded player.
//
// Two constraints shape this, and neither is negotiable.
//
// One: the recording belongs to its rights holders. Ripping the
// audio and serving it from this domain would be lifting it. An
// embedded player leaves the song where it lives, counts the play
// for the artist, and is the arrangement YouTube actually offers.
//
// Two: no browser will start *audible* playback on its own. Muted
// autoplay is allowed everywhere; sound needs a user gesture, and
// iOS enforces that absolutely. There is no code that gets round
// it — anything claiming to autoplay music is playing it silently.
//
// So the player does everything it is allowed to do, immediately:
//
//   · it loads and starts playing, muted, the moment the page
//     opens, so the audio is already buffered and running
//   · it tries to unmute straight away. On a desktop browser that
//     already trusts this site, that works and the song simply
//     plays with nothing touched at all
//   · if that is refused, the very first thing she does anywhere
//     on the page — a tap, a scroll, a key — unmutes it. Because
//     the track is already rolling, sound is instant rather than
//     waiting on YouTube to load
//
// In practice she taps the cover to open the page, and the song
// starts on that. The rest is for every other way in.
//
// The player is 1×1 and off-screen. If a video is ever made
// un-embeddable the API tells us, and we fall back to a plain link
// out to YouTube rather than sitting there silently.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'

// "Mahiya" — Diljit Dosanjh · Aura · Raj Ranjodh · MixSingh
export const SONG = {
  id: 'qAu8llwNFGY',
  title: 'Mahiya',
  artist: 'Diljit Dosanjh',
  url: 'https://www.youtube.com/watch?v=qAu8llwNFGY',
}

export type PlayerState =
  | 'idle' // nothing yet
  | 'silent' // rolling, but muted — needs a gesture for sound
  | 'playing' // audible
  | 'paused'
  | 'blocked' // the video cannot be embedded here at all

interface YTPlayer {
  playVideo: () => void
  pauseVideo: () => void
  mute: () => void
  unMute: () => void
  isMuted: () => boolean
  setVolume: (v: number) => void
  getPlayerState: () => number
  destroy: () => void
}

interface YTNamespace {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

const VOLUME = 58

let apiPromise: Promise<void> | null = null

/** Load the IFrame API once per page, however many callers ask. */
function loadYouTubeAPI(): Promise<void> {
  if (apiPromise) return apiPromise

  apiPromise = new Promise<void>((resolve, reject) => {
    if (window.YT?.Player) {
      resolve()
      return
    }

    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }

    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => reject(new Error('YouTube API failed to load'))
    document.head.appendChild(script)

    // If the network eats the script, do not hang for ever.
    setTimeout(() => reject(new Error('YouTube API timed out')), 12000)
  })

  return apiPromise
}

export function useBirthdaySong() {
  const holderRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const [state, setState] = useState<PlayerState>('idle')

  /**
   * Ask for sound. Safe to call as often as you like — it is what
   * every gesture on the page routes into.
   */
  const start = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    try {
      player.unMute()
      player.setVolume(VOLUME)
      player.playVideo()
      // Trust the state change rather than assuming: if the browser
      // refuses the unmute, onStateChange will not report audible
      // playback and the pill keeps offering the tap.
      setTimeout(() => {
        if (!playerRef.current) return
        setState(playerRef.current.isMuted() ? 'silent' : 'playing')
      }, 120)
    } catch {
      /* the player is not ready yet; the next gesture will do it */
    }
  }, [])

  const toggle = useCallback(() => {
    const player = playerRef.current
    if (!player) return

    if (state === 'playing') {
      player.pauseVideo()
      setState('paused')
      return
    }
    // From silent or paused, the button is a real gesture, so this
    // is the one call that is certain to be allowed.
    start()
  }, [state, start])

  // ---- build the player as soon as the page exists ----
  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        await loadYouTubeAPI()
        if (cancelled || !window.YT?.Player || !holderRef.current) return

        playerRef.current = new window.YT.Player(holderRef.current, {
          videoId: SONG.id,
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            loop: 1,
            playlist: SONG.id, // loop:1 needs the id repeated here
            mute: 1, // muted autoplay is allowed everywhere
          },
          events: {
            onReady: (e: { target: YTPlayer }) => {
              if (cancelled) return
              e.target.setVolume(VOLUME)
              e.target.playVideo()
              setState('silent')
              // Try for sound with no gesture at all. Works on a
              // browser that already trusts this site; harmless
              // everywhere else.
              e.target.unMute()
              setTimeout(() => {
                if (cancelled || !playerRef.current) return
                setState(playerRef.current.isMuted() ? 'silent' : 'playing')
              }, 250)
            },
            onStateChange: (e: { data: number }) => {
              if (cancelled) return
              // 1 playing · 2 paused · 0 ended
              if (e.data === 1) {
                setState(playerRef.current?.isMuted() ? 'silent' : 'playing')
              } else if (e.data === 2) {
                setState('paused')
              }
            },
            onError: () => !cancelled && setState('blocked'),
          },
        })
      } catch {
        if (!cancelled) setState('blocked')
      }
    })()

    return () => {
      cancelled = true
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [])

  // ---- the first thing she does anywhere turns the sound on ----
  useEffect(() => {
    if (state !== 'silent') return

    const wake = () => start()
    const events: (keyof DocumentEventMap)[] = [
      'pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll',
    ]
    // Capture phase, so this runs even when something inside the
    // page stops the event; passive, so it never delays a scroll.
    const options = { capture: true, passive: true } as const
    events.forEach(name => document.addEventListener(name, wake, options))

    return () =>
      events.forEach(name => document.removeEventListener(name, wake, options))
  }, [state, start])

  return { holderRef, start, toggle, state }
}

/** The off-screen player. Rendered from the first paint, always. */
export function SongHolder({
  holderRef,
}: {
  holderRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    // Off-screen rather than display:none — a hidden iframe is
    // allowed to be throttled, and a throttled one stops playing.
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        width: 1,
        height: 1,
        left: -9999,
        top: -9999,
        pointerEvents: 'none',
        opacity: 0,
      }}
    >
      <div ref={holderRef} />
    </div>
  )
}

/** The little control in the corner. */
export function SongControl({
  state,
  onToggle,
}: {
  state: PlayerState
  onToggle: () => void
}) {
  if (state === 'blocked') {
    return (
      <a
        href={SONG.url}
        target="_blank"
        rel="noopener noreferrer"
        className="bday-song-btn"
        title="Open the song on YouTube"
      >
        <span className="bday-song-note" aria-hidden="true">
          ♫
        </span>
        <span className="bday-song-text">
          Play <em>{SONG.title}</em> on YouTube
        </span>
      </a>
    )
  }

  const playing = state === 'playing'
  const silent = state === 'silent'

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`bday-song-btn ${silent ? 'is-silent' : ''}`}
      aria-pressed={playing}
      title={playing ? 'Pause the song' : 'Play the song'}
    >
      <span
        className={`bday-song-note ${playing ? 'is-playing' : ''}`}
        aria-hidden="true"
      >
        ♫
      </span>
      <span className="bday-song-text">
        {silent ? (
          <>Tap for sound · <em>{SONG.title}</em></>
        ) : (
          <>
            <em>{SONG.title}</em> · {SONG.artist}
          </>
        )}
      </span>
      <span className="bday-song-state" aria-hidden="true">
        {playing ? '❚❚' : '▶'}
      </span>
    </button>
  )
}
