// ============================================================
// lib/finance-data.ts   (v2)
//
// A small household-finance engine. The big idea: everything is an
// ENTITY (a person, or the shared "Common" pool). Every expense
// records who PAID it and how the cost is ALLOCATED — split across
// entities by percentage, or borne 100% by one. From that we derive
// budgets, per-category breakdowns, and a "who owes whom" settlement.
//
// A TEMPLATE of recurring things (monthly items, EMIs with real
// start/end dates, yearly items, recurring income) seeds each new
// month; opened months are saved as their own editable snapshots so
// history never rewrites itself. Savings are tracked separately.
//
// v1 docs (fixed Bhawneet/Gurneet + shareB) are migrated on load.
// ============================================================

export type EntityKind = 'person' | 'common'

export interface Entity {
  id: string
  name: string
  kind: EntityKind
  canPay: boolean        // has an account → can be the payer of an expense
  earning: boolean       // brings in income
  isLiability: boolean   // a dependent / liability, tracked but not earning
  color: string
}

// How an expense's cost is shared.
export type Alloc =
  | { mode: 'single'; who: string }                    // 100% borne by entity `who`
  | { mode: 'split'; shares: Record<string, number> }  // fractions (≈ sum 1) by entity id

export type Kind = 'monthly' | 'emi' | 'annual' | 'oneoff'

export interface Item {
  id: string
  name: string
  amount: number         // monthly figure; for `annual`, the full yearly figure (shown in its due month)
  kind: Kind
  paidBy: string         // entity id that paid (a canPay entity)
  alloc: Alloc
  startDate?: string | null   // emi
  endDate?: string | null     // emi (null = open-ended)
  dueDate?: string | null     // annual
  principal?: number | null
  tenure?: number | null
  paid?: boolean
  note?: string
  receiptKey?: string | null
  category?: string            // explicit category name; blank = auto from the item name
  date?: string | null         // transaction date (YYYY-MM-DD), e.g. from a receipt or statement
  src?: 'template' | 'manual'   // template-derived vs manually added in a month
  ref?: string                 // stable fingerprint of an imported bank txn (for de-dup)
  tags?: string[]              // free-form event tags (e.g. "Ooty 2026"), independent of category
}

export interface IncomeItem {
  id: string
  source: string
  entity: string         // who earned it (entity id, or 'common')
  amount: number
  src?: 'template' | 'manual'
  ref?: string           // stable fingerprint of an imported bank txn (for de-dup)
}

export interface SavingItem {
  id: string
  label: string
  entity: string         // whose savings
  balance: number
  kind?: string          // FD, MF, RD, cash, gold…
  note?: string
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
  version: 2
  entities: Entity[]
  template: Template
  months: Record<string, MonthData>
  savings: SavingItem[]
  categories: Category[]
  proposals: Proposal[]
  budgets: Budgets
  updatedAt: string
}

