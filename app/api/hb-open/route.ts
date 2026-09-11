// ============================================================
// app/api/hb-open/route.ts
//
// POST — count one open. The page calls this, fire-and-forget, the
// moment the secret opens the surprise. It stores a number and a
// timestamp, nothing about the visitor.
// ============================================================

import { NextResponse } from 'next/server'
import { recordOpen } from '@/lib/opens'

// Never prerendered or cached — it writes on every call.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  await recordOpen()
  // No body worth returning; the client does not read it.
  return new NextResponse(null, { status: 204 })
}
