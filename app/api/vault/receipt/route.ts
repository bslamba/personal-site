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

function buildPrompt(categories: string[]): string {
  const cats = categories.length ? categories.join(', ') : 'Food & Groceries, Eating Out, Home & Utilities, Vehicles & Travel, Health, Shopping, Insurance & Taxes, Subscriptions, Loans & EMIs, Transfers, Other'
  return (
    'You are reading a payment screenshot from India. It may be a UPI receipt (PhonePe, Google Pay, Paytm), ' +
    'an Amazon Pay / e-commerce order confirmation, a card receipt, or a shop invoice. ' +
    'Extract the payment and classify it. Return ONLY minified JSON, no prose and no code fence:\n' +
    '{"amount": <number or null>, "date": "YYYY-MM-DD" or null, "merchant": <string or null>, "category": <string or null>, "note": <short string or null>}.\n' +
    'Rules:\n' +
    '- "amount": the rupee amount actually paid/debited (the big total, e.g. ₹785 or ₹35). Digits only, no ₹ or commas. If several numbers appear, pick the amount paid, not a balance or cashback.\n' +
    '- "date": the transaction date shown, as YYYY-MM-DD. Convert formats like "15 September 2026" or "14 Sep 2026".\n' +
    '- "merchant": who was paid or the store/brand (e.g. "MEDPLUS", "Amazon", the "Paid to" name). Clean it up; drop UPI handles and IDs.\n' +
    '- "category": choose the single best fit from EXACTLY this list: ' + cats + '. A pharmacy/medical/hospital → Health. A restaurant/cafe/food-delivery → Eating Out. Groceries/supermarket → Food & Groceries. Fuel/cab/travel → Vehicles & Travel. If unsure use "Other".\n' +
    '- "note": a short human label like the item(s) bought, if visible (e.g. "Garnier Vitamin C + 1 more"). Otherwise null.'
  )
}

export async function POST(request: Request) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ configured: false })

  const body = (await request.json().catch(() => null)) as { imageBase64?: string; mediaType?: string; categories?: string[] } | null
  const data = body?.imageBase64
  const mediaType = body?.mediaType || 'image/jpeg'
  const categories = Array.isArray(body?.categories) ? body!.categories!.filter(c => typeof c === 'string') : []
  if (!data) return NextResponse.json({ error: 'No image' }, { status: 400 })
  const PROMPT = buildPrompt(categories)

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
    // Pull the JSON object even if the model wrapped it in prose/fences.
    let cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const brace = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}')
    if (brace >= 0 && end > brace) cleaned = cleaned.slice(brace, end + 1)
    let parsed: { amount?: number | string | null; date?: string | null; merchant?: string | null; category?: string | null; note?: string | null } = {}
    try { parsed = JSON.parse(cleaned) } catch { /* leave blank */ }
    // Coerce amount from strings like "₹1,299.00".
    let amount: number | null = null
    if (typeof parsed.amount === 'number') amount = parsed.amount
    else if (typeof parsed.amount === 'string') { const n = Number(parsed.amount.replace(/[^\d.]/g, '')); amount = isNaN(n) ? null : n }
    return NextResponse.json({ configured: true, amount, date: parsed.date ?? null, merchant: parsed.merchant ?? null, category: parsed.category ?? null, note: parsed.note ?? null })
  } catch (e: unknown) {
    return NextResponse.json({ configured: true, error: e instanceof Error ? e.message : 'Reader failed' }, { status: 502 })
  }
}
