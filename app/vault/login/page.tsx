'use client'

// ============================================================
// app/vault/login/page.tsx
//
// Sign in, plus a self-service password reset via email OTP.
// Reset flow: enter username -> a 6-digit code is emailed -> enter
// the code and a new password. Works for every profile.
// ============================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Loader2, ArrowLeft } from 'lucide-react'

type Mode = 'signin' | 'reset-request' | 'reset-verify'

export default function VaultLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [busy, setBusy]         = useState(false)

  const [mode, setMode]         = useState<Mode>('signin')
  const [otp, setOtp]           = useState('')
  const [newPass, setNewPass]   = useState('')
  const [emailHint, setEmailHint] = useState('')
  const [notice, setNotice]     = useState<string | null>(null)
  const router = useRouter()

  const HEADING = { fontFamily: 'var(--font-heading)' } as const
  const inputCls = 'mt-2 w-full border border-ink-300 bg-paper px-3 py-2.5 text-sm outline-none transition-colors focus:border-signal-500'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await fetch('/api/vault/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error ?? 'Sign in failed'); setBusy(false); return }
    router.push('/vault'); router.refresh()
  }

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setNotice(null)
    const res = await fetch('/api/vault/otp/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Could not send a code'); return }
    setEmailHint(data.emailHint ?? '')
    setNotice(`A 6-digit code was sent to ${data.emailHint ?? 'your email'}. It expires in 10 minutes.`)
    setMode('reset-verify')
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await fetch('/api/vault/password/reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, otp, newPassword: newPass }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Reset failed'); return }
    setNotice('Password changed. You can sign in now.')
    setMode('signin'); setPassword(''); setOtp(''); setNewPass('')
  }

  function goto(m: Mode) {
    setMode(m); setError(null); setNotice(null)
    if (m === 'signin') { setOtp(''); setNewPass('') }
  }

  return (
    <div className="flex min-h-[75vh] items-center justify-center bg-paper-dim px-6 py-20">
      <div className="w-full max-w-sm border border-ink-200 bg-paper p-10">

        <div className="mb-7 flex h-11 w-11 items-center justify-center bg-signal-500 text-paper">
          <Lock className="h-5 w-5" aria-hidden="true" />
        </div>

        <span className="label text-signal-500">Restricted</span>
        <h1 className="heading mt-2 text-3xl">
          {mode === 'signin' ? 'Vault sign in' : 'Reset password'}
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          {mode === 'signin'
            ? 'Private file storage. Authorised access only.'
            : mode === 'reset-request'
              ? 'Enter your username and we’ll email you a one-time code.'
              : `Enter the code we sent${emailHint ? ' to ' + emailHint : ''} and a new password.`}
        </p>

        {notice && (
          <p className="mt-5 border-l-2 border-emerald-500 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </p>
        )}

        {/* ---- Sign in ---- */}
        {mode === 'signin' && (
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="u" className="label block text-ink-500">Username</label>
              <input id="u" required autoComplete="username" autoFocus value={username}
                onChange={e => setUsername(e.target.value)} style={HEADING} className={inputCls} />
            </div>
            <div>
              <label htmlFor="p" className="label block text-ink-500">Password</label>
              <input id="p" type="password" required autoComplete="current-password" value={password}
                onChange={e => setPassword(e.target.value)} style={HEADING} className={inputCls} />
            </div>
            {error && (
              <p className="border-l-2 border-signal-500 bg-signal-50 px-3 py-2 text-sm text-signal-700">{error}</p>
            )}
            <button type="submit" disabled={busy} className="btn-signal w-full justify-center disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" onClick={() => goto('reset-request')}
              className="w-full text-center text-sm text-signal-600 hover:underline">
              Forgot password?
            </button>
          </form>
        )}

        {/* ---- Reset: request code ---- */}
        {mode === 'reset-request' && (
          <form onSubmit={requestOtp} className="mt-8 space-y-5">
            <div>
              <label htmlFor="ru" className="label block text-ink-500">Username</label>
              <input id="ru" required autoFocus value={username}
                onChange={e => setUsername(e.target.value)} style={HEADING} className={inputCls} />
            </div>
            {error && (
              <p className="border-l-2 border-signal-500 bg-signal-50 px-3 py-2 text-sm text-signal-700">{error}</p>
            )}
            <button type="submit" disabled={busy} className="btn-signal w-full justify-center disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? 'Sending…' : 'Email me a code'}
            </button>
            <button type="button" onClick={() => goto('signin')}
              className="flex w-full items-center justify-center gap-1 text-sm text-ink-500 hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
            </button>
          </form>
        )}

        {/* ---- Reset: verify code + new password ---- */}
        {mode === 'reset-verify' && (
          <form onSubmit={resetPassword} className="mt-8 space-y-5">
            <div>
              <label htmlFor="otp" className="label block text-ink-500">6-digit code</label>
              <input id="otp" required autoFocus inputMode="numeric" maxLength={6} value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                style={HEADING} className={inputCls + ' tracking-[0.4em]'} placeholder="000000" />
            </div>
            <div>
              <label htmlFor="np" className="label block text-ink-500">New password</label>
              <input id="np" type="password" required minLength={6} autoComplete="new-password" value={newPass}
                onChange={e => setNewPass(e.target.value)} style={HEADING} className={inputCls} />
            </div>
            {error && (
              <p className="border-l-2 border-signal-500 bg-signal-50 px-3 py-2 text-sm text-signal-700">{error}</p>
            )}
            <button type="submit" disabled={busy} className="btn-signal w-full justify-center disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? 'Saving…' : 'Set new password'}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={() => goto('reset-request')}
                className="text-ink-500 hover:underline">Resend code</button>
              <button type="button" onClick={() => goto('signin')}
                className="text-ink-500 hover:underline">Back to sign in</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
