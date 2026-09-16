// ============================================================
// app/api/vault/receipt/route.ts
//
// Read a UPI receipt / invoice image and pull out the amount,
// date and merchant so the expense form can be pre-filled. Uses a
// vision model IF a key is configured (ANTHROPIC_API_KEY); with no
// key it returns { configured: false } and the UI just opens a
// blank form — the feature degrades to manual entry, never breaks.
//
// The image bytes are sent straight to the model and not stored by
// this route (the client uploads the picture to S3 separately if it
// wants to keep it). Guarded by the vault session.
// ============================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySession, VAULT_COOKIE } from '@/lib/vault-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODEL = process.env.RECEIPT_MODEL || 'claude-3-5-haiku-latest'

async function guard(): Promise<boolean> {
  const jar = await cookies()
  return verifySession(jar.get(VAULT_COOKIE)?.value)
}

const PROMPT =
  'This is an Indian UPI payment receipt or an invoice. Extract the payment details. ' +
  'Return ONLY minified JSON, no prose, no code fence: ' +
  '{"amount": <number or null>, "date": "YYYY-MM-DD" or null, "merchant": <string or null>, "note": <short string or null>}. ' +
  '"amount" is the rupee amount that was paid (the total debited). If several numbers appear, choose the amount paid.'

export async function POST(request: Request) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ configured: false })

  const body = (await request.json().catch(() => null)) as { imageBase64?: string; mediaType?: string } | null
  const data = body?.imageBase64
  const mediaType = body?.mediaType || 'image/jpeg'
  if (!data) return NextResponse.json({ error: 'No image' }, { status: 400 })

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return NextResponse.json({ configured: true, error: `Reader error (${res.status})`, detail: t.slice(0, 200) }, { status: 502 })
    }
    const json = await res.json() as { content?: { type: string; text?: string }[] }
    const text = (json.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('').trim()
    const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    let parsed: { amount?: number | null; date?: string | null; merchant?: string | null; note?: string | null } = {}
    try { parsed = JSON.parse(cleaned) } catch { /* leave blank */ }
    return NextResponse.json({ configured: true, ...parsed })
  } catch (e: unknown) {
    return NextResponse.json({ configured: true, error: e instanceof Error ? e.message : 'Reader failed' }, { status: 502 })
  }
}
