'use client'

// Signs the profile out after a stretch of no interaction (default 25 min).
// Any mouse, key, scroll or touch resets the clock. On timeout it clears the
// session cookie and returns to the login screen.
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const IDLE_MS = 25 * 60 * 1000

export default function IdleLogout({ ms = IDLE_MS }: { ms?: number }) {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let done = false
    async function logout() {
      if (done) return
      done = true
      try { await fetch('/api/vault/logout', { method: 'POST' }) } catch { /* ignore */ }
      router.push('/vault/login?reason=idle')
      router.refresh()
    }
    function reset() {
      if (done) return
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(logout, ms)
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
    // Throttle so we're not clearing/setting timers on every mousemove.
    let last = 0
    const onActivity = () => { const now = Date.now(); if (now - last > 5000) { last = now; reset() } }
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }))
    reset()
    return () => { if (timer.current) clearTimeout(timer.current); events.forEach(e => window.removeEventListener(e, onActivity)) }
  }, [ms, router])

  return null
}
