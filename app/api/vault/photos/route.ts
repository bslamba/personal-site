// ============================================================
// app/api/vault/photos/route.ts
//
// The family-photos wall. Photos live in the same S3 bucket as the
// vault, under the "family/" prefix; each category is a folder
// ("family/<category>/"). This endpoint lists categories (with a
// cover image) and, for one category, every photo with a short-
// lived presigned URL so the browser can show it inline.
//
// Uploads reuse /api/vault/upload-url (key: family/<cat>/<file>).
// Deletes reuse /api/vault/delete. Guarded by the vault session.
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession, VAULT_COOKIE } from '@/lib/vault-auth'
import { listPrefix, presignDownload, createFolder, sanitiseKey } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ROOT = 'family/'
const IMG = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i

async function guard(): Promise<boolean> {
  const jar = await cookies()
  return verifySession(jar.get(VAULT_COOKIE)?.value)
}

export async function GET(request: Request) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const category = new URL(request.url).searchParams.get('category')

  try {
    if (category) {
      const prefix = `${ROOT}${sanitiseKey(category)}/`
      const entries = await listPrefix(prefix)
      const photos = await Promise.all(
        entries
          .filter(e => !e.isFolder && IMG.test(e.name))
          .map(async e => ({
            key: e.key,
            name: e.name,
            size: e.size,
            modified: e.modified,
            url: await presignDownload(e.key, false),
          }))
      )
      // newest first
      photos.sort((a, b) => (b.modified ?? '').localeCompare(a.modified ?? ''))
      return NextResponse.json({ category, photos })
    }

    // No category: list the categories, each with a cover + count.
    const top = await listPrefix(ROOT)
    const cats = await Promise.all(
      top
        .filter(e => e.isFolder)
        .map(async e => {
          const inside = await listPrefix(e.key)
          const imgs = inside.filter(x => !x.isFolder && IMG.test(x.name))
          const cover = imgs[0] ? await presignDownload(imgs[0].key, false) : null
          return { name: e.name.replace(/\/$/, ''), count: imgs.length, cover }
        })
    )
    cats.sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json({ categories: cats })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Storage error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { category?: string }
  const name = (body.category ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Missing category name' }, { status: 400 })
  try {
    await createFolder(`${ROOT}${sanitiseKey(name)}/`)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Storage error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