// ----- ids ------------------------------------------------------
let _n = 0
export const uid = (p: string) =>
  `${p}_${(_n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const ENTITY_COLORS = ['#4b7bec', '#b0479a', '#1f9d6b', '#e8963a', '#6d4bd8', '#5bc0d0', '#e2445c', '#8b81ad']

// ----- default entities ----------------------------------------
export function seedEntities(): Entity[] {
  return [
    { id: 'bhawneet', name: 'Bhawneet', kind: 'person', canPay: true, earning: true, isLiability: false, color: '#4b7bec' },
    { id: 'gurneet', name: 'Gurneet', kind: 'person', canPay: true, earning: true, isLiability: false, color: '#b0479a' },
    { id: 'common', name: 'Common', kind: 'common', canPay: true, earning: false, isLiability: false, color: '#6d4bd8' },
    { id: 'papa', name: 'Papa', kind: 'person', canPay: true, earning: false, isLiability: false, color: '#1f9d6b' },
  ]
}

const half = (): Alloc => ({ mode: 'split', shares: { bhawneet: 0.5, gurneet: 0.5 } })

function mk(kind: Kind, name: string, paidBy: string, amount: number, alloc: Alloc, extra: Partial<Item> = {}): Item {
  return { id: uid(kind), name, amount, kind, paidBy, alloc, ...extra }
}

export interface Category { name: string; color: string }

export function seedCategories(): Category[] {
  return [
    { name: 'Food & Groceries', color: '#1f9d6b' },
    { name: 'Home & Utilities', color: '#4b7bec' },
    { name: 'Vehicles & Travel', color: '#e8963a' },
    { name: 'Insurance & Taxes', color: '#b0479a' },
    { name: 'Eating Out', color: '#e07a3a' },
    { name: 'Health', color: '#2fb08a' },
    { name: 'Shopping', color: '#c264d0' },
    { name: 'Subscriptions', color: '#5bc0d0' },
    { name: 'Loans & EMIs', color: '#6d4bd8' },
    { name: 'Transfers', color: '#8593a8' },
    { name: 'Other', color: '#9b93b8' },
  ]
}

export function seedTemplate(): Template {
  const monthly: Item[] = [
    mk('monthly', 'Flat Maintainance', 'common', 3900, half()),
    mk('monthly', 'House Electricity', 'common', 6000, half()),
    mk('monthly', 'House Rashan', 'common', 11000, half()),
    mk('monthly', 'Milk Basket', 'common', 8000, half()),
    mk('monthly', 'House Fruits & Vegetables', 'common', 5000, half()),
    mk('monthly', 'House Maid', 'common', 4000, half()),
    mk('monthly', 'Cook', 'common', 4000, half()),
    mk('monthly', 'Car Fuel', 'common', 5000, half()),
    mk('monthly', 'Parking Rent', 'common', 1500, half()),
    mk('monthly', 'Car Cleaning', 'common', 1300, half()),
    mk('monthly', 'Internet', 'common', 1200, half()),
    mk('monthly', 'Cylinder', 'common', 950, half()),
    mk('monthly', 'Netflix', 'common', 200, half()),
    mk('monthly', 'Canara Interest', 'papa', 5000, { mode: 'single', who: 'papa' }),
  ]
  const emis: Item[] = [
    mk('emi', 'Axis Home Loan', 'gurneet', 62815, half(), { principal: 8250000, tenure: 276, startDate: '2026-05-10', endDate: '2049-04-10' }),
    mk('emi', 'Axis Home Loan (2)', 'gurneet', 21080, half(), { principal: 2500000, tenure: 240, startDate: '2026-05-10', endDate: '2046-04-10' }),
    mk('emi', 'Axis Home Loan (3)', 'gurneet', 14915, half(), { startDate: '2026-07-10', endDate: '2046-06-10' }),
    mk('emi', 'SBI Home Loan', 'bhawneet', 57700, half(), { principal: 7200000, tenure: 360, startDate: '2023-02-10', endDate: '2053-01-10' }),
    mk('emi', 'Astor Car Loan', 'bhawneet', 32725, half(), { principal: 1559997, tenure: 60, startDate: '2024-09-05', endDate: '2029-08-05' }),
    mk('emi', 'Ertiga Top Up', 'bhawneet', 25506, half(), { principal: 1530360, tenure: 60, startDate: '2024-11-07', endDate: '2029-10-07' }),
    mk('emi', 'Royal Enfield', 'gurneet', 10080, half(), { principal: 362880, tenure: 36, startDate: '2025-06-05', endDate: '2028-05-05' }),
    mk('emi', 'Bajaj PL', 'bhawneet', 16182, half(), { principal: 776736, tenure: 48, startDate: '2023-05-02', endDate: '2027-04-02' }),
    mk('emi', 'Apple Laptop', 'bhawneet', 4152, half(), { principal: 99655, tenure: 24, startDate: '2024-09-02', endDate: '2026-08-02' }),
    mk('emi', 'Apple Cloud Storage', 'gurneet', 749, half(), { startDate: '2026-05-10', endDate: null }),
  ]
  const annual: Item[] = [
    mk('annual', 'Water', 'common', 8000, half(), { dueDate: '2026-05-06' }),
    mk('annual', 'Bike Insurance', 'common', 1100, half(), { dueDate: '2026-05-04' }),
    mk('annual', 'Astor Insurance', 'common', 20000, half(), { dueDate: '2026-07-04' }),
    mk('annual', 'Ertiga Insurance', 'common', 20000, half(), { dueDate: '2026-10-04' }),
    mk('annual', 'Parents Health Insurance', 'common', 40000, half(), { dueDate: '2026-03-01' }),
    mk('annual', 'Pavani Property Tax', 'common', 5000, half(), { dueDate: '2026-12-31' }),
    mk('annual', 'Harsha Property Tax', 'common', 5000, half(), { dueDate: '2026-12-31' }),
    mk('annual', 'Astor Service', 'common', 10000, half(), { dueDate: '2026-11-15' }),
    mk('annual', 'Ertiga Service', 'common', 10000, half(), { dueDate: '2026-12-15' }),
    mk('annual', 'Bike Service', 'common', 3000, half(), { dueDate: '2026-05-31' }),
    mk('annual', 'Milk Basket - Yearly Subscription', 'common', 849, half(), { dueDate: '2026-05-10' }),
  ]
  const income: IncomeItem[] = [
    { id: uid('inc'), source: 'Rental Income', entity: 'common', amount: 48000 },
  ]
  return { monthly, emis, annual, income }
}

export function seedDoc(): FinanceDoc {
  return {
    version: 2,
    entities: seedEntities(),
    template: seedTemplate(),
    months: {},
    savings: [],
    categories: seedCategories(),
    proposals: [],
    budgets: seedBudgets(),
    updatedAt: new Date().toISOString(),
  }
}

// ----- migration from v1 ----------------------------------------
const ACC_TO_ENTITY: Record<string, string> = {
  'Common Bank Account': 'common',
  "Bhawneet's Bank Account": 'bhawneet',
  "Gurneet's Bank Account": 'gurneet',
  "Papa's Bank Account": 'papa',
}

interface V1Item { id: string; name: string; owner?: string; account?: string; amount: number; shareB?: number; kind: string; startDate?: string | null; endDate?: string | null; dueDate?: string | null; principal?: number | null; tenure?: number | null; paid?: boolean; note?: string }

function v1ItemToV2(it: V1Item): Item {
  const paidBy = ACC_TO_ENTITY[it.account ?? 'Common Bank Account'] ?? 'common'
  const b = typeof it.shareB === 'number' ? Math.max(0, Math.min(1, it.shareB)) : 0.5
  const alloc: Alloc = { mode: 'split', shares: { bhawneet: b, gurneet: 1 - b } }
  const kind = (['monthly', 'emi', 'annual', 'oneoff'].includes(it.kind) ? it.kind : 'monthly') as Kind
  return {
    id: it.id ?? uid(kind), name: it.name, amount: it.amount || 0, kind, paidBy, alloc,
    startDate: it.startDate ?? null, endDate: it.endDate ?? null, dueDate: it.dueDate ?? null,
    principal: it.principal ?? null, tenure: it.tenure ?? null, paid: it.paid, note: it.note, src: kind === 'oneoff' ? 'manual' : 'template',
  }
}

/** Accepts any stored doc and returns a valid v2 doc. */
export function migrate(raw: unknown): FinanceDoc {
  if (!raw || typeof raw !== 'object') return seedDoc()
  const d = raw as Record<string, unknown>
  if (d.version === 2) {
    const doc = d as unknown as FinanceDoc
    if (!Array.isArray(doc.savings)) doc.savings = []
    if (!Array.isArray(doc.entities) || doc.entities.length === 0) doc.entities = seedEntities()
    if (!Array.isArray(doc.categories) || doc.categories.length === 0) doc.categories = seedCategories()
    if (!Array.isArray(doc.proposals)) doc.proposals = []
    if (!doc.budgets || typeof doc.budgets !== 'object') doc.budgets = seedBudgets()
    return doc
  }
  // v1 → v2
  const tpl = (d.template ?? {}) as Record<string, V1Item[]>
  const mapIncome = (arr: unknown): IncomeItem[] =>
    Array.isArray(arr) ? arr.map((i) => {
      const x = i as { id?: string; source?: string; person?: string; entity?: string; amount?: number }
      const person = (x.entity ?? x.person ?? 'common').toString().toLowerCase()
      return { id: x.id ?? uid('inc'), source: x.source ?? 'Income', entity: ['bhawneet', 'gurneet', 'papa', 'common'].includes(person) ? person : 'common', amount: x.amount ?? 0, src: 'template' }
    }) : []
  const template: Template = {
    monthly: (tpl.monthly ?? []).map(v1ItemToV2),
    emis: (tpl.emis ?? []).map(v1ItemToV2),
    annual: (tpl.annual ?? []).map(v1ItemToV2),
    income: mapIncome(tpl.income),
  }
  const months: Record<string, MonthData> = {}
  const rawMonths = (d.months ?? {}) as Record<string, { items?: V1Item[]; income?: unknown; note?: string }>
  for (const [k, m] of Object.entries(rawMonths)) {
    months[k] = { items: (m.items ?? []).map(v1ItemToV2), income: mapIncome(m.income), note: m.note ?? '' }
  }
  return { version: 2, entities: seedEntities(), template, months, savings: [], categories: seedCategories(), proposals: [], budgets: seedBudgets(), updatedAt: new Date().toISOString() }
}

// ----- month helpers --------------------------------------------
export const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export function emiActive(it: Item, key: string): boolean {
  const first = `${key}-01`, last = `${key}-31`
  if (it.startDate && it.startDate > last) return false
  if (it.endDate && it.endDate < first) return false
  return true
}

const clone = (it: Item): Item => ({
  ...it, id: uid(it.kind), paid: false, src: 'template',
  alloc: it.alloc.mode === 'split' ? { mode: 'split', shares: { ...it.alloc.shares } } : { ...it.alloc },
})

export function materialise(template: Template, key: string): MonthData {
  const mm = key.slice(5, 7)
  const items: Item[] = [
    ...template.monthly.map(clone),
    ...template.emis.filter(e => emiActive(e, key)).map(clone),
    ...template.annual.filter(a => (a.dueDate ?? '').slice(5, 7) === mm).map(clone),
  ]
  return { items, income: template.income.map(i => ({ ...i, id: uid('inc'), src: 'template' as const })), note: '' }
}

export function monthView(doc: FinanceDoc, key: string): MonthData {
  return doc.months[key] ?? materialise(doc.template, key)
}

/** Re-apply the template's recurring items to a month, keeping that
    month's manually-added items, its income and its note. Used when
    you Save the Setup tab and push changes into existing months. */
export function applyTemplateToMonth(template: Template, key: string, existing?: MonthData): MonthData {
  const fresh = materialise(template, key)
  if (!existing) return fresh
  const manual = existing.items.filter(i => i.src === 'manual')
  const manualIncome = existing.income.filter(i => i.src === 'manual')
  return { items: [...fresh.items, ...manual], income: [...fresh.income, ...manualIncome], note: existing.note }
}

// ----- allocation & settlement ----------------------------------
export const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0))

/** Normalised share fractions by entity id for an item. */
export function shares(it: Item): Record<string, number> {
  if (it.alloc.mode === 'single') return { [it.alloc.who]: 1 }
  const s = it.alloc.shares
  const sum = Object.values(s).reduce((a, b) => a + (b || 0), 0)
  if (sum <= 0) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(s)) out[k] = (v || 0) / sum
  return out
}

export interface Totals {
  income: number
  expense: number
  net: number
  byEntity: Record<string, number>          // what each entity BEARS (their share of spend)
  transfers: { from: string; to: string; amount: number }[]
  netBalance: Record<string, number>        // >0 => is owed money
}

export function totals(m: MonthData, entities: Entity[]): Totals {
  const persons = new Set(entities.filter(e => e.kind === 'person').map(e => e.id))
  let income = 0
  for (const i of m.income) income += i.amount || 0

  let expense = 0
  const byEntity: Record<string, number> = {}
  const bal: Record<string, number> = {}
  const add = (o: Record<string, number>, k: string, v: number) => { o[k] = (o[k] ?? 0) + v }

  for (const it of m.items) {
    const amt = it.amount || 0
    expense += amt
    const sh = shares(it)
    for (const [eid, frac] of Object.entries(sh)) add(byEntity, eid, amt * frac)

    // settlement only when a PERSON paid (common pool = already shared)
    if (persons.has(it.paidBy)) {
      for (const [eid, frac] of Object.entries(sh)) {
        if (eid === it.paidBy) continue
        if (!persons.has(eid)) continue        // common's slice: borne by the pool, nobody owes
        const owed = amt * frac
        add(bal, it.paidBy, owed)              // payer is owed
        add(bal, eid, -owed)                   // beneficiary owes
      }
    }
  }

  return { income, expense, net: income - expense, byEntity, netBalance: bal, transfers: minTransfers(bal) }
}

/** Greedy min-cash-flow: turn net balances into a short list of payments. */
function minTransfers(bal: Record<string, number>): { from: string; to: string; amount: number }[] {
  const cred = Object.entries(bal).filter(([, v]) => v > 0.5).map(([id, v]) => ({ id, v }))
  const debt = Object.entries(bal).filter(([, v]) => v < -0.5).map(([id, v]) => ({ id, v: -v }))
  cred.sort((a, b) => b.v - a.v); debt.sort((a, b) => b.v - a.v)
  const out: { from: string; to: string; amount: number }[] = []
  let i = 0, j = 0
  while (i < debt.length && j < cred.length) {
    const pay = Math.min(debt[i].v, cred[j].v)
    out.push({ from: debt[i].id, to: cred[j].id, amount: pay })
    debt[i].v -= pay; cred[j].v -= pay
    if (debt[i].v < 0.5) i++
    if (cred[j].v < 0.5) j++
  }
  return out
}

// ----- classification for the month sub-tabs --------------------
export type Bucket = 'common' | 'emi' | 'personal'
export function classify(it: Item, entities: Entity[]): Bucket {
  if (it.kind === 'emi') return 'emi'
  const persons = new Set(entities.filter(e => e.kind === 'person').map(e => e.id))
  const sh = Object.entries(shares(it)).filter(([, f]) => f > 0.001)
  // borne 100% by a single person → personal; anything shared or touching the pool → common
  if (sh.length === 1 && persons.has(sh[0][0])) return 'personal'
  return 'common'
}

// ----- categories -----------------------------------------------
export function byCategory(m: MonthData): { name: string; value: number }[] {
  const map = new Map<string, number>()
  for (const it of m.items) {
    const key = it.category || bucket(it.name, it.kind)
    map.set(key, (map.get(key) ?? 0) + (it.amount || 0))
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).filter(d => d.value > 0).sort((a, b) => b.value - a.value)
}
function bucket(name: string, kind: Kind): string {
  if (kind === 'emi') return 'Loans & EMIs'
  const n = name.toLowerCase()
  if (/(rashan|milk|fruit|vegetable|cook|zomato|swiggy|zepto|grocery|blinkit)/.test(n)) return 'Food & Groceries'
  if (/(car|fuel|parking|astor|ertiga|bike|fastag|petrol|yulu)/.test(n)) return 'Vehicles & Travel'
  if (/(electric|water|cylinder|internet|maid|maintain|maintenance|gas|rent)/.test(n)) return 'Home & Utilities'
  if (/(insurance|health|tax|service)/.test(n)) return 'Insurance & Taxes'
  if (/(netflix|prime|spotify|subscription|cloud)/.test(n)) return 'Subscriptions'
  return 'Other'
}

export function categoryOf(it: Item): string { return it.category || bucket(it.name, it.kind) }

export const INR = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
export const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}
export const entName = (entities: Entity[], id: string) => entities.find(e => e.id === id)?.name ?? id
export const entColor = (entities: Entity[], id: string) => entities.find(e => e.id === id)?.color ?? '#8b81ad'

// ============================================================
// v3 — multi-user: budgets, proposals (approval queue), and the
// privacy / involvement helpers the API uses to decide who may see
// and who must approve each expense.
// ============================================================

export interface PlannedItem { id: string; name: string; amount: number; targetMonth: string; note?: string }
export interface EntityBudget { monthly: number; byCategory: Record<string, number>; planned: PlannedItem[]; note?: string }
export interface Budgets { family: EntityBudget; byEntity: Record<string, EntityBudget> }
export function emptyBudget(): EntityBudget { return { monthly: 0, byCategory: {}, planned: [] } }
export function seedBudgets(): Budgets { return { family: emptyBudget(), byEntity: {} } }

export type ProposalStatus = 'pending' | 'accepted' | 'declined'
export interface Proposal {
  id: string
  item: Item
  monthKey: string
  proposedBy: string          // entity id, or 'super'
  proposedByName: string
  approvers: string[]         // entity ids expected to approve
  approved: string[]          // entity ids who have approved
  mode: 'all' | 'any'
  status: ProposalStatus
  createdAt: string
  note?: string
  template?: { section: 'monthly' | 'emis' | 'annual'; op: 'add' | 'update' | 'delete' }
  monthEdit?: { op: 'update' | 'delete' }
}

/** Everyone touched by an expense: the payer plus anyone who bears a share. */
export function participantsOf(it: Item): string[] {
  const s = new Set<string>()
  if (it.alloc.mode === 'single') s.add(it.alloc.who)
  else Object.entries(it.alloc.shares).forEach(([id, f]) => { if ((f || 0) > 0) s.add(id) })
  s.add(it.paidBy)
  return [...s]
}
export function involves(it: Item, entityId: string): boolean {
  return participantsOf(it).includes(entityId)
}
export function isCommon(it: Item, entities: Entity[]): boolean {
  const commons = new Set(entities.filter(e => e.kind === 'common').map(e => e.id))
  return commons.has(it.paidBy) || participantsOf(it).some(p => commons.has(p))
}
export function isPersonalTo(it: Item, entityId: string, entities: Entity[]): boolean {
  const p = participantsOf(it)
  return it.paidBy === entityId && p.length === 1 && p[0] === entityId && !isCommon(it, entities)
}

/** Who must approve a proposed expense, and whether all or any of them. */
export function approversFor(it: Item, actor: string, entities: Entity[]): { approvers: string[]; mode: 'all' | 'any' } {
  const persons = new Set(entities.filter(e => e.kind === 'person').map(e => e.id))
  const earners = entities.filter(e => e.kind === 'person' && (e.earning || e.canPay)).map(e => e.id)
  if (isCommon(it, entities)) {
    return { approvers: earners.filter(id => id !== actor), mode: 'any' }
  }
  const charged = participantsOf(it).filter(id => persons.has(id) && id !== actor)
  return { approvers: charged, mode: 'all' }
}

/** A member's private view of the family doc — only what they may see. */
export function filterDocForMember(doc: FinanceDoc, e: string): FinanceDoc {
  const keep = (it: Item) => isCommon(it, doc.entities) || involves(it, e)
  const months: Record<string, MonthData> = {}
  for (const [k, m] of Object.entries(doc.months)) {
    months[k] = { items: m.items.filter(keep), income: m.income.filter(i => i.entity === e || i.entity === 'common'), note: m.note }
  }
  const template: Template = {
    monthly: doc.template.monthly.filter(keep),
    emis: doc.template.emis.filter(keep),
    annual: doc.template.annual.filter(keep),
    income: doc.template.income.filter(i => i.entity === e || i.entity === 'common'),
  }
  const budgets: Budgets = { family: doc.budgets.family, byEntity: { [e]: doc.budgets.byEntity[e] ?? emptyBudget() } }
  const proposals = (doc.proposals ?? []).filter(p => p.proposedBy === e || p.approvers.includes(e))
  return { ...doc, months, template, savings: doc.savings.filter(s => s.entity === e), budgets, proposals }
}

/** Apply an add/update/delete to a template section. */
export function applyTemplateOp(doc: FinanceDoc, section: 'monthly' | 'emis' | 'annual', op: 'add' | 'update' | 'delete', item: Item) {
  const arr = doc.template[section]
  if (op === 'add') doc.template[section] = [...arr, item]
  else if (op === 'update') doc.template[section] = arr.map(x => (x.id === item.id ? item : x))
  else doc.template[section] = arr.filter(x => x.id !== item.id)
}

/** Apply an accepted proposal — either a template change or a month item. */
export function commitProposalItem(doc: FinanceDoc, pr: Proposal) {
  if (pr.template) { applyTemplateOp(doc, pr.template.section, pr.template.op, pr.item); return }
  const m = doc.months[pr.monthKey] ?? materialise(doc.template, pr.monthKey)
  if (pr.monthEdit) {
    if (pr.monthEdit.op === 'delete') m.items = m.items.filter(x => x.id !== pr.item.id)
    else m.items = m.items.map(x => (x.id === pr.item.id ? pr.item : x))
  } else {
    m.items = [...m.items, { ...pr.item, src: 'manual' as const }]
  }
  doc.months[pr.monthKey] = m
}

// ============================================================
// v3 — statement / receipt helpers: clean a bank "particulars"
// line into a readable payee, and guess a category from the name.
// Both are heuristic and always give the user something to edit.
// ============================================================

/** Turn a bank statement PARTICULARS string into a readable payee. */
export function cleanPayee(raw: string): string {
  const s = (raw || '').trim()
  const parts = s.split('/').map(x => x.trim()).filter(Boolean)
  const head = (parts[0] || '').toUpperCase()
  let name = ''
  if (head === 'UPI') name = parts[3] || parts[2] || ''
  else if (head === 'POS' || head === 'PUR') name = parts[1] || ''
  else if (head === 'NEFT' || head === 'IMPS' || head === 'RTGS') name = parts[2] || ''
  if (!name || /^\d/.test(name) || name.length < 2) {
    // fall back to the longest mostly-alphabetic chunk
    const cand = parts.filter(x => /[a-z]/i.test(x) && !/bank|ltd|limited|upi|imps|neft|rtgs|pos|p2m|p2a|paymen|upiint|reques|refund/i.test(x))
    name = cand.sort((a, b) => b.length - a.length)[0] || parts[0] || s
  }
  // ACH / EMI style lines rarely have a clean name
  if (/ACH-DR|AUR\d|_EMI_|BAJAJFIN|MANAPPURAM|RAZORPAY|CAPITALFLO/i.test(s)) {
    if (/BAJAJFIN/i.test(s)) name = 'Bajaj Finance EMI'
    else if (/AUR\d|_EMI_/i.test(s)) name = 'Loan EMI'
    else if (/MANAPPURAM/i.test(s)) name = 'Manappuram Finance'
    else if (/RAZORPAY|CAPITALFLO/i.test(s)) name = 'Razorpay / CapitalFloat'
    else name = 'Loan / EMI'
  }
  if (/salary|wage/i.test(s)) name = 'Salary'
  return name.replace(/\s+/g, ' ').replace(/\.$/, '').trim()
    .replace(/\b\w/g, c => c) // keep as-is (names come mixed case)
    .slice(0, 60)
}

const CAT_RULES: [RegExp, string][] = [
  [/zepto|blinkit|instamart|dmart|d\s?mart|milkbasket|big\s?basket|star bazaar|avenue supermart|reliance fresh|grocery|kirana|super\s?market|saddam fruits|vegetable|annapurna|tiffin/i, 'Food & Groceries'],
  [/zomato|swiggy(?! instamart)|restaurant|cafe|chai\s?point|chaayos|rameshwaram|toscano|divine|puff|food truck|vindoos|samosa|bakery|bekary|soda|dining|dhaba|barbeque|pizza|burger|biryani|sweets|namkeen/i, 'Eating Out'],
  [/medplus|apollo|pharma|pharmacy|1mg|tata 1mg|srl|vydehi|hospital|clinic|diagnostic|\blab\b|medical|med\b|dental|chemist/i, 'Health'],
  [/myntra|max\s?fashion|max retail|ajio|flipkart|aditya birla fashion|van heusen|giva|ekart|fnp|jewel|lifestyle|westside|zudio|amazon(?!\s?pay later)|meesho|nykaa|shoppers|reliance trends|apparel|clothing/i, 'Shopping'],
  [/yulu|fastag|etc tag|petro|petrol|fuel|iocl|bpcl|\bhp\b|indian oil|uber|\bola\b|rapido|parking|kesari|toll|metro|irctc|redbus|makemytrip|goibibo/i, 'Vehicles & Travel'],
  [/jio|airtel|\bvi\b|vodafone|bescom|electricity|\bgas\b|broadband|\bact\b|water|maintenance|dth|tata power|adani/i, 'Home & Utilities'],
  [/netflix|prime|spotify|hotstar|apple\.com|google|youtube|subscription|jio postpaid|jio mobil|astrotalk/i, 'Subscriptions'],
  [/urban ?company|plumber|electrician|maid|cook|hardware|carpenter|salon|laundry/i, 'Home & Utilities'],
  [/insurance|policy|lic\b|premium|property tax|\btax\b|gst/i, 'Insurance & Taxes'],
  [/emi|bajajfin|bajaj|manappuram|razorpay|capitalflo|home loan|car loan|amazon pay later|\bloan\b/i, 'Loans & EMIs'],
  [/imps|neft|rtgs|mob\/tpft|mob-td|\brd\b|brn-si|trfr to|self|family|transfer/i, 'Transfers'],
]

/** Guess a category from a payee / description. Falls back to "Other". */
export function detectCategory(name: string): string {
  const n = (name || '').toLowerCase()
  for (const [re, cat] of CAT_RULES) if (re.test(n)) return cat
  return 'Other'
}
