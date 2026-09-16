// ============================================================
// lib/finance-data.ts
//
// Types, the seed template (taken from the Monthly Expense
// workbook), and pure helpers shared by the finance API and the
// dashboard. No side effects here — storage lives in the API.
//
// Model in one breath: a TEMPLATE of recurring things (monthly
// items, EMIs with real start/end dates, annually-recurring items,
// and recurring income). Each month is MATERIALISED from that
// template the first time it is opened — EMIs that have ended drop
// out on their own — and then saved as its own editable snapshot,
// so history never rewrites itself when the template changes.
// ============================================================

export const PEOPLE = ['Bhawneet', 'Gurneet'] as const
export type Person = (typeof PEOPLE)[number]

export type Account =
  | 'Common Bank Account'
  | "Gurneet's Bank Account"
  | "Bhawneet's Bank Account"
  | "Papa's Bank Account"

export type Kind = 'monthly' | 'emi' | 'annual'

// One line of spend. `shareB` is Bhawneet's fraction (0..1); Gurneet
// carries the rest. `amount` is the monthly figure for monthly/emi,
// and the full annual figure for `annual` (shown only in its due
// month). Settlement (who-owes-whom) only fires when the paying
// account is a personal one — exactly as the workbook does it.
export interface Item {
  id: string
  name: string
  owner: string
  account: Account
  amount: number
  shareB: number
  kind: Kind
  startDate?: string | null   // emi: YYYY-MM-DD
  endDate?: string | null     // emi: YYYY-MM-DD (null = open-ended)
  dueDate?: string | null     // annual: YYYY-MM-DD (month-of-year is what matters)
  principal?: number | null
  tenure?: number | null      // months
  paid?: boolean              // per-month flag
  note?: string
}

export interface IncomeItem {
  id: string
  source: string
  person: Person | 'Common'
  amount: number
}

export interface MonthData {
  items: Item[]
  income: IncomeItem[]
  note?: string
}

export interface Template {
  monthly: Item[]
  emis: Item[]
  annual: Item[]
  income: IncomeItem[]
}

export interface FinanceDoc {
  version: 1
  people: string[]
  template: Template
  months: Record<string, MonthData>   // key: YYYY-MM
  updatedAt: string
}

