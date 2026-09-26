'use client'

// ============================================================
// app/vault/login/page.tsx
//
// Sign in, plus a self-service password reset via email OTP.
// Reset flow: enter username -> a 6-digit code is emailed -> enter
// the code and a new password. Works for every profile.
// ============================================================

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Loader2, ArrowLeft } from 'lucide-react'
import { Logo } from '@/components/vault/vault-chrome'

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

  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get('reason') === 'idle') setNotice('You were signed out after 25 minutes of inactivity. Please sign in again.') } catch { /* ignore */ }
  }, [])

  // Same glass, themes and type as the rest of the vault.
  const inputCls = 'vg-input'
  const errBox = { padding: '0.55rem 0.75rem', borderRadius: 10, fontSize: '0.85rem', background: 'color-mix(in srgb, var(--vg-neg) 12%, transparent)', color: 'var(--vg-neg)' } as const

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await fetch('/api/vault/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error ?? 'Sign in failed'); setBusy(false); return }
    // Straight to where they belong — members to Finance — so there is no
    // stop at /vault and its redirect on the way.
    router.replace(data.role === 'super' ? '/vault' : '/vault/finance'); router.refresh()
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
    <div className="vg vg-login" style={{ display: 'grid', placeItems: 'center', padding: '1.5rem' }}>
      <div className="vg-card" style={{ width: 'min(400px, 100%)', padding: 'clamp(1.6rem, 5vw, 2.4rem)' }}>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.4rem' }}><Logo href="/vault" /></div>

        <span className="vg-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Lock className="h-3.5 w-3.5" aria-hidden="true" /> Private</span>
        <h1 className="vg-h1" style={{ fontSize: '1.7rem' }}>
          {mode === 'signin' ? 'Vault sign in' : 'Reset password'}
        </h1>
        <p className="vg-sub">
          {mode === 'signin'
            ? 'The Lamba family’s private vault.'
            : mode === 'reset-request'
              ? 'Enter your username and we’ll email you a one-time code.'
              : `Enter the code we sent${emailHint ? ' to ' + emailHint : ''} and a new password.`}
        </p>

        {notice && (
          <p style={{ marginTop: '1rem', padding: '0.55rem 0.75rem', borderRadius: 10, fontSize: '0.85rem', background: 'color-mix(in srgb, var(--vg-pos) 12%, transparent)', color: 'var(--vg-pos)' }}>
            {notice}
          </p>
        )}

        {/* ---- Sign in ---- */}
        {mode === 'signin' && (
          <form onSubmit={submit} style={{ marginTop: '1.5rem', display: 'grid', gap: '0.9rem' }}>
            <div>
              <label htmlFor="u" className="vg-lbl">Username</label>
              <input id="u" required autoComplete="username" autoFocus value={username}
                onChange={e => setUsername(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="p" className="vg-lbl">Password</label>
              <input id="p" type="password" required autoComplete="current-password" value={password}
                onChange={e => setPassword(e.target.value)} className={inputCls} />
            </div>
            {error && (
              <p style={errBox}>{error}</p>
            )}
            <button type="submit" disabled={busy} className="vg-btn vg-btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.65rem' }}>
              {busy ? <Loader2 className="h-4 w-4 vg-spin" /> : null}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" onClick={() => goto('reset-request')}
              className="vg-btn vg-btn-ghost" style={{ justifyContent: 'center' }}>
              Forgot password?
            </button>
          </form>
        )}

        {/* ---- Reset: request code ---- */}
        {mode === 'reset-request' && (
          <form onSubmit={requestOtp} style={{ marginTop: '1.5rem', display: 'grid', gap: '0.9rem' }}>
            <div>
              <label htmlFor="ru" className="vg-lbl">Username</label>
              <input id="ru" required autoFocus value={username}
                onChange={e => setUsername(e.target.value)} className={inputCls} />
            </div>
            {error && (
              <p style={errBox}>{error}</p>
            )}
            <button type="submit" disabled={busy} className="vg-btn vg-btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.65rem' }}>
              {busy ? <Loader2 className="h-4 w-4 vg-spin" /> : null}
              {busy ? 'Sending…' : 'Email me a code'}
            </button>
            <button type="button" onClick={() => goto('signin')}
              className="vg-btn vg-btn-ghost" style={{ justifyContent: 'center' }}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
            </button>
          </form>
        )}

        {/* ---- Reset: verify code + new password ---- */}
        {mode === 'reset-verify' && (
          <form onSubmit={resetPassword} style={{ marginTop: '1.5rem', display: 'grid', gap: '0.9rem' }}>
            <div>
              <label htmlFor="otp" className="vg-lbl">6-digit code</label>
              <input id="otp" required autoFocus inputMode="numeric" maxLength={6} value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                className={inputCls}  placeholder="000000" />
            </div>
            <div>
              <label htmlFor="np" className="vg-lbl">New password</label>
              <input id="np" type="password" required minLength={6} autoComplete="new-password" value={newPass}
                onChange={e => setNewPass(e.target.value)} className={inputCls} />
            </div>
            {error && (
              <p style={errBox}>{error}</p>
            )}
            <button type="submit" disabled={busy} className="vg-btn vg-btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.65rem' }}>
              {busy ? <Loader2 className="h-4 w-4 vg-spin" /> : null}
              {busy ? 'Saving…' : 'Set new password'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button type="button" onClick={() => goto('reset-request')}
                className="vg-btn vg-btn-ghost">Resend code</button>
              <button type="button" onClick={() => goto('signin')}
                className="vg-btn vg-btn-ghost">Back to sign in</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
