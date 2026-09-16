'use client'

// Small sign-out control for the vault landing header.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Loader2 } from 'lucide-react'

export default function VaultLogout() {
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function out() {
    setBusy(true)
    try {
      await fetch('/api/vault/logout', { method: 'POST' })
    } catch {
      /* ignore — cookie clears client-side on navigate anyway */
    }
    router.push('/vault/login')
    router.refresh()
  }

  return (
    <button className="vg-btn vg-signout" onClick={out} disabled={busy} aria-label="Sign out" title="Sign out">
      {busy ? <Loader2 className="h-4 w-4 vg-spin" /> : <LogOut className="h-4 w-4" />}
      <span className="vg-signout-label">Sign out</span>
    </button>
  )
}
