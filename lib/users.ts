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

// The single super-user. Username `su`; this password is set the first
// time the account is created or migrated from the old `blamba` login.
const SUPER_USERNAME = 'su'
const SUPER_PASSWORD = 'FlipFLop@1872'
const LEGACY_SUPER = 'blamba'

export interface User {
  id: string          // = username
  username: string
  name: string
  role: Role
  entityId: string | null   // which finance entity this login IS (null for super)
  salt: string
  hash: string
  mustReset?: boolean
  email?: string
  firstName?: string
  lastName?: string
  avatar?: string           // data URL of the profile picture (small)
}

// Public shape (no secrets) for admin listings.
export interface UserPublic { username: string; name: string; role: Role; entityId: string | null; mustReset?: boolean; email?: string; firstName?: string; lastName?: string; avatar?: string }
export const publicUser = (u: User): UserPublic => ({ username: u.username, name: u.name, role: u.role, entityId: u.entityId, mustReset: u.mustReset, email: u.email, firstName: u.firstName, lastName: u.lastName, avatar: u.avatar })

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
  { id: SUPER_USERNAME, name: 'Garry', role: 'super' as Role, entityId: null, email: 'bhawneetlamba@outlook.com', firstName: 'Garry', lastName: '' },
  { id: 'bhawneet', name: 'Bhawneet', role: 'member' as Role, entityId: 'bhawneet', email: 'bhawneetlamba@outlook.com', firstName: 'Bhawneet', lastName: 'Lamba' },
  { id: 'gurneet', name: 'Gurneet', role: 'member' as Role, entityId: 'gurneet', email: '', firstName: 'Gurneet', lastName: 'Lamba' },
  { id: 'papa', name: 'Papa', role: 'member' as Role, entityId: 'papa', email: '', firstName: 'Papa', lastName: '' },
]

export async function ensureSeed(): Promise<User[]> {
  const existing = await readUsers()
  if (existing && existing.length) return existing
  const users: User[] = []
  for (const s of SEED) {
    const pw = s.id === SUPER_USERNAME ? SUPER_PASSWORD : DEFAULT_PASSWORD
    const { salt, hash } = await hashPassword(pw)
    users.push({ id: s.id, username: s.id, name: s.name, role: s.role, entityId: s.entityId, salt, hash, mustReset: s.id !== SUPER_USERNAME, email: s.email || undefined, firstName: s.firstName, lastName: s.lastName || undefined })
  }
  await writeUsers(users)
  return users
}

export async function getUsers(): Promise<User[]> {
  const users = (await readUsers()) ?? (await ensureSeed())
  let changed = false

  // --- Migration: retire the old `blamba` super-user in favour of `su`. ---
  const legacy = users.find(x => x.username.toLowerCase() === LEGACY_SUPER)
  let su = users.find(x => x.username.toLowerCase() === SUPER_USERNAME)
  if (!su) {
    const { salt, hash } = await hashPassword(SUPER_PASSWORD)
    su = {
      id: SUPER_USERNAME, username: SUPER_USERNAME, name: legacy?.name || 'Garry',
      role: 'super', entityId: null, salt, hash, mustReset: false,
      email: legacy?.email || 'bhawneetlamba@outlook.com',
      firstName: legacy?.firstName || 'Garry', lastName: legacy?.lastName,
      avatar: legacy?.avatar,
    }
    users.push(su)
    changed = true
  }
  if (legacy) {
    const i = users.indexOf(legacy)
    if (i >= 0) { users.splice(i, 1); changed = true }
  }

  // Backfill any known default emails / names onto existing accounts (one-time).
  for (const seed of SEED) {
    const u = users.find(x => x.username === seed.id)
    if (!u) continue
    if (seed.email && !u.email) { u.email = seed.email; changed = true }
    if (seed.firstName && !u.firstName) { u.firstName = seed.firstName; changed = true }
    if (seed.lastName && !u.lastName) { u.lastName = seed.lastName; changed = true }
  }
  if (changed) await writeUsers(users)
  return users
}

/** Update a user's own profile fields (name split, email, avatar). */
export async function updateProfile(username: string, patch: { firstName?: string; lastName?: string; email?: string; avatar?: string }): Promise<boolean> {
  const users = await getUsers()
  const u = users.find(x => x.username.toLowerCase() === username.trim().toLowerCase())
  if (!u) return false
  if (patch.firstName !== undefined) u.firstName = patch.firstName.trim()
  if (patch.lastName !== undefined) u.lastName = patch.lastName.trim()
  if (patch.email !== undefined && patch.email.trim()) u.email = patch.email.trim()
  if (patch.avatar !== undefined) u.avatar = patch.avatar || undefined
  const fn = (u.firstName || '').trim(); const ln = (u.lastName || '').trim()
  if (fn || ln) u.name = [fn, ln].filter(Boolean).join(' ')
  await writeUsers(users)
  return true
}

export async function verifyLogin(username: string, password: string): Promise<User | null> {
  const users = await getUsers()
  const u = users.find(x => x.username.toLowerCase() === username.trim().toLowerCase())
  if (!u) return null
  const { hash } = await hashPassword(password, u.salt)
  return hash === u.hash ? u : null
}

/** Super-only: create or reset a member login. Returns the public record. */
export async function upsertUser(input: { username: string; name: string; role: Role; entityId: string | null; password?: string; email?: string }): Promise<UserPublic> {
  const users = await getUsers()
  const uname = input.username.trim().toLowerCase()
  const { salt, hash } = await hashPassword(input.password || DEFAULT_PASSWORD)
  const idx = users.findIndex(u => u.username.toLowerCase() === uname)
  const parts = input.name.trim().split(/\s+/)
  const rec: User = { id: uname, username: uname, name: input.name, role: input.role, entityId: input.entityId, salt, hash, mustReset: true, email: input.email || undefined, firstName: parts[0] || input.name, lastName: parts.slice(1).join(' ') || undefined }
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

export async function setEmail(username: string, email: string): Promise<boolean> {
  const users = await getUsers()
  const u = users.find(x => x.username.toLowerCase() === username.trim().toLowerCase())
  if (!u) return false
  u.email = email.trim()
  await writeUsers(users)
  return true
}

export async function findUser(username: string): Promise<User | null> {
  const users = await getUsers()
  return users.find(x => x.username.toLowerCase() === (username || '').trim().toLowerCase()) ?? null
}

export async function removeUser(username: string): Promise<void> {
  const users = await getUsers()
  await writeUsers(users.filter(u => u.username.toLowerCase() !== username.trim().toLowerCase()))
}
