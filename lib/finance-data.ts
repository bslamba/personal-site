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
  role?: string          // family relationship label, e.g. "Father", "Son", "Daughter-in-law"
  upi?: string           // UPI id, so a settlement can be paid without retyping anything
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
  rate?: number | null         // annual interest %, when known — otherwise derived from principal/EMI/tenure
  paid?: boolean
  note?: string
  receiptKey?: string | null
  category?: string            // explicit category name; blank = auto from the item name
  date?: string | null         // transaction date (YYYY-MM-DD), e.g. from a receipt or statement
  src?: 'template' | 'manual'   // template-derived vs manually added in a month
  tmplId?: string              // for a template-derived month item: the id of the Budget template item it came from (so a per-month edit can override just this month)
  override?: boolean           // a template item deliberately edited FOR THIS MONTH ONLY (does not change the Budget)
  ref?: string                 // stable fingerprint of an imported bank txn (for de-dup)
  tags?: string[]              // free-form event tags (e.g. "Ooty 2026"), independent of category
  envelope?: string            // which envelope this expense belongs to (default household)
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
  commonCarryIn?: number   // common-account surplus carried forward from the previous month
  commonDisposition?: 'transfer' | 'carry'   // what was decided about this month's common surplus
  deletedTemplate?: string[]   // template item keys (kind|name) removed for this month only
}

export interface Template {
  monthly: Item[]
  emis: Item[]
  annual: Item[]
  income: IncomeItem[]
}

export interface AuditEntry {
  id: string
  ts: string                  // ISO timestamp
  actor: string               // entity id, or 'super'
  actorName: string
  event: 'propose' | 'accept' | 'decline' | 'revoke' | 'apply'
  what: string                // human summary, e.g. "Change · House Rashan"
  reason?: string
  monthKey?: string
  proposalId?: string
  parties?: string[]          // entity ids who may see this entry (besides the actor)
  personal?: boolean          // a private, personal-only action
  change?: AuditChange        // what it was and what it became, so it can be put back
  revertedAt?: string         // set once it has been undone, so it cannot be undone twice
  revertOf?: string           // the id of the entry this one undid
}

export interface SettlementProof { key: string; by: string; at: string }
/** One payment against a transfer. A transfer can be settled in instalments,
 *  so what matters is how much has been paid, not merely whether it was. */
export interface SettlePayment { id: string; amount: number; proofKey?: string; by: string; at: string }
export interface CarryItem {
  id: string; from: string; to: string; amount: number
  fromMonth: string        // the month the debt originally arose in
  viaMonth?: string        // the close that pushed it here — lets a reopen take it back
  note?: string
}
export interface Settlement {
  closed?: boolean
  closedAt?: string
  closedBy?: string
  paid?: Record<string, SettlementProof>     // legacy: transferKey -> a single, full-amount proof
  payments?: Record<string, SettlePayment[]>  // transferKey -> the payments made against it
  carry?: CarryItem[]                         // outstanding carried in from earlier months
}

export interface Envelope {
  id: string
  name: string
  members: string[]        // entity ids that BEAR (share) this envelope's costs
  system?: boolean         // the auto "Lamba Household" envelope
  personalOf?: string      // the entity id whose private Personal envelope this is
}

export const HOUSEHOLD = 'household'

/** The stable id of an entity's Personal envelope — "My Dashboard" for that profile. */
export const personalEnvId = (entityId: string) => `personal:${entityId}`

/** The Personal envelope belonging to a given entity, if any. */
export function personalEnvelopeOf(envelopes: Envelope[] | undefined, entityId: string): Envelope | undefined {
  return (envelopes ?? []).find(e => e.personalOf === entityId)
}

/** Seed the starting envelopes from whatever entities exist. */
export function seedEnvelopes(entities: Entity[]): Envelope[] {
  const persons = entities.filter(e => e.kind === 'person')
  const earners = persons.filter(e => e.earning)
  const household: Envelope = { id: HOUSEHOLD, name: 'Lamba Household', members: (earners.length ? earners : persons).map(e => e.id), system: true }
  const envs: Envelope[] = [household]
  for (let i = 0; i < persons.length; i++) for (let j = i + 1; j < persons.length; j++) {
    const a = persons[i], b = persons[j]
    const isBrothers = (a.id === 'bhawneet' && b.id === 'gurneet') || (a.id === 'gurneet' && b.id === 'bhawneet')
    envs.push({ id: uid('env'), name: isBrothers ? 'Brothers' : `${a.name} & ${b.name}`, members: [a.id, b.id] })
  }
  // Every person gets their own private Personal envelope — this is what "My
  // Dashboard" shows: anything tagged to it, plus any expense borne entirely
  // by that one person (a personal regular expense or EMI), via the bearer
  // fallback in itemInEnvelope below.
  for (const p of persons) envs.push({ id: personalEnvId(p.id), name: `${p.name}’s Personal`, members: [p.id], personalOf: p.id })
  return envs
}

/** Equal share fractions among an envelope's members. */
export function envelopeShares(env: Envelope | undefined): Record<string, number> {
  const mem = env?.members ?? []
  if (mem.length === 0) return {}
  const f = 1 / mem.length
  return Object.fromEntries(mem.map(m => [m, f]))
}

/** The set of entities that BEAR an item's cost (share fraction > 0). */
export function bearersOf(it: Item): string[] {
  const sh = shares(it)
  return Object.keys(sh).filter(id => (sh[id] ?? 0) > 0.001)
}

/** How an item is BORNE for display: an expense paid from the common account is
 *  borne by the common pool (Lamba Household), not split onto individuals. */
export function bearerShares(it: Item): Record<string, number> {
  return it.paidBy === 'common' ? { common: 1 } : shares(it)
}

/**
 * Whether an item shows under a given envelope tab. An item always shows under
 * the envelope it is assigned to; additionally a NON-system envelope surfaces
 * any item whose bearers exactly match its members — so a 50/50 EMI kept in the
 * Lamba Household envelope still appears in the Brothers envelope, where the
 * owed-share settlement between the two is shown.
 */
export function itemInEnvelope(it: Item, env: Envelope): boolean {
  if ((it.envelope ?? HOUSEHOLD) === env.id) return true
  if (env.system) return false
  const bearers = bearersOf(it).sort()
  const mem = [...env.members].sort()
  return bearers.length > 0 && bearers.length === mem.length && bearers.every((b, i) => b === mem[i])
}

