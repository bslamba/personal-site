// ============================================================
// lib/vault-auth.ts
//
// Session handling for the private file vault.
//
// A signed cookie, no database, no dependencies. The cookie holds
// an expiry timestamp plus an HMAC of that timestamp made with a
// server-only secret — so it cannot be forged or extended by the
// browser.
// ============================================================

const COOKIE = 'vault_session'
const MAX_AGE = 60 * 60 * 12          // 12 hours

function secret(): string {
  const s = process.env.VAULT_SECRET
  if (!s || s.length < 32) {
    throw new Error('VAULT_SECRET is missing or shorter than 32 characters')
  }
  return s
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Constant-time string comparison, to avoid leaking timing information. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Build the cookie value for a fresh session. */
export async function createSession(): Promise<{ name: string; value: string; maxAge: number }> {
  const expires = Date.now() + MAX_AGE * 1000
  const sig = await hmac(String(expires))
  return { name: COOKIE, value: `${expires}.${sig}`, maxAge: MAX_AGE }
}

/** Verify a cookie value. Returns true only if the signature matches and it has not expired. */
export async function verifySession(value: string | undefined): Promise<boolean> {
  if (!value) return false
  const [expires, sig] = value.split('.')
  if (!expires || !sig) return false

  const ts = Number(expires)
  if (!Number.isFinite(ts) || ts < Date.now()) return false

  const expected = await hmac(expires)
  return safeEqual(sig, expected)
}

export const VAULT_COOKIE = COOKIE
