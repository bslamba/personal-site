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
// Two: every current browser refuses to start audible playback
// without a real user gesture, and iOS refuses hardest. So there
// is no version of this that makes sound the instant the page
// loads. The page turns that into the good part instead — one tap
// on the cover opens the page and starts the song together.
//
// The player is 1×1 and hidden. If a video is ever made
// un-embeddable the API tells us, and we fall back to a plain
// link out to YouTube rather than sitting there silently.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'

// "Mahiya" — Diljit Dosanjh · Aura · Raj Ranjodh · MixSingh
export const SONG = {
  id: 'qAu8llwNFGY',
  title: 'Mahiya',
  artist: 'Diljit Dosanjh',
  url: 'https://www.youtube.com/watch?v=qAu8llwNFGY',
}

type PlayerState = 'idle' | 'ready' | 'playing' | 'paused' | 'blocked'

interface YTPlayer {
  playVideo: () => void
  pauseVideo: () => void
  setVolume: (v: number) => void
  destroy: () => void
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: Record<string, unknown>
  ) => YTPlayer
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

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

  // Build the player once, on the gesture that opens the page —
  // creating it earlier buys nothing and costs a request.
  const start = useCallback(async () => {
    if (playerRef.current) {
      playerRef.current.playVideo()
      return
    }
    if (!holderRef.current) return

    try {
      await loadYouTubeAPI()
      if (!window.YT?.Player || !holderRef.current) throw new Error('no api')

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
        },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            e.target.setVolume(58)
            e.target.playVideo()
            setState('playing')
          },
          onStateChange: (e: { data: number }) => {
            // 1 playing · 2 paused · 0 ended
            if (e.data === 1) setState('playing')
            else if (e.data === 2) setState('paused')
          },
          onError: () => setState('blocked'),
        },
      })
    } catch {
      setState('blocked')
    }
  }, [])

  const toggle = useCallback(() => {
    const player = playerRef.current
    if (!player) {
      void start()
      return
    }
    if (state === 'playing') {
      player.pauseVideo()
      setState('paused')
    } else {
      player.playVideo()
      setState('playing')
    }
  }, [state, start])

  useEffect(() => {
    return () => {
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [])

  return { holderRef, start, toggle, state }
}

/**
 * The hidden player, plus the little control that sits in the
 * corner. Kept in one component so the iframe and the button that
 * drives it can never drift apart.
 */
export function SongControl({
  state,
  onToggle,
  holderRef,
}: {
  state: PlayerState
  onToggle: () => void
  holderRef: React.RefObject<HTMLDivElement | null>
}) {
  const blocked = state === 'blocked'
  const playing = state === 'playing'

  return (
    <>
      {/* The player itself. Off-screen rather than display:none —
          a hidden iframe is allowed to be throttled. */}
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

      {blocked ? (
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
      ) : (
        <button
          type="button"
          onClick={onToggle}
          className="bday-song-btn"
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
            <em>{SONG.title}</em> · {SONG.artist}
          </span>
          <span className="bday-song-state" aria-hidden="true">
            {playing ? '❚❚' : '▶'}
          </span>
        </button>
      )}
    </>
  )
}
