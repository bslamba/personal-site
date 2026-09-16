// ============================================================
// lib/statement.ts
//
// Parse a bank-statement CSV (Axis / most Indian banks) into rows
// the finance page can import. We do NOT trust the DR/CR column
// labels — different banks order them differently — so direction
// (money in vs out) is decided from the running BALANCE, which is
// unambiguous. Each row gets a cleaned payee and a guessed category
// that the user can edit before importing.
// ============================================================

import { cleanPayee, detectCategory } from '@/lib/finance-data'

export interface StatementRow {
  id: string
  date: string          // YYYY-MM-DD
  desc: string          // raw particulars
  payee: string
  amount: number
  type: 'debit' | 'credit'
  category: string
  note: string
  include: boolean
  ref: string
  dup?: boolean
}

/** Stable fingerprint of a transaction: date + amount + normalised
    description (which carries the bank's unique UPI/IMPS/NEFT ref). */
export function refOf(date: string, amount: number, desc: string): string {
  const key = `${date}|${Math.round(amount * 100)}|${(desc || '').replace(/\s+/g, ' ').trim().toUpperCase()}`
  let h = 5381
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0
  return 'x' + (h >>> 0).toString(36)
}

function toISO(d: string): string {
  const m = (d || '').trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/)
  if (!m) return ''
  let yy = m[3]
  if (yy.length === 2) yy = '20' + yy
  return `${yy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}
function pnum(s: string): number { const n = parseFloat((s || '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : NaN }

export function parseStatement(text: string): StatementRow[] {
  const lines = text.split(/\r?\n/)
  let hi = lines.findIndex(l => /tran\s*date|txn\s*date|\bdate\b/i.test(l) && /particular|narration|description|remark/i.test(l))
  if (hi < 0) hi = lines.findIndex(l => /particular|narration|description/i.test(l))
  if (hi < 0) hi = 0
  const header = lines[hi].split(',').map(h => h.trim().toLowerCase())
  const idx = (names: string[]) => header.findIndex(h => names.some(n => h.includes(n)))
  const iDate = Math.max(0, idx(['tran date', 'txn date', 'date']))
  const iPart = idx(['particular', 'narration', 'description', 'remark'])
  const iDr = idx(['dr', 'debit', 'withdrawal'])
  const iCr = idx(['cr', 'credit', 'deposit'])
  const iBal = idx(['balance', 'bal'])

  interface Raw { date: string; desc: string; a: number | null; b: number | null; bal: number | null }
  const raws: Raw[] = []
  for (let i = hi + 1; i < lines.length; i++) {
    const ln = lines[i]
    if (!ln.trim()) continue
    const cols = ln.split(',')
    const date = toISO(cols[iDate] ?? '')
    if (!date) continue
    const a = iDr >= 0 ? pnum(cols[iDr]) : NaN
    const b = iCr >= 0 ? pnum(cols[iCr]) : NaN
    const bal = iBal >= 0 ? pnum(cols[iBal]) : NaN
    raws.push({ date, desc: (cols[iPart] ?? '').trim(), a: Number.isFinite(a) ? a : null, b: Number.isFinite(b) ? b : null, bal: Number.isFinite(bal) ? bal : null })
  }

  // Decide which amount column is a credit, from balance movement.
  let aCredit = 0, aDebit = 0
  for (let i = 1; i < raws.length; i++) {
    const r = raws[i], p = raws[i - 1]
    if (r.bal == null || p.bal == null) continue
    const up = r.bal - p.bal > 0
    const inA = r.a != null && r.a > 0
    const inB = r.b != null && r.b > 0
    if (inA && !inB) { up ? aCredit++ : aDebit++ }
    else if (inB && !inA) { up ? aDebit++ : aCredit++ }
  }
  const aIsCredit = aCredit >= aDebit

  return raws.map((r, i) => {
    const inA = r.a != null && r.a > 0
    const amount = inA ? (r.a as number) : (r.b ?? 0)
    const type: 'debit' | 'credit' = inA ? (aIsCredit ? 'credit' : 'debit') : (aIsCredit ? 'debit' : 'credit')
    const payee = cleanPayee(r.desc) || r.desc
    const amt = Math.abs(amount)
    return { id: 'st_' + i, date: r.date, desc: r.desc, payee, amount: amt, type, category: detectCategory(payee + ' ' + r.desc), note: '', include: true, ref: refOf(r.date, amt, r.desc) }
  }).filter(r => r.amount > 0)
}
