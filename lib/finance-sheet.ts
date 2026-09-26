// ============================================================
// lib/finance-sheet.ts   (server only)
//
// One month of the finance sheet as a spreadsheet — Excel (.xlsx, which
// Google Sheets and Numbers open as-is) or a flat CSV.
//
// It is always built from the view the person asking is allowed to see,
// never the whole document, so a member's sheet holds their own private
// income and savings-side rows and nobody else's.
//
// The workbook shows its working: totals, each person's share, what they
// paid against what they owe, and the common-account shortfall are Excel
// formulas over the rows, so anyone can click a cell and see how a figure
// was reached.
// ============================================================

import ExcelJS from 'exceljs'
import {
  type FinanceDoc, type Item, monthView, computeSettlement, shares, categoryOf, monthLabel, entName,
} from '@/lib/finance-data'

export interface SheetMeta {
  profileName: string          // "Bhawneet Lamba" or "Household"
  viewer: string | null        // entity id, or null for the household view
  by: string                   // who generated it
  at: Date
  final: boolean               // the closing copy of a closed month
}

const KIND: Record<Item['kind'], string> = { monthly: 'Monthly', emi: 'EMI', annual: 'Yearly', oneoff: 'One-off' }
const nameOf = (doc: FinanceDoc, id: string) => (id === 'common' ? 'Common account' : entName(doc.entities, id))
const envName = (doc: FinanceDoc, id?: string) => (doc.envelopes ?? []).find(e => e.id === (id ?? 'household'))?.name ?? 'Lamba Household'

/** Everything the sheet shows, worked out once, for both formats. */
function gather(doc: FinanceDoc, mk: string) {
  const m = monthView(doc, mk)
  const st = computeSettlement(doc, mk)
  const settle = doc.settlements?.[mk]
  // A column per person who bears any share this month, common last.
  const cols = [...new Set(m.items.flatMap(it => Object.entries(shares(it)).filter(([, f]) => f > 0.0001).map(([id]) => id)))]
    .sort((a, b) => (a === 'common' ? 1 : b === 'common' ? -1 : nameOf(doc, a).localeCompare(nameOf(doc, b))))
  const items = [...m.items].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.name.localeCompare(b.name))
  const people = [...new Set([...cols, ...items.map(i => i.paidBy)])]
  const payments = st.transfers.flatMap(tr => tr.payments.map(p => ({ tr, p })))
  const log = (doc.auditLog ?? []).filter(a => a.monthKey === mk).sort((a, b) => a.ts.localeCompare(b.ts))
  return { m, st, settle, cols, items, people, payments, log }
}

// ---------------- Excel ----------------

// One section only: Excel, Numbers and Google Sheets each add the minus sign
// themselves, and a separate negative section doubled it in some of them.
const INR = '"₹"#,##0'
const PCT = '0%'
const ACCENT = 'FF5B3FCB'
const SOFT = 'FFF1EDFC'

function header(ws: ExcelJS.Worksheet, row: number, labels: string[]) {
  const r = ws.getRow(row)
  labels.forEach((l, i) => { r.getCell(i + 1).value = l })
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  r.alignment = { vertical: 'middle' }
  labels.forEach((_, i) => { r.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } } })
  r.height = 20
}
function totalRow(ws: ExcelJS.Worksheet, row: number, last: number) {
  const r = ws.getRow(row)
  r.font = { bold: true }
  for (let c = 1; c <= last; c++) {
    r.getCell(c).border = { top: { style: 'thin', color: { argb: ACCENT } } }
    r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } }
  }
}
function title(ws: ExcelJS.Worksheet, text: string, sub: string) {
  ws.getCell('A1').value = text
  ws.getCell('A1').font = { bold: true, size: 15, color: { argb: ACCENT } }
  ws.getCell('A2').value = sub
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF5F5585' } }
}
const colL = (n: number) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }

