// ============================================================
// lib/users.ts
//
// The vault's user accounts, stored in S3 at _auth/users.json.
// Passwords are never stored in the clear — only a PBKDF2 hash and
// a random salt. This file is read ONLY on the server (login and
// admin routes); it is never sent to the browser.
//
// Seeded on first use: a super-user (blamba) plus one member per
// person in the household. All start with the same default password
// and should be changed.
// ============================================================

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { s3 } from '@/lib/storage'
import type { Role } from '@/lib/vault-auth'

const BUCKET = process.env.S3_BUCKET!
const KEY = '_auth/users.json'
const ITER = 150_000
export const DEFAULT_PASSWORD = 'Qwerty@123'

export interface User {
  id: string          // = username
  username: string
  name: string
  role: Role
  entityId: string | null   // which finance entity this login IS (null for super)
  salt: string
  hash: string
  mustReset?: boolean
}

// Public shape (no secrets) for admin listings.
export interface UserPublic { username: string; name: string; role: Role; entityId: string | null; mustReset?: boolean }
export const publicUser = (u: User): UserPublic => ({ username: u.username, name: u.name, role: u.role, entityId: u.entityId, mustReset: u.mustReset })

function rand(bytes = 16): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function hashPassword(password: string, salt = rand(16)): Promise<{ salt: string; hash: string }> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: ITER, hash: 'SHA-256' },
    key, 256
  )
  const hash = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
  return { salt, hash }
}

async function readUsers(): Promise<User[] | null> {
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }))
    const text = await out.Body!.transformToString()
    return JSON.parse(text) as User[]
  } catch { return null }
}

export async function writeUsers(users: User[]): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: KEY, Body: JSON.stringify(users), ContentType: 'application/json' }))
}

// The people the household starts with (matches the seeded entities).
const SEED = [
  { id: 'blamba', name: 'Garry', role: 'super' as Role, entityId: null },
  { id: 'bhawneet', name: 'Bhawneet', role: 'member' as Role, entityId: 'bhawneet' },
  { id: 'gurneet', name: 'Gurneet', role: 'member' as Role, entityId: 'gurneet' },
  { id: 'papa', name: 'Papa', role: 'member' as Role, entityId: 'papa' },
]

export async function ensureSeed(): Promise<User[]> {
  const existing = await readUsers()
  if (existing && existing.length) return existing
  const users: User[] = []
  for (const s of SEED) {
    const { salt, hash } = await hashPassword(DEFAULT_PASSWORD)
    users.push({ id: s.id, username: s.id, name: s.name, role: s.role, entityId: s.entityId, salt, hash, mustReset: true })
  }
  await writeUsers(users)
  return users
}

export async function getUsers(): Promise<User[]> {
  return (await readUsers()) ?? (await ensureSeed())
}

export async function verifyLogin(username: string, password: string): Promise<User | null> {
  const users = await getUsers()
  const u = users.find(x => x.username.toLowerCase() === username.trim().toLowerCase())
  if (!u) return null
  const { hash } = await hashPassword(password, u.salt)
  return hash === u.hash ? u : null
}

/** Super-only: create or reset a member login. Returns the public record. */
export async function upsertUser(input: { username: string; name: string; role: Role; entityId: string | null; password?: string }): Promise<UserPublic> {
  const users = await getUsers()
  const uname = input.username.trim().toLowerCase()
  const { salt, hash } = await hashPassword(input.password || DEFAULT_PASSWORD)
  const idx = users.findIndex(u => u.username.toLowerCase() === uname)
  const rec: User = { id: uname, username: uname, name: input.name, role: input.role, entityId: input.entityId, salt, hash, mustReset: true }
  if (idx >= 0) users[idx] = { ...users[idx], ...rec }
  else users.push(rec)
  await writeUsers(users)
  return publicUser(rec)
}

export async function setPassword(username: string, password: string): Promise<boolean> {
  const users = await getUsers()
  const u = users.find(x => x.username.toLowerCase() === username.trim().toLowerCase())
  if (!u) return false
  const { salt, hash } = await hashPassword(password)
  u.salt = salt; u.hash = hash; u.mustReset = false
  await writeUsers(users)
  return true
}

export async function removeUser(username: string): Promise<void> {
  const users = await getUsers()
  await writeUsers(users.filter(u => u.username.toLowerCase() !== username.trim().toLowerCase()))
}
