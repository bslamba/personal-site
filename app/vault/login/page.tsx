'use client'

// ============================================================
// app/vault/login/page.tsx
// ============================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Loader2 } from 'lucide-react'

export default function VaultLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [busy, setBusy]         = useState(false)
  const router = useRouter()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)

    const res = await fetch('/api/vault/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(data.error ?? 'Sign in failed')
      setBusy(false)
      return
    }

    router.push('/vault')
    router.refresh()
  }

  const HEADING = { fontFamily: 'var(--font-heading)' } as const

  return (
    <div className="flex min-h-[75vh] items-center justify-center bg-paper-dim px-6 py-20">
      <div className="w-full max-w-sm border border-ink-200 bg-paper p-10">

        <div className="mb-7 flex h-11 w-11 items-center justify-center bg-signal-500 text-paper">
          <Lock className="h-5 w-5" aria-hidden="true" />
        </div>

        <span className="label text-signal-500">Restricted</span>
        <h1 className="heading mt-2 text-3xl">Vault sign in</h1>
        <p className="mt-2 text-sm text-ink-500">Private file storage. Authorised access only.</p>

        <form onSubmit={submit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="u" className="label block text-ink-500">Username</label>
            <input
              id="u" required autoComplete="username" autoFocus
              value={username} onChange={e => setUsername(e.target.value)}
              style={HEADING}
              className="mt-2 w-full border border-ink-300 bg-paper px-3 py-2.5 text-sm outline-none transition-colors focus:border-signal-500"
            />
          </div>

          <div>
            <label htmlFor="p" className="label block text-ink-500">Password</label>
            <input
              id="p" type="password" required autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
              style={HEADING}
              className="mt-2 w-full border border-ink-300 bg-paper px-3 py-2.5 text-sm outline-none transition-colors focus:border-signal-500"
            />
          </div>

          {error && (
            <p className="border-l-2 border-signal-500 bg-signal-50 px-3 py-2 text-sm text-signal-700">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-signal w-full justify-center disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