export async function monthWorkbook(doc: FinanceDoc, mk: string, meta: SheetMeta): Promise<Buffer> {
  const g = gather(doc, mk)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Lamba Family vault'
  wb.created = meta.at
  // Excel, Numbers and Google Sheets all work every formula out on opening.
  wb.calcProperties.fullCalcOnLoad = true
  const when = monthLabel(mk)
  const status = g.settle?.closed ? `Closed${g.settle.closedAt ? ` on ${new Date(g.settle.closedAt).toLocaleDateString('en-IN')}` : ''}${g.settle.closedBy ? ` by ${g.settle.closedBy}` : ''}` : 'Open — still being edited'
  const stamp = `${meta.profileName} · generated ${meta.at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} by ${meta.by}${meta.final ? ' · FINAL (month closed)' : ''}`

  // Sheet order in the file: Summary first, but it refers to the others,
  // so they are filled in first and it is written last.
  const sum = wb.addWorksheet('Summary', { properties: { tabColor: { argb: ACCENT } } })
  const ex = wb.addWorksheet('Expenses', { views: [{ state: 'frozen', ySplit: 4 }] })
  const inc = wb.addWorksheet('Income', { views: [{ state: 'frozen', ySplit: 4 }] })
  const per = wb.addWorksheet('By person')
  const cat = wb.addWorksheet('By category')
  const se = wb.addWorksheet('Settlement')
  const hist = wb.addWorksheet('Change log')

  // ---- Expenses: every entry, with each person's share worked out ----
  title(ex, `Expenses — ${when}`, stamp)
  const shareHead = g.cols.flatMap(id => [`${nameOf(doc, id)} %`, `${nameOf(doc, id)} ₹`])
  const exHead = ['#', 'Date', 'Item', 'Category', 'Type', 'Recurring?', 'Envelope', 'Paid by', 'Amount', 'Paid', ...shareHead, 'Tags', 'Note', 'Receipt']
  header(ex, 4, exHead)
  const AMT = 9                              // column I holds the amount
  const firstShare = 11                      // K onwards: % then ₹ per person
  g.items.forEach((it, i) => {
    const r = 5 + i
    const sh = shares(it)
    const row = ex.getRow(r)
    const vals: (string | number | null)[] = [
      i + 1, it.date ?? '', it.name || 'Untitled', categoryOf(it), KIND[it.kind],
      it.src === 'template' ? (it.override ? 'Recurring · changed this month' : 'Recurring') : 'This month only',
      envName(doc, it.envelope), nameOf(doc, it.paidBy), it.amount || 0, it.paid ? 'Yes' : '',
    ]
    vals.forEach((v, c) => { row.getCell(c + 1).value = v })
    g.cols.forEach((id, j) => {
      const pc = row.getCell(firstShare + j * 2), am = row.getCell(firstShare + j * 2 + 1)
      pc.value = sh[id] ?? 0
      pc.numFmt = PCT
      // The share in rupees is a formula: amount × that person's percentage.
      am.value = { formula: `${colL(AMT - 1)}${r}*${colL(firstShare + j * 2 - 1)}${r}`, result: (it.amount || 0) * (sh[id] ?? 0) }
      am.numFmt = INR
    })
    const tail = firstShare + g.cols.length * 2
    row.getCell(tail).value = (it.tags ?? []).join(', ')
    row.getCell(tail + 1).value = it.note ?? ''
    row.getCell(tail + 2).value = it.receiptKey ? 'Attached' : ''
    row.getCell(AMT).numFmt = INR
  })
  const exLast = 4 + g.items.length
  const exTotal = exLast + 1
  ex.getCell(exTotal, 3).value = 'Total'
  ex.getCell(exTotal, AMT).value = { formula: `SUM(${colL(AMT - 1)}5:${colL(AMT - 1)}${Math.max(5, exLast)})`, result: g.items.reduce((a, it) => a + (it.amount || 0), 0) }
  ex.getCell(exTotal, AMT).numFmt = INR
  g.cols.forEach((id, j) => {
    const c = firstShare + j * 2 + 1, L = colL(c - 1)
    ex.getCell(exTotal, c).value = { formula: `SUM(${L}5:${L}${Math.max(5, exLast)})` }
    ex.getCell(exTotal, c).numFmt = INR
  })
  totalRow(ex, exTotal, exHead.length)
  ex.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, exLast), column: exHead.length } }
  ex.columns.forEach((c, i) => { c.width = [5, 11, 28, 18, 9, 22, 18, 16, 12, 6][i] ?? (i < firstShare - 1 + g.cols.length * 2 ? 13 : 22) })
  if (!g.items.length) ex.getCell(5, 3).value = 'No expenses this month.'

  // ---- Income ----
  title(inc, `Income — ${when}`, stamp)
  header(inc, 4, ['Source', 'Earned by', 'Amount', 'Recurring?'])
  g.m.income.forEach((i, n) => {
    const row = inc.getRow(5 + n)
    row.values = [i.source, nameOf(doc, i.entity), i.amount || 0, i.src === 'template' ? 'Recurring' : 'This month only']
    row.getCell(3).numFmt = INR
  })
  const incLast = 4 + g.m.income.length, incTotal = incLast + 1
  inc.getCell(incTotal, 1).value = 'Total'
  inc.getCell(incTotal, 3).value = { formula: `SUM(C5:C${Math.max(5, incLast)})`, result: g.m.income.reduce((a, i) => a + (i.amount || 0), 0) }
  inc.getCell(incTotal, 3).numFmt = INR
  totalRow(inc, incTotal, 4)
  inc.columns = [{ width: 32 }, { width: 20 }, { width: 14 }, { width: 18 }]

  // ---- By person: paid vs share, the heart of the settlement ----
  title(per, `Who paid, who owns — ${when}`, 'Paid = what left their own account. Share = their portion of every expense, including bills the common account paid (those are funded by its own income first — the Settlement tab has what actually changes hands).')
  header(per, 4, ['Person', 'Income', 'Paid', 'Share of spending', 'Paid − share'])
  g.people.forEach((id, n) => {
    const r = 5 + n, nm = nameOf(doc, id)
    const row = per.getRow(r)
    row.getCell(1).value = nm
    row.getCell(2).value = { formula: `SUMIF(Income!B:B,A${r},Income!C:C)` }
    row.getCell(3).value = { formula: `SUMIF(Expenses!H:H,A${r},Expenses!I:I)` }
    const j = g.cols.indexOf(id)
    row.getCell(4).value = j >= 0 ? { formula: `Expenses!${colL(firstShare + j * 2)}${exTotal}` } : 0
    row.getCell(5).value = { formula: `C${r}-D${r}` }
    ;[2, 3, 4, 5].forEach(c => { row.getCell(c).numFmt = INR })
  })
  per.columns = [{ width: 22 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 14 }]

  // ---- By category ----
  title(cat, `Spending by category — ${when}`, stamp)
  header(cat, 4, ['Category', 'Amount', 'Of total'])
  const cats = [...new Set(g.items.map(categoryOf))].sort()
  cats.forEach((c, n) => {
    const r = 5 + n
    cat.getCell(r, 1).value = c
    cat.getCell(r, 2).value = { formula: `SUMIF(Expenses!D:D,A${r},Expenses!I:I)` }
    cat.getCell(r, 2).numFmt = INR
    cat.getCell(r, 3).value = { formula: `IF(Expenses!I${exTotal}=0,0,B${r}/Expenses!I${exTotal})` }
    cat.getCell(r, 3).numFmt = PCT
  })
  cat.getCell(5 + cats.length, 1).value = 'Total'
  cat.getCell(5 + cats.length, 2).value = { formula: `SUM(B5:B${Math.max(5, 4 + cats.length)})` }
  cat.getCell(5 + cats.length, 2).numFmt = INR
  totalRow(cat, 5 + cats.length, 3)
  cat.columns = [{ width: 24 }, { width: 14 }, { width: 10 }]

  // ---- Settlement: the common account's working, then who pays whom ----
  title(se, `Settlement — ${when}`, `Status: ${status}`)
  let r = 4
  const put = (label: string, value: ExcelJS.CellValue, fmt = INR, bold = false) => {
    se.getCell(r, 1).value = label
    se.getCell(r, 2).value = value
    se.getCell(r, 2).numFmt = fmt
    if (bold) { se.getRow(r).font = { bold: true } }
    r++
  }
  se.getCell(r, 1).value = 'The common account'; se.getCell(r, 1).font = { bold: true, color: { argb: ACCENT } }; r++
  const rInc = r; put('Common income this month', g.st.commonIncome)
  const rCarry = r; put('Surplus carried in from last month', g.st.carryIn)
  const rExp = r; put('Bills paid from the common account', { formula: `SUMIF(Expenses!H:H,"Common account",Expenses!I:I)`, result: g.st.commonExpenses })
  const rShort = r; put('Shortfall = bills − income − carried in (never below 0)', { formula: `MAX(0,B${rExp}-B${rInc}-B${rCarry})`, result: g.st.shortfall }, INR, true)
  const rN = r; put('Earners who fund a shortfall', g.st.contributors.length, '0')
  put('Each earner tops up', { formula: `IF(B${rN}=0,0,B${rShort}/B${rN})`, result: g.st.perContributor }, INR, true)
  if (g.st.contributors.length) { se.getCell(r, 1).value = `Earners: ${g.st.contributors.map(c => nameOf(doc, c)).join(', ')}`; se.getCell(r, 1).font = { italic: true }; r++ }
  r++

  se.getCell(r, 1).value = 'Who pays whom'; se.getCell(r, 1).font = { bold: true, color: { argb: ACCENT } }; r++
  header(se, r, ['Kind', 'From', 'To', 'Amount', 'Paid so far', 'Still due', 'Arose in', 'Note']); r++
  const trFirst = r
  for (const tr of g.st.transfers) {
    const row = se.getRow(r)
    row.values = [
      tr.kind === 'common' ? 'Common shortfall' : tr.kind === 'peer' ? 'Shared expense' : 'Carried forward',
      nameOf(doc, tr.from), nameOf(doc, tr.to), tr.amount, tr.settled, null, tr.fromMonth ? monthLabel(tr.fromMonth) : when, tr.note ?? '',
    ]
    row.getCell(6).value = { formula: `MAX(0,D${r}-E${r})`, result: tr.due }
    ;[4, 5, 6].forEach(c => { row.getCell(c).numFmt = INR })
    r++
  }
  if (!g.st.transfers.length) { se.getCell(r, 1).value = 'Nobody owes anybody this month.'; r++ }
  else {
    se.getCell(r, 1).value = 'Total'
    ;['D', 'E', 'F'].forEach((L, i) => { se.getCell(r, 4 + i).value = { formula: `SUM(${L}${trFirst}:${L}${r - 1})` }; se.getCell(r, 4 + i).numFmt = INR })
    totalRow(se, r, 8); r++
  }
  r++

  se.getCell(r, 1).value = 'Payments recorded'; se.getCell(r, 1).font = { bold: true, color: { argb: ACCENT } }; r++
  header(se, r, ['From', 'To', 'Amount', 'Paid on', 'Recorded by', 'Proof']); r++
  for (const { tr, p } of g.payments) {
    const row = se.getRow(r)
    row.values = [nameOf(doc, tr.from), nameOf(doc, tr.to), p.amount, p.at ? new Date(p.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '', p.by, p.proofKey ? 'Screenshot attached' : '']
    row.getCell(3).numFmt = INR
    r++
  }
  if (!g.payments.length) { se.getCell(r, 1).value = 'No payments recorded yet.'; r++ }
  r++

  se.getCell(r, 1).value = 'The working, person by person (+ owed to them, − they owe)'; se.getCell(r, 1).font = { bold: true, color: { argb: ACCENT } }; r++
  header(se, r, ['Person', 'Line', 'Amount']); r++
  for (const [id, lines] of Object.entries(g.st.ledger)) {
    const start = r
    for (const l of lines) { se.getRow(r).values = [nameOf(doc, id), l.label, l.amount]; se.getCell(r, 3).numFmt = INR; r++ }
    se.getCell(r, 1).value = nameOf(doc, id); se.getCell(r, 2).value = 'Net'
    se.getCell(r, 3).value = { formula: `SUM(C${start}:C${r - 1})`, result: g.st.net[id] ?? 0 }; se.getCell(r, 3).numFmt = INR
    totalRow(se, r, 3); r++
  }
  se.columns = [{ width: 44 }, { width: 44 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 28 }]

  // ---- History: every change made to this month ----
  title(hist, `History — ${when}`, 'Every change recorded against this month, oldest first.')
  header(hist, 4, ['When', 'Who', 'On behalf of', 'Action', 'What', 'Reason'])
  g.log.forEach((a, n) => {
    hist.getRow(5 + n).values = [new Date(a.ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), a.actorName, a.onBehalfName ?? '', a.event, a.what, a.reason ?? '']
  })
  if (!g.log.length) hist.getCell(5, 1).value = 'No changes recorded for this month.'
  hist.columns = [{ width: 22 }, { width: 18 }, { width: 18 }, { width: 10 }, { width: 50 }, { width: 40 }]

  // ---- Summary (first tab) ----
  title(sum, `Lamba Family — ${when}`, stamp)
  sum.getCell('A3').value = `Status: ${status}`
  sum.getCell('A3').font = { bold: true, color: { argb: g.settle?.closed ? 'FF11764E' : 'FFA8500A' } }
  header(sum, 5, ['Figure', 'Amount', 'How it is worked out'])
  const lines: [string, ExcelJS.CellValue, string][] = [
    ['Total income', { formula: `Income!C${incTotal}` }, 'Sum of the Income tab'],
    ['Total spending', { formula: `Expenses!I${exTotal}` }, 'Sum of the Expenses tab'],
    ['Left over', { formula: 'B6-B7' }, 'Income − spending'],
    ['Common account shortfall', { formula: `Settlement!B${rShort}` }, 'See the Settlement tab'],
    ['Still owed between people', g.st.transfers.length ? { formula: `Settlement!F${trFirst + g.st.transfers.length}` } : 0, 'Transfers not yet paid'],
  ]
  if (meta.viewer) {
    const j = g.cols.indexOf(meta.viewer)
    lines.push(
      [`${meta.profileName}: share of spending`, j >= 0 ? { formula: `Expenses!${colL(firstShare + j * 2)}${exTotal}` } : 0, 'Their column on the Expenses tab'],
      [`${meta.profileName}: net in the settlement`, g.st.net[meta.viewer] ?? 0, '+ owed to them, − they owe'],
    )
  }
  lines.forEach(([l, v, how], n) => {
    const row = sum.getRow(6 + n)
    row.getCell(1).value = l
    row.getCell(2).value = v
    row.getCell(2).numFmt = INR
    row.getCell(3).value = how
    row.getCell(3).font = { italic: true, color: { argb: 'FF5F5585' } }
  })
  sum.getCell(7 + lines.length, 1).value = 'Tabs: Expenses · Income · By person · By category · Settlement · Change log'
  sum.getCell(7 + lines.length, 1).font = { italic: true, color: { argb: 'FF5F5585' } }
  sum.columns = [{ width: 40 }, { width: 16 }, { width: 36 }]

  return Buffer.from(await wb.xlsx.writeBuffer())
}