/** The envelopes a given viewer may see: system household + any they belong to. */
export function visibleEnvelopes(doc: FinanceDoc, entityId: string | null | undefined): Envelope[] {
  const all = doc.envelopes ?? []
  if (!entityId) return all
  return all.filter(env => env.system || env.members.includes(entityId))
}

export interface Reminder {
  id: string
  label: string
  scope: 'common' | 'personal'       // common = family bill; personal = one profile's
  owner?: string                     // entity id (personal) — whose reminder it is
  amount?: number
  dayOfMonth: number                 // 1..28 — remind from this day each month
  notify: string[]                   // entity ids whose emails receive the reminder
  active: boolean
  createdBy?: string
  done?: Record<string, { proofKey?: string; at: string; by: string }>  // monthKey -> resolved
  lastSent?: Record<string, string>  // monthKey -> ISO date last emailed (once/day)
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
  auditLog?: AuditEntry[]
  settlements?: Record<string, Settlement>
  reminders?: Reminder[]
  envelopes?: Envelope[]
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
    { id: 'bhawneet', name: 'Bhawneet', kind: 'person', canPay: true, earning: true, isLiability: false, color: '#4b7bec', role: 'Son' },
    { id: 'gurneet', name: 'Gurneet', kind: 'person', canPay: true, earning: true, isLiability: false, color: '#b0479a', role: 'Son' },
    { id: 'common', name: 'Common', kind: 'common', canPay: true, earning: false, isLiability: false, color: '#6d4bd8' },
    { id: 'papa', name: 'Papa', kind: 'person', canPay: true, earning: false, isLiability: false, color: '#1f9d6b', role: 'Father' },
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
  const entities = seedEntities()
  return {
    version: 2,
    entities,
    template: seedTemplate(),
    months: {},
    savings: [],
    categories: seedCategories(),
    proposals: [],
    budgets: seedBudgets(),
    envelopes: seedEnvelopes(entities),
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
    if (!Array.isArray(doc.auditLog)) doc.auditLog = []
    if (!doc.settlements || typeof doc.settlements !== 'object') doc.settlements = {}
    if (!Array.isArray(doc.reminders)) doc.reminders = []
    if (!Array.isArray(doc.envelopes) || doc.envelopes.length === 0) doc.envelopes = seedEnvelopes(doc.entities)
    // Backfill a Personal envelope for any person who doesn't have one yet
    // (older docs, or a member added after envelopes were first seeded).
    for (const p of doc.entities.filter(e => e.kind === 'person')) {
      if (!doc.envelopes.some(env => env.personalOf === p.id)) doc.envelopes.push({ id: personalEnvId(p.id), name: `${p.name}’s Personal`, members: [p.id], personalOf: p.id })
    }
    // Backfill family roles for the seeded members if none were set yet.
    const DEFAULT_ROLES: Record<string, string> = { papa: 'Father', bhawneet: 'Son', gurneet: 'Son' }
    for (const e of doc.entities) if (e.kind === 'person' && !e.role && DEFAULT_ROLES[e.id]) e.role = DEFAULT_ROLES[e.id]
    // Every existing expense belongs to the household envelope until moved.
    const stamp = (it: Item) => { if (!it.envelope) it.envelope = HOUSEHOLD }
    doc.template.monthly.forEach(stamp); doc.template.emis.forEach(stamp); doc.template.annual.forEach(stamp)
    for (const m of Object.values(doc.months)) m.items.forEach(stamp)
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
  ...it, id: uid(it.kind), tmplId: it.id, paid: false, src: 'template',
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
  const fresh = materialise(doc.template, key)
  const stored = doc.months[key]
  if (!stored) return fresh
  // Recurring items come from the current Setup/Budget template (single source
  // of truth), BUT a month may override any recurring item just for itself
  // (change amount, split, paid, envelope, …) or delete it for that month —
  // without touching the template. Overrides are matched by the template item's
  // id (tmplId); a fallback to kind|name keeps older data working.
  const overById = new Map<string, Item>()
  const overByName = new Map<string, Item>()
  for (const i of stored.items) {
    if (i.src !== 'template' || !i.override) continue   // only DELIBERATE per-month edits pin
    if (i.tmplId) overById.set(i.tmplId, i)
    else overByName.set(`${i.kind}|${i.name}`, i)
  }
  // paid flags survive even without a full override (matched by tmplId, then name).
  const paidKeys = new Set(stored.items.filter(i => i.src === 'template' && i.paid).map(i => i.tmplId ?? `${i.kind}|${i.name}`))
  const deleted = new Set(stored.deletedTemplate ?? [])
  const items = fresh.items
    .filter(it => !(it.tmplId && deleted.has(it.tmplId)))
    .map(it => {
      const ov = (it.tmplId && overById.get(it.tmplId)) || overByName.get(`${it.kind}|${it.name}`)
      // Keep the freshly-materialised id and tmplId; take everything the month
      // deliberately overrode (amount, name, alloc, paidBy, envelope, paid, note…).
      let out: Item = ov ? { ...it, ...ov, id: it.id, tmplId: it.tmplId, src: 'template' } : it
      if (!ov && paidKeys.has(it.tmplId ?? `${it.kind}|${it.name}`)) out = { ...out, paid: true }
      return out
    })
  const manual = stored.items.filter(i => i.src === 'manual')
  const manualIncome = stored.income.filter(i => i.src === 'manual')
  // A per-month common-income row (manual, entity 'common') overrides the
  // template's common income for that month; other income stacks on top.
  const hasManualCommon = manualIncome.some(i => i.entity === 'common')
  const freshIncome = hasManualCommon ? fresh.income.filter(i => i.entity !== 'common') : fresh.income
  return { items: [...items, ...manual], income: [...freshIncome, ...manualIncome], note: stored.note, commonCarryIn: stored.commonCarryIn }
}

/** Upsert a per-month override for a template-derived item (matched by tmplId,
 *  falling back to kind|name), leaving the Budget template untouched. */
export function putMonthOverride(month: MonthData, it: Item): MonthData {
  const key = it.tmplId ?? `${it.kind}|${it.name}`
  const same = (x: Item) => x.src === 'template' && ((x.tmplId && it.tmplId && x.tmplId === it.tmplId) || (!x.tmplId && !it.tmplId && `${x.kind}|${x.name}` === key))
  const others = month.items.filter(x => !same(x))
  return { ...month, items: [...others, { ...it, src: 'template', override: true }] }
}

/** Set the paid flag on a template-derived item for this month, using a light
 *  marker (does not pin the item's other fields to this month). */
export function setMonthPaid(month: MonthData, it: Item, v: boolean): MonthData {
  const key = it.tmplId ?? `${it.kind}|${it.name}`
  const idx = month.items.findIndex(x => x.src === 'template' && (x.tmplId ? x.tmplId === it.tmplId : `${x.kind}|${x.name}` === key))
  if (idx >= 0) { const items = month.items.slice(); items[idx] = { ...items[idx], paid: v }; return { ...month, items } }
  return { ...month, items: [...month.items, { ...it, src: 'template', paid: v, override: false }] }
}

/** Delete a template-derived item for this month only (never the template). */
export function deleteMonthTemplate(month: MonthData, it: Item): MonthData {
  const id = it.tmplId
  if (!id) return { ...month, items: month.items.filter(x => x.id !== it.id) }  // stray
  const deletedTemplate = Array.from(new Set([...(month.deletedTemplate ?? []), id]))
  // also drop any stored override for it
  const items = month.items.filter(x => !(x.src === 'template' && x.tmplId === id))
  return { ...month, deletedTemplate, items }
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
    // What each entity BEARS: an expense paid from the common account is borne
    // by the Lamba Household pool, not split onto the individuals. (The earners
    // only fund the common SHORTFALL — handled in the settlement, not here.)
    const bsh = bearerShares(it)
    for (const [eid, frac] of Object.entries(bsh)) add(byEntity, eid, amt * frac)

    const sh = shares(it)
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
  const persons = new Set(entities.filter(e => e.kind === 'person').map(e => e.id))
  const sh = Object.entries(shares(it)).filter(([, f]) => f > 0.001)
  // Borne 100% by a single person → personal, regardless of kind — a personal
  // EMI/regular expense belongs on that person's own Personal envelope, not
  // the shared household EMI/Common lists. Anything split (or common-touching)
  // that is itself an EMI still sits in the household's EMI bucket.
  if (sh.length === 1 && persons.has(sh[0][0])) return 'personal'
  if (it.kind === 'emi') return 'emi'
  return 'common'
}

// ----- categories -----------------------------------------------
/** Spend by category. With `entityId`, only the part that entity bears —
 *  so a personal view doesn't show the whole household's spending. */
export function byCategory(m: MonthData, entityId?: string): { name: string; value: number }[] {
  const map = new Map<string, number>()
  for (const it of m.items) {
    const frac = entityId ? (bearerShares(it)[entityId] ?? 0) : 1
    if (frac <= 0) continue
    const key = it.category || bucket(it.name, it.kind)
    map.set(key, (map.get(key) ?? 0) + (it.amount || 0) * frac)
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
  reason?: string             // why the edit was initiated (required for edits)
  template?: { section: 'monthly' | 'emis' | 'annual'; op: 'add' | 'update' | 'delete' }
  monthEdit?: { op: 'update' | 'delete' }
  incomeEdit?: { monthKey: string; amount: number }   // common-account income change
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
    months[k] = { items: m.items.filter(keep), income: m.income.filter(i => i.entity === e || i.entity === 'common'), note: m.note, commonCarryIn: m.commonCarryIn, commonDisposition: m.commonDisposition, deletedTemplate: m.deletedTemplate }
  }
  const template: Template = {
    monthly: doc.template.monthly.filter(keep),
    emis: doc.template.emis.filter(keep),
    annual: doc.template.annual.filter(keep),
    income: doc.template.income.filter(i => i.entity === e || i.entity === 'common'),
  }
  const budgets: Budgets = { family: doc.budgets.family, byEntity: { [e]: doc.budgets.byEntity[e] ?? emptyBudget() } }
  const proposals = (doc.proposals ?? []).filter(p => p.proposedBy === e || p.approvers.includes(e))
  const auditLog = (doc.auditLog ?? []).filter(a => a.actor === e || (a.parties ?? []).includes(e))
  const reminders = (doc.reminders ?? []).filter(r => r.scope === 'common' || r.owner === e || (r.notify ?? []).includes(e))
  const envelopes = (doc.envelopes ?? []).filter(env => env.system || env.members.includes(e))
  return { ...doc, months, template, savings: doc.savings.filter(s => s.entity === e), budgets, proposals, auditLog, settlements: doc.settlements, reminders, envelopes }
}

/** Everywhere an entity still appears. Removing someone who is referenced
 *  leaves expenses pointing at a person who no longer exists — their share
 *  then quietly vanishes from the settlement instead of being reassigned. */
export function entityReferences(doc: FinanceDoc, id: string): { items: number; income: number; savings: number; envelopes: number; total: number } {
  const touches = (it: Item) => it.paidBy === id || (shares(it)[id] ?? 0) > 0
  let items = 0
  for (const sec of [doc.template.monthly, doc.template.emis, doc.template.annual]) items += sec.filter(touches).length
  for (const m of Object.values(doc.months)) items += m.items.filter(touches).length
  let income = doc.template.income.filter(i => i.entity === id).length
  for (const m of Object.values(doc.months)) income += m.income.filter(i => i.entity === id).length
  const savings = doc.savings.filter(s => s.entity === id).length
  const envelopes = (doc.envelopes ?? []).filter(e => !e.personalOf && e.members.includes(id)).length
  return { items, income, savings, envelopes, total: items + income + savings + envelopes }
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
  if (pr.incomeEdit) { setCommonIncome(doc, pr.incomeEdit.monthKey, pr.incomeEdit.amount); return }
  if (pr.template) { applyTemplateOp(doc, pr.template.section, pr.template.op, pr.item); return }
  const m = doc.months[pr.monthKey] ?? { items: [], income: [], note: '' }
  if (pr.monthEdit) {
    if (pr.monthEdit.op === 'delete') doc.months[pr.monthKey] = pr.item.src === 'template' ? deleteMonthTemplate(m, pr.item) : { ...m, items: m.items.filter(x => x.id !== pr.item.id) }
    else doc.months[pr.monthKey] = pr.item.src === 'template' ? putMonthOverride(m, pr.item) : { ...m, items: m.items.map(x => (x.id === pr.item.id ? pr.item : x)) }
  } else {
    doc.months[pr.monthKey] = { ...m, items: [...m.items, { ...pr.item, src: 'manual' as const }] }
  }
}

/** Set the common-account income for a month to a single "rent" row. */
export function setCommonIncome(doc: FinanceDoc, monthKey: string, amount: number) {
  const m = doc.months[monthKey] ?? { items: [], income: [], note: '' }
  const others = m.income.filter(i => i.entity !== 'common')
  m.income = [...others, { id: uid('inc'), source: 'Common account income (rent)', entity: 'common', amount: Math.max(0, amount), src: 'manual' as const }]
  doc.months[monthKey] = m
}

// ---------- Monthly settlement ----------------------------------
export interface SettleTransfer {
  key: string; from: string; to: string; amount: number
  kind: 'common' | 'peer' | 'carry'; fromMonth?: string; note?: string
  settled: number            // paid against it so far
  due: number                // what is still owed — this is what carries forward
  payments: SettlePayment[]
}

/** The payments recorded against a transfer, reading a legacy single proof as
 *  one payment of the whole amount. */
export function paymentsFor(st: Settlement | undefined, key: string, amount: number): SettlePayment[] {
  const list = st?.payments?.[key]
  if (list) return list
  const old = st?.paid?.[key]
  return old ? [{ id: `legacy:${key}`, amount, proofKey: old.key || undefined, by: old.by, at: old.at }] : []
}

/** Whether a string looks like a UPI id (name@bank). */
export function isUpiId(v: string | undefined | null): boolean {
  return /^[\w.\-]{2,}@[\w.\-]{2,}$/.test((v || '').trim())
}

/** A UPI deep link: opens the payer's UPI app with everything filled in.
 *  Returns null when we have no UPI id to pay into. */
export function upiLink(payee: Entity | undefined, amount: number, note: string): string | null {
  const vpa = (payee?.upi || '').trim()
  if (!isUpiId(vpa)) return null
  const q = new URLSearchParams({
    pa: vpa, pn: payee!.name, am: Math.max(0, amount).toFixed(2), cu: 'INR', tn: note.slice(0, 50),
  })
  return `upi://pay?${q.toString()}`
}
export interface LedgerLine { label: string; amount: number }  // + = owed to them, - = they owe
export interface SettleView {
  commonIncome: number
  carryIn: number           // surplus carried in from last month — it funds this month too
  commonExpenses: number
  shortfall: number
  contributors: string[]
  perContributor: number
  transfers: SettleTransfer[]
  closed: boolean
  outstanding: number        // the sum still due, after part payments
  ledger: Record<string, LedgerLine[]>   // per-entity itemised working
  net: Record<string, number>            // per-entity net (>0 owed to them)
}

export function computeSettlement(doc: FinanceDoc, mk: string): SettleView {
  const m = monthView(doc, mk)
  const entities = doc.entities
  const persons = entities.filter(e => e.kind === 'person')
  const personIds = new Set(persons.map(e => e.id))
  const t = totals(m, entities)
  const commonIncome = m.income.filter(i => i.entity === 'common').reduce((s, i) => s + (i.amount || 0), 0)
  const commonExpenses = m.items.filter(it => it.paidBy === 'common').reduce((s, it) => s + (it.amount || 0), 0)
  // A surplus carried in from last month is still sitting in the common
  // account, so it pays this month's bills before anyone tops anything up.
  const carryIn = m.commonCarryIn ?? 0
  const shortfall = Math.max(0, commonExpenses - commonIncome - carryIn)
  // Whoever earns funds the common pot's shortfall, split equally.
  const contributors = persons.filter(e => e.earning).map(e => e.id)
  const perContributor = contributors.length ? shortfall / contributors.length : 0

  type RawTransfer = Omit<SettleTransfer, 'settled' | 'due' | 'payments'>
  const raw: RawTransfer[] = []
  if (perContributor > 0.5) contributors.forEach(c => raw.push({ key: `common:${c}`, from: c, to: 'common', amount: perContributor, kind: 'common' }))
  // Peer settlement (individual-paid shared expenses) already handled by totals().
  t.transfers.forEach(tr => raw.push({ key: `peer:${tr.from}>${tr.to}`, from: tr.from, to: tr.to, amount: tr.amount, kind: 'peer' }))
  // Anything carried in from an earlier, closed month.
  const st = doc.settlements?.[mk]
  ;(st?.carry ?? []).forEach(c => raw.push({ key: `carry:${c.id}`, from: c.from, to: c.to, amount: c.amount, kind: 'carry', fromMonth: c.fromMonth, note: c.note }))
  // Each transfer carries what has been paid against it, so a part payment is
  // visible everywhere rather than rounding to "not paid yet".
  const transfers: SettleTransfer[] = raw.map(tr => {
    const payments = paymentsFor(st, tr.key, tr.amount)
    const settled = payments.reduce((a, p) => a + (p.amount || 0), 0)
    return { ...tr, payments, settled, due: Math.max(0, tr.amount - settled) }
  })

  // Itemised working, per entity — explains where each net figure comes from.
  const ledger: Record<string, LedgerLine[]> = {}
  const net: Record<string, number> = {}
  const push = (eid: string, label: string, amount: number) => { (ledger[eid] ??= []).push({ label, amount }); net[eid] = (net[eid] ?? 0) + amount }
  const nm = (id: string) => entities.find(e => e.id === id)?.name ?? id
  for (const it of m.items) {
    if (!personIds.has(it.paidBy)) continue    // common-paid handled via shortfall
    const sh = shares(it)
    for (const [eid, frac] of Object.entries(sh)) {
      if (eid === it.paidBy || !personIds.has(eid)) continue
      const owed = (it.amount || 0) * frac
      if (owed < 0.5) continue
      push(it.paidBy, `${it.name || 'Expense'}: ${nm(eid)}'s ${Math.round(frac * 100)}% share (you paid)`, +owed)
      push(eid, `${it.name || 'Expense'}: your ${Math.round(frac * 100)}% share (${nm(it.paidBy)} paid)`, -owed)
    }
  }
  if (perContributor > 0.5) contributors.forEach(c => push(c, `Common-account shortfall — your ${Math.round(100 / contributors.length)}% of ₹${Math.round(shortfall)}`, -perContributor))

  const closed = !!st?.closed
  const outstanding = transfers.reduce((s, tr) => s + tr.due, 0)
  return { commonIncome, carryIn, commonExpenses, shortfall, contributors, perContributor, transfers, closed, outstanding, ledger, net }
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

// ============================================================
// Loans: real amortisation, and interest by financial year.
//
// A reducing-balance loan is not EMI × months remaining. Early EMIs are
// almost all interest, so the outstanding principal falls far more slowly
// than a straight-line guess suggests — and it is the interest figure, split
// per person per financial year, that matters at tax time.
//
// Most loans here already carry principal, EMI and tenure, which is enough
// to recover the interest rate, so nothing extra has to be typed in. A rate
// can be set explicitly on the item when it is known, or when the EMI has
// been revised and the derived figure would be wrong.
// ============================================================

export interface AmortRow {
  month: string          // YYYY-MM the instalment falls in
  opening: number
  emi: number
  interest: number
  principal: number
  closing: number
}

export interface LoanView {
  item: Item
  months: number | null          // tenure, given or derived from the dates
  monthsPaid: number
  monthsLeft: number | null
  annualRate: number | null      // null when it could not be established
  rateDerived: boolean           // true when recovered from principal/EMI/tenure
  // A derived rate of exactly 0% means the instalments only add up to the
  // recorded principal. That is a real 0% scheme — or, more often, a
  // principal recorded as the TOTAL PAYABLE. Worth querying either way.
  derivedZero: boolean
  schedule: AmortRow[]           // empty when the loan cannot be amortised
  estimated: boolean             // true when falling back to EMI × months left
  outstanding: number | null
  paidInterest: number
  paidPrincipal: number
  remainingInterest: number
  totalInterest: number
  endsOn: string | null          // YYYY-MM of the last instalment
}

/** Months from one month key to another, inclusive of both ends. */
function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am) + 1
}
const addMonths = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + n, 1))
}

