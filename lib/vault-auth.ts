// ============================================================
// lib/vault-auth.ts
//
// Session handling for the vault. A signed cookie — no database on
// the hot path. The cookie now carries WHO is signed in and their
// ROLE, so the finance API can show each person only what they are
// allowed to see. The payload is HMAC-signed with a server-only
// secret, so the browser cannot forge or change it.
//
//   cookie value = base64url(JSON {u,r,e,exp}) + "." + HMAC(base64url)
//     u = user id/username   r = 'super' | 'member'   e = entity id | null
// ============================================================

const COOKIE = 'vault_session'
const MAX_AGE = 60 * 60 * 12          // 12 hours

export type Role = 'super' | 'member'
export interface Session { u: string; r: Role; e: string | null; exp: number }

function secret(): string {
  const s = process.env.VAULT_SECRET
  if (!s || s.length < 32) throw new Error('VAULT_SECRET is missing or shorter than 32 characters')
  return s
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
const unb64url = (s: string) => Buffer.from(s, 'base64url').toString('utf8')

/** Build the cookie for a signed-in user. */
export async function createSession(user: { u: string; r: Role; e: string | null }): Promise<{ name: string; value: string; maxAge: number }> {
  const payload: Session = { u: user.u, r: user.r, e: user.e, exp: Date.now() + MAX_AGE * 1000 }
  const body = b64url(JSON.stringify(payload))
  const sig = await hmac(body)
  return { name: COOKIE, value: `${body}.${sig}`, maxAge: MAX_AGE }
}

/** Parse + verify a cookie value. Returns the session, or null. */
export async function getSession(value: string | undefined): Promise<Session | null> {
  if (!value) return null
  const dot = value.lastIndexOf('.')
  if (dot < 1) return null
  const body = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  const expected = await hmac(body)
  if (!safeEqual(sig, expected)) return null
  try {
    const p = JSON.parse(unb64url(body)) as Session
    if (!p || typeof p.exp !== 'number' || p.exp < Date.now()) return null
    if (p.r !== 'super' && p.r !== 'member') return null
    return p
  } catch { return null }
}

/** Cheap boolean check for routes that only need "is a valid session". */
export async function verifySession(value: string | undefined): Promise<boolean> {
  return (await getSession(value)) !== null
}

export async function isSuper(value: string | undefined): Promise<boolean> {
  const s = await getSession(value)
  return s?.r === 'super'
}

export const VAULT_COOKIE = COOKIE
export const MAX_AGE_SECONDS = MAX_AGE