let _n = 0
const uid = (p: string) => `${p}_${(_n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

function mk(
  kind: Kind,
  name: string,
  owner: string,
  account: Account,
  amount: number,
  extra: Partial<Item> = {}
): Item {
  return { id: uid(kind), name, owner, account, amount, shareB: 0.5, kind, ...extra }
}

// ----- Seed template, straight from the workbook ----------------
export function seedTemplate(): Template {
  const C: Account = 'Common Bank Account'
  const G: Account = "Gurneet's Bank Account"
  const B: Account = "Bhawneet's Bank Account"
  const P: Account = "Papa's Bank Account"

  const monthly: Item[] = [
    mk('monthly', 'Flat Maintainance', 'Gurneet', C, 3900),
    mk('monthly', 'House Electricity', 'Bhawneet', C, 6000),
    mk('monthly', 'House Rashan', 'Gurneet', C, 11000),
    mk('monthly', 'Milk Basket', 'Gurneet', C, 8000),
    mk('monthly', 'House Fruits & Vegetables', 'Bhawneet', C, 5000),
    mk('monthly', 'House Maid', 'Papa', C, 4000),
    mk('monthly', 'Cook', 'Gurneet', C, 4000),
    mk('monthly', 'Car Fuel', 'Mutual', C, 5000),
    mk('monthly', 'Parking Rent', 'Gurneet', C, 1500),
    mk('monthly', 'Car Cleaning', 'Gurneet', C, 1300),
    mk('monthly', 'Internet', 'Bhawneet', C, 1200),
    mk('monthly', 'Cylinder', 'Bhawneet', C, 950),
    mk('monthly', 'Netflix', 'Gurneet', C, 200),
    mk('monthly', 'Canara Interest', 'Papa', P, 5000),
  ]

  const emis: Item[] = [
    mk('emi', 'Axis Home Loan', 'Gurneet', G, 62815, { principal: 8250000, tenure: 276, startDate: '2026-05-10', endDate: '2049-04-10' }),
    mk('emi', 'Axis Home Loan (2)', 'Gurneet', G, 21080, { principal: 2500000, tenure: 240, startDate: '2026-05-10', endDate: '2046-04-10' }),
    mk('emi', 'Axis Home Loan (3)', 'Gurneet', G, 14915, { startDate: '2026-07-10', endDate: '2046-06-10' }),
    mk('emi', 'SBI Home Loan', 'Bhawneet', B, 57700, { principal: 7200000, tenure: 360, startDate: '2023-02-10', endDate: '2053-01-10' }),
    mk('emi', 'Astor Car Loan', 'Bhawneet', B, 32725, { principal: 1559997, tenure: 60, startDate: '2024-09-05', endDate: '2029-08-05' }),
    mk('emi', 'Ertiga Top Up', 'Bhawneet', B, 25506, { principal: 1530360, tenure: 60, startDate: '2024-11-07', endDate: '2029-10-07' }),
    mk('emi', 'Royal Enfield', 'Gurneet', G, 10080, { principal: 362880, tenure: 36, startDate: '2025-06-05', endDate: '2028-05-05' }),
    mk('emi', 'Bajaj PL', 'Bhawneet', B, 16182, { principal: 776736, tenure: 48, startDate: '2023-05-02', endDate: '2027-04-02' }),
    mk('emi', 'Apple Laptop', 'Bhawneet', B, 4152, { principal: 99655, tenure: 24, startDate: '2024-09-02', endDate: '2026-08-02' }),
    mk('emi', 'Apple Cloud Storage', 'Gurneet', G, 749, { startDate: '2026-05-10', endDate: null }),
  ]

  const annual: Item[] = [
    mk('annual', 'Water', 'Gurneet', C, 8000, { dueDate: '2026-05-06' }),
    mk('annual', 'Bike Insurance', 'Gurneet', C, 1100, { dueDate: '2026-05-04' }),
    mk('annual', 'Astor Insurance', 'Gurneet', C, 20000, { dueDate: '2026-07-04' }),
    mk('annual', 'Ertiga Insurance', 'Gurneet', C, 20000, { dueDate: '2026-10-04' }),
    mk('annual', 'Parents Health Insurance', 'Bhawneet & Gurneet', C, 40000, { dueDate: '2026-03-01' }),
    mk('annual', 'Pavani Property Tax', 'Gurneet', C, 5000, { dueDate: '2026-12-31' }),
    mk('annual', 'Harsha Property Tax', 'Gurneet', C, 5000, { dueDate: '2026-12-31' }),
    mk('annual', 'Astor Service', 'Bhawneet & Gurneet', C, 10000, { dueDate: '2026-11-15' }),
    mk('annual', 'Ertiga Service', 'Bhawneet & Gurneet', C, 10000, { dueDate: '2026-12-15' }),
    mk('annual', 'Bike Service', 'Bhawneet & Gurneet', C, 3000, { dueDate: '2026-05-31' }),
    mk('annual', 'Milk Basket - Yearly Subscription', 'Bhawneet & Gurneet', C, 849, { dueDate: '2026-05-10' }),
  ]

  const income: IncomeItem[] = [
    { id: uid('inc'), source: 'Rental Income', person: 'Common', amount: 48000 },
  ]

  return { monthly, emis, annual, income }
}

export function seedDoc(): FinanceDoc {
  return {
    version: 1,
    people: [...PEOPLE],
    template: seedTemplate(),
    months: {},
    updatedAt: new Date().toISOString(),
  }
}

// ----- Month helpers --------------------------------------------
export const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** Is an EMI live during the given YYYY-MM? */
export function emiActive(it: Item, key: string): boolean {
  const first = `${key}-01`
  const last = `${key}-31`
  if (it.startDate && it.startDate > last) return false
  if (it.endDate && it.endDate < first) return false
  return true
}

/** Build a fresh month snapshot from the template. */
export function materialise(template: Template, key: string): MonthData {
  const mm = key.slice(5, 7)
  const items: Item[] = [
    ...template.monthly.map(clone),
    ...template.emis.filter(e => emiActive(e, key)).map(clone),
    ...template.annual.filter(a => (a.dueDate ?? '').slice(5, 7) === mm).map(clone),
  ]
  return { items, income: template.income.map(i => ({ ...i, id: uid('inc') })), note: '' }
}

const clone = (it: Item): Item => ({ ...it, id: uid(it.kind), paid: false })

/** Read a month if saved, otherwise materialise it (read-only preview). */
export function monthView(doc: FinanceDoc, key: string): MonthData {
  return doc.months[key] ?? materialise(doc.template, key)
}

// ----- Money maths ----------------------------------------------
export interface MonthTotals {
  income: number
  expense: number
  net: number
  bShare: number
  gShare: number
  // settlement: positive => Gurneet owes Bhawneet; negative => Bhawneet owes Gurneet
  settle: number
}

export function totals(m: MonthData): MonthTotals {
  let income = 0
  for (const i of m.income) income += i.amount

  let expense = 0
  let bShare = 0
  let gShare = 0
  let settle = 0

  for (const it of m.items) {
    const amt = it.amount || 0
    expense += amt
    const b = amt * clamp01(it.shareB)
    const g = amt - b
    bShare += b
    gShare += g
    // Only personal-account payments create a debt between the two.
    if (it.account === "Bhawneet's Bank Account") settle += g       // Gurneet owes Bhawneet her share
    else if (it.account === "Gurneet's Bank Account") settle -= b    // Bhawneet owes Gurneet his share
  }

  return { income, expense, net: income - expense, bShare, gShare, settle }
}

export const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5))

/** Group items into named buckets for the category chart. */
export function byCategory(m: MonthData): { name: string; value: number }[] {
  const map = new Map<string, number>()
  for (const it of m.items) {
    const key = bucket(it.name, it.kind)
    map.set(key, (map.get(key) ?? 0) + (it.amount || 0))
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value)
}

function bucket(name: string, kind: Kind): string {
  if (kind === 'emi') return 'Loans & EMIs'
  const n = name.toLowerCase()
  if (/(rashan|milk|fruit|vegetable|cook|zomato|swiggy|zepto|grocery)/.test(n)) return 'Food & Groceries'
  if (/(car|fuel|parking|astor|ertiga|bike|fastag|petrol)/.test(n)) return 'Vehicles & Travel'
  if (/(electric|water|cylinder|internet|maid|maintain|maintainance|maintenance|gas)/.test(n)) return 'Home & Utilities'
  if (/(insurance|health|tax|service)/.test(n)) return 'Insurance & Taxes'
  if (/(netflix|prime|spotify|subscription|cloud)/.test(n)) return 'Subscriptions'
  return 'Other'
}

export const INR = (n: number) =>
  '₹' + Math.round(n).toLocaleString('en-IN')

export const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}
