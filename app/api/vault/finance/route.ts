// ============================================================
// app/api/vault/finance/route.ts
//
// Load and save the finance doc — one JSON object in the same S3
// bucket the vault uses. On load, anything older than the current
// schema is migrated up (and written back), so the client always
// sees a clean v2 document. Guarded by the vault session.
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { verifySession, VAULT_COOKIE } from '@/lib/vault-auth'
import { s3 } from '@/lib/storage'
import { seedDoc, migrate, type FinanceDoc } from '@/lib/finance-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = process.env.S3_BUCKET!
const KEY = '_finance/data.json'

async function guard(): Promise<boolean> {
  const jar = await cookies()
  return verifySession(jar.get(VAULT_COOKIE)?.value)
}

async function readRaw(): Promise<unknown | null> {
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }))
    const text = await out.Body!.transformToString()
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function writeDoc(doc: FinanceDoc): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: KEY, Body: JSON.stringify(doc), ContentType: 'application/json',
  }))
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try {
    const raw = await readRaw()
    if (!raw) {
      const fresh = seedDoc()
      await writeDoc(fresh)
      return NextResponse.json({ doc: fresh })
    }
    const wasV2 = (raw as { version?: number }).version === 2
    const doc = migrate(raw)
    if (!wasV2) await writeDoc(doc) // persist the upgrade so we only migrate once
    return NextResponse.json({ doc })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Storage error' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try {
    const body = (await request.json().catch(() => null)) as { doc?: FinanceDoc } | null
    if (!body?.doc || body.doc.version !== 2) {
      return NextResponse.json({ error: 'Bad document' }, { status: 400 })
    }
    body.doc.updatedAt = new Date().toISOString()
    await writeDoc(body.doc)
    return NextResponse.json({ ok: true, updatedAt: body.doc.updatedAt })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Storage error' }, { status: 500 })
  }
}