/**
 * The monthly rate implied by a reducing-balance loan, found by bisection on
 *   EMI = P·r·(1+r)^n / ((1+r)^n − 1)
 * which rises monotonically with r. Returns 0 for an interest-free plan (the
 * instalments only add up to the principal) and null when the numbers cannot
 * describe a loan at all.
 */
export function impliedMonthlyRate(principal: number, emi: number, months: number): number | null {
  if (!(principal > 0) || !(emi > 0) || !(months > 0)) return null
  if (emi * months <= principal + 0.5) return 0          // interest-free instalments
  if (emi <= principal / months) return null             // never repays
  const pay = (r: number) => { const f = Math.pow(1 + r, months); return principal * r * f / (f - 1) }
  let lo = 0, hi = 0.05                                  // up to 60% a year
  while (pay(hi) < emi && hi < 1) hi *= 2
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (pay(mid) < emi) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

/** How many instalments this loan runs for, from tenure or its dates. */
export function loanMonths(it: Item): number | null {
  if (it.tenure && it.tenure > 0) return it.tenure
  if (it.startDate && it.endDate) return Math.max(1, monthsBetween(it.startDate.slice(0, 7), it.endDate.slice(0, 7)))
  return null
}

/** The full instalment-by-instalment schedule. Empty when the loan lacks the
 *  principal or tenure needed to work one out. */
export function amortise(it: Item): AmortRow[] {
  const months = loanMonths(it)
  const principal = it.principal ?? 0
  const emi = it.amount || 0
  if (!months || !(principal > 0) || !(emi > 0) || !it.startDate) return []
  const r = it.rate != null && it.rate >= 0 ? it.rate / 12 / 100 : impliedMonthlyRate(principal, emi, months)
  if (r == null) return []
  const start = it.startDate.slice(0, 7)
  const rows: AmortRow[] = []
  let balance = principal
  for (let i = 0; i < months && balance > 0.5; i++) {
    const interest = balance * r
    // The final instalment settles the balance exactly — real lenders round
    // the last payment, and it keeps the schedule adding up to the principal.
    const due = i === months - 1 ? balance + interest : Math.min(emi, balance + interest)
    const principalPart = due - interest
    const closing = Math.max(0, balance - principalPart)
    rows.push({ month: addMonths(start, i), opening: balance, emi: due, interest, principal: principalPart, closing })
    balance = closing
  }
  return rows
}

/** Everything worth knowing about a loan as of a given month. Falls back to
 *  the straight-line estimate when it cannot be amortised, and says so. */
export function loanView(it: Item, asOf: string = monthKey()): LoanView {
  const months = loanMonths(it)
  const schedule = amortise(it)
  const start = it.startDate ? it.startDate.slice(0, 7) : null
  const elapsed = start ? Math.max(0, monthsBetween(start, asOf)) : 0
  const monthsPaid = months ? Math.min(elapsed, months) : elapsed

  if (schedule.length === 0) {
    // No principal or tenure: all we can honestly say is EMI × instalments left.
    const monthsLeft = months != null ? Math.max(0, months - monthsPaid) : null
    return {
      item: it, months, monthsPaid, monthsLeft, annualRate: null, rateDerived: false, derivedZero: false,
      schedule, estimated: true,
      outstanding: monthsLeft != null ? (it.amount || 0) * monthsLeft : null,
      paidInterest: 0, paidPrincipal: 0, remainingInterest: 0, totalInterest: 0,
      endsOn: it.endDate ? it.endDate.slice(0, 7) : (start && months ? addMonths(start, months - 1) : null),
    }
  }

  const done = schedule.filter(r => r.month <= asOf)
  const left = schedule.filter(r => r.month > asOf)
  const r = it.rate != null && it.rate >= 0
    ? it.rate / 100
    : (impliedMonthlyRate(it.principal ?? 0, it.amount || 0, months ?? schedule.length) ?? 0) * 12
  return {
    item: it, months, monthsPaid: done.length, monthsLeft: left.length,
    annualRate: r * 100, rateDerived: it.rate == null, derivedZero: it.rate == null && r < 0.0001,
    schedule, estimated: false,
    outstanding: done.length ? done[done.length - 1].closing : (it.principal ?? 0),
    paidInterest: done.reduce((a, x) => a + x.interest, 0),
    paidPrincipal: done.reduce((a, x) => a + x.principal, 0),
    remainingInterest: left.reduce((a, x) => a + x.interest, 0),
    totalInterest: schedule.reduce((a, x) => a + x.interest, 0),
    endsOn: schedule[schedule.length - 1]?.month ?? null,
  }
}

/** The Indian financial year a month falls in, as '2026-27' (April to March). */
export function fyOf(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const start = m >= 4 ? y : y - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}
/** The months of a financial year, in order. */
export function fyMonths(fy: string): string[] {
  const start = Number(fy.slice(0, 4))
  return Array.from({ length: 12 }, (_, i) => addMonths(`${start}-04`, i))
}

/** What a loan costs in one financial year, and each person's share of it. */
export function loanYear(it: Item, fy: string): { interest: number; principal: number; paid: number; byEntity: Record<string, { interest: number; principal: number }> } {
  const rows = amortise(it).filter(r => fyOf(r.month) === fy)
  const interest = rows.reduce((a, x) => a + x.interest, 0)
  const principal = rows.reduce((a, x) => a + x.principal, 0)
  const byEntity: Record<string, { interest: number; principal: number }> = {}
  for (const [id, frac] of Object.entries(shares(it))) {
    if (frac <= 0.001) continue
    byEntity[id] = { interest: interest * frac, principal: principal * frac }
  }
  return { interest, principal, paid: rows.reduce((a, x) => a + x.emi, 0), byEntity }
}

// ============================================================
// Looking ahead: what each month will cost, and the quiet monthly
// set-aside that stops a yearly bill landing as a shock.
//
// Nothing here invents a second model of the money. A future month is just
// a month the template has not been opened yet, so monthView materialises it
// exactly as it would when it arrives, and the same charge rule that drives
// My Dashboard is applied to it.
// ============================================================

export interface MonthCharge {
  income: number            // what this person earns that month
  charged: number           // their share of everything that reaches their own money
  topUp: number             // included in `charged` — their part of the common shortfall
  commonShortfall: number   // the whole shortfall, for context
}

/** What a month costs one person: their share of every expense paid from a
 *  personal account, plus their part of the common account's shortfall.
 *  Bills the common account pays are funded by its own income, so they only
 *  reach a person through that shortfall. */
export function personCharge(doc: FinanceDoc, entityId: string, k: string): MonthCharge {
  const m = monthView(doc, k)
  const s = computeSettlement(doc, k)
  const income = m.income.filter(i => i.entity === entityId).reduce((a, b) => a + (b.amount || 0), 0)
  let charged = 0
  for (const it of m.items) {
    if (it.paidBy === 'common') continue
    charged += (it.amount || 0) * (shares(it)[entityId] ?? 0)
  }
  const topUp = s.contributors.includes(entityId) ? s.perContributor : 0
  return { income, charged: charged + topUp, topUp, commonShortfall: s.shortfall }
}

export interface ForecastMonth {
  key: string
  income: number
  outflow: number
  net: number
  spikes: { name: string; amount: number }[]   // yearly bills landing this month
}

/** The next few months as they stand today, for one person or the household. */
export function forecast(doc: FinanceDoc, entityId: string | null, months = 6, from: string = monthKey()): ForecastMonth[] {
  const [y, mo] = from.split('-').map(Number)
  return Array.from({ length: months }, (_, i) => {
    const key = monthKey(new Date(y, mo - 1 + i, 1))
    const m = monthView(doc, key)
    const spikes = m.items
      .filter(it => it.kind === 'annual' && (it.amount || 0) > 0)
      .map(it => ({ name: it.name || 'Yearly bill', amount: it.amount || 0 }))
      .sort((a, b) => b.amount - a.amount)
    if (entityId) {
      const c = personCharge(doc, entityId, key)
      return { key, income: c.income, outflow: c.charged, net: c.income - c.charged, spikes }
    }
    const t = totals(m, doc.entities)
    return { key, income: t.income, outflow: t.expense, net: t.income - t.expense, spikes }
  })
}

export interface SinkingRow {
  item: Item
  annual: number            // the bill, once a year
  nextDue: string           // YYYY-MM it next lands
  monthsToGo: number        // whole months from now until then
  perMonth: number          // the steady set-aside: a twelfth of the bill
  catchUp: number           // what it takes from now if nothing is set aside yet
  commonPaid: boolean
  yours: number             // the part of `perMonth` that falls to this viewer
}

/**
 * The yearly bills, and what putting money aside each month would look like.
 * A bill the common account pays is funded by that account, so it is the
 * earners who would each carry an equal part of it; a bill someone pays
 * themselves is carried the way it is split.
 */
export function sinkingFund(doc: FinanceDoc, entityId: string | null, from: string = monthKey()): SinkingRow[] {
  const earners = doc.entities.filter(e => e.kind === 'person' && e.earning)
  const [fy, fm] = from.split('-').map(Number)
  return doc.template.annual
    .filter(it => (it.amount || 0) > 0 && it.dueDate)
    .map(it => {
      const dueMonth = Number(it.dueDate!.slice(5, 7))
      // The next time this bill lands: this year if still to come, else next.
      const year = dueMonth >= fm ? fy : fy + 1
      const nextDue = `${year}-${String(dueMonth).padStart(2, '0')}`
      const monthsToGo = (year - fy) * 12 + (dueMonth - fm)
      const annual = it.amount || 0
      const commonPaid = it.paidBy === 'common'
      const yours = entityId
        ? (commonPaid
            ? (earners.some(e => e.id === entityId) ? annual / 12 / (earners.length || 1) : 0)
            : (annual / 12) * (shares(it)[entityId] ?? 0))
        : annual / 12
      return {
        item: it, annual, nextDue, monthsToGo,
        perMonth: annual / 12,
        catchUp: monthsToGo > 0 ? annual / monthsToGo : annual,
        commonPaid, yours,
      }
    })
    .sort((a, b) => a.monthsToGo - b.monthsToGo || b.annual - a.annual)
}

// ============================================================
// Net worth and prepayment.
//
// The debt side of net worth is known exactly, forwards and backwards, once
// the loans are amortised: every future balance is already determined by the
// schedule. Savings are only ever a balance as it stands today — there is no
// history of them — so this never pretends to a net-worth line through time,
// only an honest debt curve and today's position against it.
// ============================================================

export interface DebtPoint { key: string; owed: number }

/** What is still owed on a loan at the end of a given month. */
export function owedAt(it: Item, k: string, schedule?: AmortRow[]): number {
  const sched = schedule ?? amortise(it)
  const start = (sched[0]?.month ?? it.startDate?.slice(0, 7)) || null
  if (!start || k < start) return 0
  if (sched.length) {
    const upto = sched.filter(r => r.month <= k)
    return upto.length ? upto[upto.length - 1].closing : sched[0].opening
  }
  // No amount borrowed recorded — the best that can be said is instalments left.
  const months = loanMonths(it)
  if (!months) return 0
  return Math.max(0, months - monthsBetween(start, k)) * (it.amount || 0)
}

/** The debt curve: what is owed each month, for one person or the household. */
export function debtOverTime(doc: FinanceDoc, entityId: string | null, back = 12, ahead = 36, from: string = monthKey()): DebtPoint[] {
  const prepared = doc.template.emis.map(it => ({
    it,
    frac: entityId ? (shares(it)[entityId] ?? 0) : 1,
    sched: amortise(it),
  })).filter(p => p.frac > 0.001)
  const [y, mo] = from.split('-').map(Number)
  return Array.from({ length: back + ahead + 1 }, (_, i) => {
    const key = monthKey(new Date(y, mo - 1 - back + i, 1))
    const owed = prepared.reduce((a, p) => a + owedAt(p.it, key, p.sched) * p.frac, 0)
    return { key, owed }
  })
}

/** The month the last instalment of everything falls — when the debt ends. */
export function debtFreeBy(doc: FinanceDoc, entityId: string | null): string | null {
  let last: string | null = null
  for (const it of doc.template.emis) {
    if (entityId && (shares(it)[entityId] ?? 0) <= 0.001) continue
    const v = loanView(it)
    if (v.endsOn && (!last || v.endsOn > last)) last = v.endsOn
  }
  return last
}

export interface PrepayResult {
  months: number             // instalments still to pay under this plan
  endsOn: string | null
  interest: number           // interest from here on under this plan
  baseMonths: number         // and the same two figures if nothing changes
  baseInterest: number
  monthsSaved: number
  interestSaved: number
  clears: boolean            // false when the payment never covers the interest
}

/**
 * What a prepayment would do, keeping the EMI the same and shortening the
 * loan — which is where the saving comes from. `lump` is paid now, `monthly`
 * is added to every instalment from here.
 */
export function simulatePrepay(it: Item, opts: { lump?: number; monthly?: number; from?: string }): PrepayResult | null {
  const from = opts.from ?? monthKey()
  const base = loanView(it, from)
  if (base.estimated || !base.schedule.length) return null      // nothing to simulate against
  const months = loanMonths(it) ?? base.schedule.length
  const r = it.rate != null && it.rate >= 0 ? it.rate / 12 / 100 : impliedMonthlyRate(it.principal ?? 0, it.amount || 0, months)
  if (r == null) return null

  const emi = (it.amount || 0) + Math.max(0, opts.monthly ?? 0)
  let balance = Math.max(0, (base.outstanding ?? 0) - Math.max(0, opts.lump ?? 0))
  let interest = 0, n = 0
  while (balance > 0.5 && n < 1200) {
    const int = balance * r
    if (emi <= int + 0.5) return {                               // the payment never bites
      months: base.monthsLeft ?? 0, endsOn: base.endsOn, interest: base.remainingInterest,
      baseMonths: base.monthsLeft ?? 0, baseInterest: base.remainingInterest,
      monthsSaved: 0, interestSaved: 0, clears: false,
    }
    interest += int
    balance = balance - (emi - int)
    n++
  }
  const baseMonths = base.monthsLeft ?? 0
  const baseInterest = base.remainingInterest
  return {
    months: n,
    endsOn: n > 0 ? addMonths(from, n - 1) : from,
    interest,
    baseMonths, baseInterest,
    monthsSaved: Math.max(0, baseMonths - n),
    interestSaved: Math.max(0, baseInterest - interest),
    clears: true,
  }
}

// ============================================================
// Restoring a day's snapshot.
//
// There is one document and every profile is a filtered view of it, so a
// restore is atomic across everybody by construction. The danger is not
// synchronisation — it is blast radius. Rolling the whole file back to undo
// one shared expense would also undo things that have nothing to do with it:
//
//   · someone else's private savings and income, edited since
//   · approvals people have given, un-given
//   · settlement payments — money that actually moved, with a screenshot
//
// That last one is the serious one: the money has left the bank whatever the
// file says, and forgetting it leaves somebody owed a sum they already paid.
//
// So a restore rolls back the SHARED picture and carries today's private and
// factual records forward across it.
// ============================================================

export interface RestorePlan {
  /** What the restore will change, in plain terms, for a confirmation step. */
  summary: { label: string; from: string; to: string }[]
  doc: FinanceDoc
}

/** Build the document a restore would write: the backup's shared picture,
 *  with everything personal or already-transacted kept from today. */
export function restoreMerge(backup: FinanceDoc, current: FinanceDoc): FinanceDoc {
  const merged: FinanceDoc = structuredClone(backup)

  // Money that actually moved, and decisions people have made, are facts about
  // the world rather than parts of the shared picture — they never roll back.
  merged.settlements = current.settlements ?? {}
  merged.proposals = current.proposals ?? []
  merged.savings = current.savings ?? []
  merged.reminders = current.reminders ?? []
  // The log is append-only: it is the record OF the restore, so it must survive it.
  merged.auditLog = current.auditLog ?? []

  // Private income lives in the same month rows as common income. Take the
  // common side from the backup and each person's own side from today.
  for (const [k, cur] of Object.entries(current.months)) {
    const from = merged.months[k]
    const personal = cur.income.filter(i => i.entity !== 'common')
    if (!from) {
      // A month that only exists now — keep the person's income, drop the
      // shared items the restore says should not be there.
      if (personal.length) merged.months[k] = { ...cur, items: [], income: personal }
      continue
    }
    merged.months[k] = { ...from, income: [...from.income.filter(i => i.entity === 'common'), ...personal] }
  }
  merged.template = {
    ...merged.template,
    income: [
      ...merged.template.income.filter(i => i.entity === 'common'),
      ...(current.template.income ?? []).filter(i => i.entity !== 'common'),
    ],
  }
  return merged
}

/** A short, human account of what a restore would change. */
export function restoreSummary(backup: FinanceDoc, current: FinanceDoc): RestorePlan['summary'] {
  const countItems = (d: FinanceDoc) =>
    Object.values(d.months).reduce((a, m) => a + m.items.length, 0)
  const recurring = (d: FinanceDoc) => d.template.monthly.length + d.template.emis.length + d.template.annual.length
  const n = (v: number) => String(v)
  return [
    { label: 'People', from: n(backup.entities.length), to: n(current.entities.length) },
    { label: 'Envelopes', from: n((backup.envelopes ?? []).length), to: n((current.envelopes ?? []).length) },
    { label: 'Recurring commitments', from: n(recurring(backup)), to: n(recurring(current)) },
    { label: 'Months opened', from: n(Object.keys(backup.months).length), to: n(Object.keys(current.months).length) },
    { label: 'Expenses recorded', from: n(countItems(backup)), to: n(countItems(current)) },
  ]
}

// ============================================================
// Undoing one change.
//
// Restoring a whole day to undo a single wrong figure is a sledgehammer: it
// also rolls back everything else that happened that day. So every change to
// a shared item records what it was and what it became, and can be put back
// on its own.
//
// What is recorded is the STORED shape, not the displayed one. A recurring
// item shown in a month is materialised fresh each read and gets a new id
// every time, so a month change is keyed on the template id it came from and
// undone by restoring (or removing) that month's override.
// ============================================================

export interface AuditChange {
  scope: 'template' | 'month'
  section?: 'monthly' | 'emis' | 'annual'   // template changes
  monthKey?: string                          // month changes
  mode?: 'manual' | 'override'               // a one-off, or this month's override of a recurring item
  key: string                                // template item id, or the tmplId / manual id in a month
  before: Item | null                        // null when the change created it
  after: Item | null                         // null when the change removed it
}

/** What that change's target looks like in the document right now, so a
 *  revert can refuse when something else has since touched it. */
export function currentOf(doc: FinanceDoc, c: AuditChange): Item | null {
  if (c.scope === 'template') {
    const sec = c.section ? doc.template[c.section] : []
    return sec.find(x => x.id === c.key) ?? null
  }
  const m = doc.months[c.monthKey ?? '']
  if (!m) return null
  if (c.mode === 'manual') return m.items.find(x => x.id === c.key && x.src === 'manual') ?? null
  if ((m.deletedTemplate ?? []).includes(c.key)) return null
  return m.items.find(x => x.src === 'template' && x.override && x.tmplId === c.key) ?? null
}

/** True when the target still holds what the change left behind — i.e. nobody
 *  has edited it since, so undoing it cannot clobber someone else's work. */
export function revertIsSafe(doc: FinanceDoc, c: AuditChange): boolean {
  const now = currentOf(doc, c)
  const cmp = (a: Item | null) => {
    if (!a) return null
    // Ids are reassigned when a month is materialised, so compare what the
    // change actually carried rather than identity.
    const { id: _id, src: _src, override: _ov, ...rest } = a
    void _id; void _src; void _ov
    return JSON.stringify(rest)
  }
  return cmp(now) === cmp(c.after)
}

/** Put a single change back. The document is modified in place. */
export function applyRevert(doc: FinanceDoc, c: AuditChange): void {
  if (c.scope === 'template') {
    if (!c.section) return
    if (c.before && c.after) applyTemplateOp(doc, c.section, 'update', c.before)
    else if (c.before) applyTemplateOp(doc, c.section, 'add', c.before)
    else if (c.after) applyTemplateOp(doc, c.section, 'delete', c.after)
    return
  }
  const mk = c.monthKey ?? ''
  const m = doc.months[mk] ?? { items: [], income: [], note: '' }
  if (c.mode === 'manual') {
    const others = m.items.filter(x => x.id !== c.key)
    doc.months[mk] = { ...m, items: c.before ? [...others, c.before] : others }
    return
  }
  // An override of a recurring item, or its removal for this month.
  let next: MonthData = { ...m, deletedTemplate: (m.deletedTemplate ?? []).filter(id => id !== c.key) }
  if (c.before) next = putMonthOverride(next, c.before)
  else next = { ...next, items: next.items.filter(x => !(x.src === 'template' && x.tmplId === c.key)) }
  doc.months[mk] = next
}

// ============================================================
// Reconciling a statement against what was expected.
//
// The template says what SHOULD leave the account each month; the statement
// says what did. Nobody was comparing the two, so a bounced EMI, a double
// debit, or a rate revision that changed an instalment all passed unnoticed —
// and a recurring bill re-imported by hand became a duplicate expense.
//
// Only items paid from the account being imported are considered: a personal
// statement will not show what the common account paid, and calling those
// "missing" would be noise.
// ============================================================

export interface StatementLike { id: string; date: string; payee: string; desc?: string; amount: number; type: 'debit' | 'credit' }

export interface ReconMatch {
  row: StatementLike
  item: Item
  score: number
  amountDiff: number        // statement minus expected; non-zero means the instalment moved
}
export interface Recon {
  matched: ReconMatch[]
  missing: Item[]                                   // expected, nothing in the statement looks like it
  duplicates: { item: Item; rows: StatementLike[] }[]
  drift: ReconMatch[]                               // matched, but not for the expected amount
  unmatchedRows: StatementLike[]
}

const WORD = /[a-z0-9]+/g
const norm = (s: string) => (s || '').toLowerCase().match(WORD)?.filter(w => w.length > 2) ?? []
/** How much two names look like each other, 0..1. */
function nameScore(a: string, b: string): number {
  const x = norm(a), y = norm(b)
  if (!x.length || !y.length) return 0
  const hit = x.filter(w => y.some(v => v.startsWith(w) || w.startsWith(v))).length
  return hit / Math.max(x.length, y.length)
}

/** Compare a month's expected payments against the statement rows for it. */
export function reconcile(expected: Item[], rows: StatementLike[], owner: string): Recon {
  // Only what this account actually pays, and only money going out.
  const mine = expected.filter(it => it.paidBy === owner && (it.amount || 0) > 0)
  const debits = rows.filter(r => r.type === 'debit')
  const used = new Set<string>()
  const matched: ReconMatch[] = []
  const duplicates: { item: Item; rows: StatementLike[] }[] = []
  const missing: Item[] = []

  // Strong matches first, so an exact amount is not stolen by a fuzzy one.
  const candidates = (it: Item) => debits
    .filter(r => !used.has(r.id))
    .map(r => {
      const exp = it.amount || 0
      const diff = Math.abs(r.amount - exp)
      const rel = exp > 0 ? diff / exp : 1
      const amountScore = rel < 0.001 ? 1 : rel <= 0.02 ? 0.8 : rel <= 0.1 ? 0.5 : 0
      const nm = Math.max(nameScore(it.name, r.payee), nameScore(it.name, r.desc ?? ''))
      return { row: r, score: amountScore * 0.65 + nm * 0.35, amountDiff: r.amount - exp, amountScore }
    })
    // An amount that is nowhere near, with a name that does not match either, is not this bill.
    .filter(c => c.amountScore > 0 || c.score >= 0.5)
    .sort((a, b) => b.score - a.score)

  for (const it of mine) {
    const hits = candidates(it).filter(c => c.score >= 0.45)
    if (hits.length === 0) { missing.push(it); continue }
    const best = hits[0]
    used.add(best.row.id)
    matched.push({ row: best.row, item: it, score: best.score, amountDiff: best.amountDiff })
    // A second debit of nearly the same amount, in the same month, is worth a look.
    const alsoExact = hits.slice(1).filter(c => Math.abs(c.amountDiff) < 0.51 && !used.has(c.row.id))
    if (alsoExact.length) {
      alsoExact.forEach(c => used.add(c.row.id))
      duplicates.push({ item: it, rows: [best.row, ...alsoExact.map(c => c.row)] })
    }
  }

  return {
    matched,
    missing,
    duplicates,
    drift: matched.filter(m => Math.abs(m.amountDiff) > 0.5),
    unmatchedRows: debits.filter(r => !used.has(r.id)),
  }
}
