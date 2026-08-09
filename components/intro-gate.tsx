'use client'

// ============================================================
// components/intro-gate.tsx
//
// The full-screen entrance. Your photo and name fill the viewport;
// clicking anywhere splits the screen down the middle and the two
// halves slide apart like doors, revealing the site behind.
//
// How the split works: each "door" is 50% of the viewport wide with
// overflow hidden. Inside each door sits a FULL-WIDTH copy of the
// same artwork — the left one pinned to the left edge, the right one
// pinned to the right edge. Because both copies are exactly the
// viewport width and aligned to opposite edges, they line up
// seamlessly and read as one image. Slide them apart and the name
// tears down the middle.
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'

const NAME_LINE_1 = 'BHAWNEET'
const NAME_LINE_2 = 'LAMBA'

// The artwork, rendered twice — once inside each door.
function GateArtwork() {
  return (
    <div className="flex h-full w-screen flex-col items-center justify-center px-6">

      {/* Photo. Delete this block if you'd rather show name only. */}
      <div className="fade-up relative mb-10 h-44 w-44 shrink-0 overflow-hidden rounded-full ring-2 ring-signal-500 sm:h-60 sm:w-60">
        <Image
          src="/avatar.jpg"
          alt=""
          fill
          priority
          sizes="240px"
          className="object-cover"
        />
      </div>

      <h1 className="display-xl fade-up-slow text-center text-paper">
        <span className="block text-[clamp(3rem,13vw,11rem)]">
          {NAME_LINE_1}
        </span>
        <span className="block text-[clamp(3rem,13vw,11rem)] text-signal-500">
          {NAME_LINE_2}
        </span>
      </h1>

      <p className="fade-up-slow label mt-8 text-center text-ink-400">
        Infrastructure Security · Bangalore
      </p>
    </div>
  )
}

export default function IntroGate() {
  const [open, setOpen] = useState(false)
  const [gone, setGone] = useState(false)

  const openGate = useCallback(() => setOpen(true), [])

  // Lock page scrolling while the gate is closed.
  useEffect(() => {
    document.body.classList.add('gate-locked')
    return () => document.body.classList.remove('gate-locked')
  }, [])

  // Unlock and eventually remove the gate from the DOM entirely,
  // so it can never intercept a click once it's out of the way.
  useEffect(() => {
    if (!open) return
    document.body.classList.remove('gate-locked')
    const t = setTimeout(() => setGone(true), 1700)
    return () => clearTimeout(t)
  }, [open])

  // Any key, any scroll, any click opens it.
  useEffect(() => {
    if (open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault()
        openGate()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', openGate, { once: true, passive: true })
    window.addEventListener('touchmove', openGate, { once: true, passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', openGate)
      window.removeEventListener('touchmove', openGate)
    }
  }, [open, openGate])

  if (gone) return null

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Enter the site"
      onClick={openGate}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') openGate()
      }}
      className={`fixed inset-0 z-[100] cursor-pointer select-none ${
        open ? 'pointer-events-none' : ''
      }`}
    >
      {/* ---------- LEFT DOOR ---------- */}
      <div
        className={`absolute inset-y-0 left-0 w-1/2 overflow-hidden bg-ink-950 transition-transform duration-[1500ms] ease-[cubic-bezier(0.76,0,0.24,1)] ${
          open ? '-translate-x-full' : 'translate-x-0'
        }`}
      >
        <div className="absolute inset-y-0 left-0 w-screen">
          <GateArtwork />
        </div>
      </div>

      {/* ---------- RIGHT DOOR ---------- */}
      <div
        className={`absolute inset-y-0 right-0 w-1/2 overflow-hidden bg-ink-950 transition-transform duration-[1500ms] ease-[cubic-bezier(0.76,0,0.24,1)] ${
          open ? 'translate-x-full' : 'translate-x-0'
        }`}
      >
        <div className="absolute inset-y-0 right-0 w-screen">
          <GateArtwork />
        </div>
      </div>

      {/* ---------- ENTER HINT ---------- */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-10 flex flex-col items-center gap-3 transition-opacity duration-300 ${
          open ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <span className="hint-pulse label text-paper">Click to enter</span>
        <span
          className="hint-pulse block h-8 w-px bg-signal-500"
          aria-hidden="true"
        />
      </div>
    </div>
  )
}