// ---------------- CSV ----------------

const q = (v: unknown) => {
  const s = v == null ? '' : typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** A single CSV with each part as its own titled block — CSV cannot hold tabs. */
export function monthCsv(doc: FinanceDoc, mk: string, meta: SheetMeta): string {
  const g = gather(doc, mk)
  const out: unknown[][] = []
  const block = (name: string) => { if (out.length) out.push([]); out.push([`## ${name}`]) }
  out.push([`Lamba Family — ${monthLabel(mk)}`, meta.profileName, `generated ${meta.at.toISOString()} by ${meta.by}`, g.settle?.closed ? 'CLOSED' : 'OPEN'])
  block('EXPENSES')
  out.push(['Date', 'Item', 'Category', 'Type', 'Envelope', 'Paid by', 'Amount', 'Paid', ...g.cols.flatMap(id => [`${nameOf(doc, id)} %`, `${nameOf(doc, id)} ₹`]), 'Tags', 'Note'])
  for (const it of g.items) {
    const sh = shares(it)
    out.push([it.date ?? '', it.name, categoryOf(it), KIND[it.kind], envName(doc, it.envelope), nameOf(doc, it.paidBy), it.amount || 0, it.paid ? 'Yes' : '',
      ...g.cols.flatMap(id => [Math.round((sh[id] ?? 0) * 100) + '%', (it.amount || 0) * (sh[id] ?? 0)]), (it.tags ?? []).join('; '), it.note ?? ''])
  }
  out.push(['', 'Total', '', '', '', '', g.items.reduce((a, it) => a + (it.amount || 0), 0)])
  block('INCOME')
  out.push(['Source', 'Earned by', 'Amount'])
  for (const i of g.m.income) out.push([i.source, nameOf(doc, i.entity), i.amount || 0])
  out.push(['Total', '', g.m.income.reduce((a, i) => a + (i.amount || 0), 0)])
  block('COMMON ACCOUNT')
  out.push(['Income', g.st.commonIncome], ['Carried in', g.st.carryIn], ['Bills paid from it', g.st.commonExpenses], ['Shortfall', g.st.shortfall], ['Each earner tops up', g.st.perContributor])
  block('WHO PAYS WHOM')
  out.push(['Kind', 'From', 'To', 'Amount', 'Paid so far', 'Still due', 'Arose in'])
  for (const tr of g.st.transfers) out.push([tr.kind, nameOf(doc, tr.from), nameOf(doc, tr.to), tr.amount, tr.settled, tr.due, tr.fromMonth ?? mk])
  block('PAYMENTS')
  out.push(['From', 'To', 'Amount', 'Paid on', 'Recorded by', 'Proof'])
  for (const { tr, p } of g.payments) out.push([nameOf(doc, tr.from), nameOf(doc, tr.to), p.amount, p.at, p.by, p.proofKey ? 'yes' : ''])
  block('WORKING PER PERSON')
  out.push(['Person', 'Line', 'Amount'])
  for (const [id, lines] of Object.entries(g.st.ledger)) { for (const l of lines) out.push([nameOf(doc, id), l.label, l.amount]); out.push([nameOf(doc, id), 'Net', g.st.net[id] ?? 0]) }
  block('HISTORY')
  out.push(['When', 'Who', 'On behalf of', 'Action', 'What', 'Reason'])
  for (const a of g.log) out.push([a.ts, a.actorName, a.onBehalfName ?? '', a.event, a.what, a.reason ?? ''])
  // A byte-order mark so Excel reads the ₹ and names correctly.
  return '﻿' + out.map(r => r.map(q).join(',')).join('\r\n')
}
