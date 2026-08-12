// ============================================================
// lib/storage.ts
//
// Object storage for the vault. Works with any S3-compatible
// provider — the endpoint is an environment variable.
//
//   Backblaze B2      10 GB free, no card required
//   Cloudflare R2     10 GB free, card required, zero egress
//   Any other S3 API  set S3_ENDPOINT and the credentials
//
// Uploads and downloads use PRESIGNED URLS so the browser talks
// to the provider directly. That matters for two reasons:
//   1. Vercel functions cap request bodies at about 4.5 MB
//   2. Bytes never pass through Vercel, so no bandwidth is used
// ============================================================

import { S3Client, ListObjectsV2Command, DeleteObjectCommand,
         DeleteObjectsCommand, PutObjectCommand, GetObjectCommand,
         HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const BUCKET   = process.env.S3_BUCKET!
const ENDPOINT = process.env.S3_ENDPOINT!          // e.g. https://s3.us-west-004.backblazeb2.com
const REGION   = process.env.S3_REGION || 'auto'   // B2 needs its real region; R2 uses "auto"

export const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
})

export interface VaultEntry {
  key: string
  name: string
  isFolder: boolean
  size: number
  modified: string | null
}

/** Reject keys that try to escape the vault or contain control characters. */
export function sanitiseKey(raw: string): string {
  const key = raw.replace(/^\/+/, '').replace(/\.\.+/g, '').replace(/[\x00-\x1f]/g, '')
  return key.replace(/\/{2,}/g, '/')
}

/** List one level of the bucket, folders first. */
export async function listPrefix(prefix: string): Promise<VaultEntry[]> {
  const clean = prefix ? sanitiseKey(prefix).replace(/\/?$/, '/') : ''

  const out = await s3.send(new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: clean,
    Delimiter: '/',
    MaxKeys: 1000,
  }))

  const folders: VaultEntry[] = (out.CommonPrefixes ?? []).map(p => ({
    key: p.Prefix!,
    name: p.Prefix!.slice(clean.length).replace(/\/$/, ''),
    isFolder: true,
    size: 0,
    modified: null,
  }))

  const files: VaultEntry[] = (out.Contents ?? [])
    // A folder is a zero-byte object ending in "/" — don't list it as a file
    .filter(o => o.Key !== clean && !o.Key!.endsWith('/'))
    .map(o => ({
      key: o.Key!,
      name: o.Key!.slice(clean.length),
      isFolder: false,
      size: o.Size ?? 0,
      modified: o.LastModified ? o.LastModified.toISOString() : null,
    }))

  folders.sort((a, b) => a.name.localeCompare(b.name))
  files.sort((a, b) => a.name.localeCompare(b.name))
  return [...folders, ...files]
}

/** Total bytes stored, for the usage meter. */
export async function totalUsage(): Promise<{ bytes: number; objects: number }> {
  let bytes = 0, objects = 0, token: string | undefined

  do {
    const out: any = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET, MaxKeys: 1000, ContinuationToken: token,
    }))
    for (const o of out.Contents ?? []) {
      if (o.Key?.endsWith('/')) continue
      bytes += o.Size ?? 0
      objects += 1
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined
  } while (token)

  return { bytes, objects }
}

/** Presigned PUT so the browser can upload straight to the provider. */
export async function presignUpload(key: string, contentType: string) {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: sanitiseKey(key),
    ContentType: contentType || 'application/octet-stream',
  })
  return getSignedUrl(s3, cmd, { expiresIn: 3600 })
}

/** Presigned GET. `download` forces a save rather than opening in the browser. */
export async function presignDownload(key: string, download = true) {
  const clean = sanitiseKey(key)
  const name = clean.split('/').pop() || 'file'
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: clean,
    ...(download
      ? { ResponseContentDisposition: `attachment; filename="${name}"` }
      : {}),
  })
  return getSignedUrl(s3, cmd, { expiresIn: 3600 })
}

export async function deleteKey(key: string) {
  return s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: sanitiseKey(key) }))
}

/** Delete a folder by removing every object beneath it. */
export async function deleteFolder(prefix: string) {
  const clean = sanitiseKey(prefix).replace(/\/?$/, '/')
  let token: string | undefined
  let removed = 0

  do {
    const out: any = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: clean, MaxKeys: 1000, ContinuationToken: token,
    }))
    const keys = (out.Contents ?? []).map((o: any) => ({ Key: o.Key }))
    if (keys.length) {
      await s3.send(new DeleteObjectsCommand({
        Bucket: BUCKET, Delete: { Objects: keys },
      }))
      removed += keys.length
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined
  } while (token)

  return removed
}

/** Folders in object storage are a convention: a zero-byte object ending in "/". */
export async function createFolder(prefix: string) {
  const clean = sanitiseKey(prefix).replace(/\/?$/, '/')
  return s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: clean, Body: '' }))
}

export async function keyExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: sanitiseKey(key) }))
    return true
  } catch {
    return false
  }
}
