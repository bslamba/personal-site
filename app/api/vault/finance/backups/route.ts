// ============================================================
// app/api/vault/finance/backups/route.ts
//
// GET  — the days that can be restored to, newest first. SUPER ONLY.
// POST — restore one of them. SUPER ONLY.
//
// A restore rolls back the SHARED picture and carries today's private and
// already-transacted records across it (see restoreMerge). The state as it
// stood immediately before the restore is copied aside first, so the restore
// is itself undoable, and the whole thing is written to the audit log where
// every profile can see it.
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { CopyObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSession, VAULT_COOKIE } from '@/lib/vault-auth'
import { s3 } from '@/lib/storage'
import { migrate, restoreMerge, restoreSummary, uid, type FinanceDoc } from '@/lib/finance-data'
import { readRaw, writeDoc, viewFor, BACKUP_PREFIX, BACKUP_DAYS, istDay } from '../route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = process.env.S3_BUCKET!
const LIVE = '_finance/data.json'
const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.json$/

async function readBackup(day: string): Promise<FinanceDoc | null> {
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `${BACKUP_PREFIX}${day}.json` }))
    return migrate(JSON.parse(await out.Body!.transformToString()))
  } catch { return null }
}

export async function GET() {
  const jar = await cookies()
  const session = await getSession(jar.get(VAULT_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.r !== 'super') return NextResponse.json({ error: 'Only the family admin can see backups' }, { status: 403 })
  try {
    const days: { day: string; size: number; takenAt?: string }[] = []
    let token: string | undefined
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: BACKUP_PREFIX, ContinuationToken: token }))
      for (const o of page.Contents ?? []) {
        const name = (o.Key ?? '').slice(BACKUP_PREFIX.length)
        if (!DAY_FILE.test(name)) continue          // skip pre-restore safety copies
        days.push({ day: name.slice(0, 10), size: o.Size ?? 0, takenAt: o.LastModified?.toISOString() })
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
    days.sort((a, b) => b.day.localeCompare(a.day))
    return NextResponse.json({ days, keptForDays: BACKUP_DAYS, today: istDay() })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Storage error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const jar = await cookies()
  const session = await getSession(jar.get(VAULT_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.r !== 'super') return NextResponse.json({ error: 'Only the family admin can restore a backup' }, { status: 403 })

  const body = await request.json().catch(() => null) as { day?: string; reason?: string; preview?: boolean } | null
  const day = (body?.day ?? '').trim()
  if (!DAY_FILE.test(`${day}.json`)) return NextResponse.json({ error: 'Pick a day to restore' }, { status: 400 })

  try {
    const backup = await readBackup(day)
    if (!backup) return NextResponse.json({ error: `There is no backup for ${day}.` }, { status: 404 })
    const rawNow = await readRaw()
    const current: FinanceDoc = migrate(rawNow ?? {})

    // A preview asks only what would change — it writes nothing.
    if (body?.preview) {
      return NextResponse.json({ ok: true, preview: true, day, summary: restoreSummary(backup, current) })
    }

    const reason = (body?.reason ?? '').trim()
    if (reason.length < 3) return NextResponse.json({ error: 'Say why you are restoring — everyone sees this on the sheet.' }, { status: 400 })

    // Keep the state we are about to replace, so this is undoable too.
    const safety = `${BACKUP_PREFIX}pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    try { await s3.send(new CopyObjectCommand({ Bucket: BUCKET, Key: safety, CopySource: `${BUCKET}/${LIVE}` })) } catch { /* best effort */ }

    const merged = restoreMerge(backup, current)
    // Everyone should see that this happened, so every person is a party to it.
    const parties = current.entities.filter(e => e.kind === 'person').map(e => e.id)
    merged.auditLog = [...(merged.auditLog ?? []), {
      id: uid('log'), ts: new Date().toISOString(), actor: 'super', actorName: 'Super admin',
      event: 'apply' as const,
      what: `Restored the shared sheet to ${day}`,
      reason, parties,
    }].slice(-800)
    await writeDoc(merged)

    return NextResponse.json({
      ok: true, restoredTo: day, safetyCopy: safety,
      doc: viewFor(session, merged), me: { role: session.r, entityId: session.e },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Restore failed' }, { status: 500 })
  }
}
