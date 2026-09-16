// ============================================================
// app/api/vault/finance/route.ts
//
// GET  — returns the finance doc AS THIS PERSON MAY SEE IT.
//        Super-users get everything; members get a filtered view
//        (common + expenses that involve them + only their own
//        savings, budget and pending approvals). Privacy is enforced
//        here on the server, not in the browser.
// PUT  — full-document write. SUPER-USERS ONLY. Members change data
//        through /api/vault/finance/action instead.
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSession, VAULT_COOKIE, type Session } from '@/lib/vault-auth'
import { s3 } from '@/lib/storage'
import { seedDoc, migrate, filterDocForMember, type FinanceDoc } from '@/lib/finance-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = process.env.S3_BUCKET!
const KEY = '_finance/data.json'

export async function readRaw(): Promise<unknown | null> {
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }))
    return JSON.parse(await out.Body!.transformToString())
  } catch { return null }
}
export async function writeDoc(doc: FinanceDoc): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: KEY, Body: JSON.stringify(doc), ContentType: 'application/json' }))
}
export function viewFor(session: Session, doc: FinanceDoc): FinanceDoc {
  if (session.r === 'super' || !session.e) return doc
  return filterDocForMember(doc, session.e)
}

export async function GET() {
  const jar = await cookies()
  const session = await getSession(jar.get(VAULT_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try {
    const raw = await readRaw()
    let doc: FinanceDoc
    if (!raw) { doc = seedDoc(); await writeDoc(doc) }
    else { const wasV2 = (raw as { version?: number }).version === 2; doc = migrate(raw); if (!wasV2) await writeDoc(doc) }
    return NextResponse.json({ doc: viewFor(session, doc), me: { role: session.r, entityId: session.e } })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Storage error' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const jar = await cookies()
  const session = await getSession(jar.get(VAULT_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.r !== 'super') return NextResponse.json({ error: 'Members cannot overwrite the shared sheet' }, { status: 403 })
  try {
    const body = (await request.json().catch(() => null)) as { doc?: FinanceDoc } | null
    if (!body?.doc || body.doc.version !== 2) return NextResponse.json({ error: 'Bad document' }, { status: 400 })
    body.doc.updatedAt = new Date().toISOString()
    await writeDoc(body.doc)
    return NextResponse.json({ ok: true, updatedAt: body.doc.updatedAt })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Storage error' }, { status: 500 })
  }
}
