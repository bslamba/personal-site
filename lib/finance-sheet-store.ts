// ============================================================
// lib/finance-sheet-store.ts   (server only)
//
// Every month sheet a profile downloads, and the final copy taken when a
// month is closed, is kept here for good:
//
//   _finance/sheets/<profile>/<YYYY-MM>/<YYYY-MM>_<name>_<final|copy>_<time>-<hash>.xlsx
//
// <profile> is the person's entity id, or "household" for the family
// admin's view. Nothing is ever overwritten — every name carries its own
// time — and nothing is ever deleted: there is no delete here, the Files
// app refuses anything under _finance/ (lib/storage.ts), and the backup
// clean-up only ever touches _finance/backups/.
// ============================================================

import { createHash } from 'crypto'
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { s3 } from '@/lib/storage'

const BUCKET = process.env.S3_BUCKET!
const ROOT = '_finance/sheets/'

export interface SavedSheet { key: string; name: string; month: string; final: boolean; at: string; size: number }

const safe = (s: string) => s.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'profile'
export const profileFolder = (profile: string) => `${ROOT}${safe(profile)}/`

/** A short fingerprint of what a sheet contains, so downloading the same
 *  unchanged month again does not pile up identical copies. */
export const fingerprint = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 10)

export async function listSheets(profile: string, month?: string): Promise<SavedSheet[]> {
  const prefix = profileFolder(profile) + (month ? `${month}/` : '')
  const out: SavedSheet[] = []
  let token: string | undefined
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }))
    for (const o of page.Contents ?? []) {
      const key = o.Key ?? ''
      const name = key.split('/').pop() ?? ''
      const m = name.match(/^(\d{4}-\d{2})_.*_(final|copy)_(\d{8}T\d{6})/)
      if (!m) continue
      const t = m[3]
      out.push({ key, name, month: m[1], final: m[2] === 'final', size: o.Size ?? 0,
        at: `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:${t.slice(13, 15)}Z` })
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
  return out.sort((a, b) => b.month.localeCompare(a.month) || b.at.localeCompare(a.at))
}

/** Keep a sheet. A copy identical to one already kept is not stored twice;
 *  a final copy is always stored. Returns the key it is kept under. */
export async function saveSheet(opts: { profile: string; profileName: string; month: string; final: boolean; hash: string; body: Buffer }): Promise<string> {
  const folder = `${profileFolder(opts.profile)}${opts.month}/`
  if (!opts.final) {
    const existing = await listSheets(opts.profile, opts.month)
    const same = existing.find(s => s.name.includes(`-${opts.hash}.`))
    if (same) return same.key
  }
  const t = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '')   // 20260926T101530
  const key = `${folder}${opts.month}_${safe(opts.profileName)}_${opts.final ? 'final' : 'copy'}_${t}-${opts.hash}.xlsx`
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: opts.body,
    ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }))
  return key
}

export async function readSheet(key: string): Promise<Buffer> {
  const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  return Buffer.from(await out.Body!.transformToByteArray())
}
