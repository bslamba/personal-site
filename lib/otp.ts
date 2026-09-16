// ============================================================
// lib/otp.ts
//
// One-time codes for password reset, kept in S3 (_auth/otp.json).
// Only a hash of the code is stored, with a 10-minute expiry, a
// resend cool-down, and an attempt cap. The plain code is returned
// once to the caller so it can be emailed.
// ============================================================

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { s3 } from '@/lib/storage'
import { hashPassword } from '@/lib/users'

const BUCKET = process.env.S3_BUCKET!
const KEY = '_auth/otp.json'
const TTL = 10 * 60 * 1000        // 10 minutes
const RESEND_GAP = 45 * 1000      // min gap between sends
const MAX_ATTEMPTS = 6

interface Rec { salt: string; hash: string; expires: number; attempts: number; lastSent: number }
type Store = Record<string, Rec>

async function readStore(): Promise<Store> {
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }))
    return JSON.parse(await out.Body!.transformToString()) as Store
  } catch { return {} }
}
async function writeStore(s: Store): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: KEY, Body: JSON.stringify(s), ContentType: 'application/json' }))
}

/** Create a code for a username. Returns the code, or a cool-down wait. */
export async function issueOtp(username: string): Promise<{ code?: string; waitMs?: number }> {
  const store = await readStore()
  const now = Date.now()
  const cur = store[username]
  if (cur && now - cur.lastSent < RESEND_GAP) return { waitMs: RESEND_GAP - (now - cur.lastSent) }
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const { salt, hash } = await hashPassword(code)
  store[username] = { salt, hash, expires: now + TTL, attempts: 0, lastSent: now }
  await writeStore(store)
  return { code }
}

/** Verify a code. Consumes it on success. */
export async function verifyOtp(username: string, code: string): Promise<boolean> {
  const store = await readStore()
  const rec = store[username]
  if (!rec) return false
  if (Date.now() > rec.expires || rec.attempts >= MAX_ATTEMPTS) { delete store[username]; await writeStore(store); return false }
  const { hash } = await hashPassword(code, rec.salt)
  if (hash === rec.hash) { delete store[username]; await writeStore(store); return true }
  rec.attempts += 1
  await writeStore(store)
  return false
}
