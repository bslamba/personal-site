// ============================================================
// app/api/vault/finance/route.ts
//
// Load and save the finance tracker. The whole thing is one JSON
// document parked in the same S3 bucket the vault already uses —
// no database, no new service. Guarded by the vault session, so it
// is exactly as private as the rest of /vault.
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { verifySession, VAULT_COOKIE } from '@/lib/vault-auth'
import { s3 } from '@/lib/storage'
import { seedDoc, type FinanceDoc } from '@/lib/finance-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = process.env.S3_BUCKET!
const KEY = '_finance/data.json'

async function guard(): Promise<boolean> {
  const jar = await cookies()
  return verifySession(jar.get(VAULT_COOKIE)?.value)
}

async function readDoc(): Promise<FinanceDoc | null> {
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }))
    const text = await out.Body!.transformToString()
    return JSON.parse(text) as FinanceDoc
  } catch {
    return null
  }
}

async function writeDoc(doc: FinanceDoc): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: KEY,
      Body: JSON.stringify(doc),
      ContentType: 'application/json',
    })
  )
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try {
    let doc = await readDoc()
    if (!doc) {
      doc = seedDoc()
      await writeDoc(doc) // first visit: lay down the seed so edits have something to build on
    }
    return NextResponse.json({ doc })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Storage error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try {
    const body = (await request.json().catch(() => null)) as { doc?: FinanceDoc } | null
    if (!body?.doc || body.doc.version !== 1) {
      return NextResponse.json({ error: 'Bad document' }, { status: 400 })
    }
    body.doc.updatedAt = new Date().toISOString()
    await writeDoc(body.doc)
    return NextResponse.json({ ok: true, updatedAt: body.doc.updatedAt })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Storage error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
