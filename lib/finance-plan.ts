// ============================================================
// lib/finance-plan.ts
//
// The planning layer on top of the ledger in finance-data.ts. Nothing in
// here stores anything: every figure is worked out from the one document,
// so a what-if can never leak into the real sheet and a balance can never
// drift from the expenses that produced it.
//
//   · accounts and the monthly rollover (opening → closing → next opening)
//   · Available Money — the one number — and Safe-to-Spend
//   · "Can I afford it?" — cash against EMI
//   · the health timeline and the what-if engine
//   · goals as buckets, surplus allocation, allowances
//   · anomalies and financial memory
//
// `viewer` is an entity id for a person, or null for the household, which
// means the common account — the only money the family admin can see.
// ============================================================

import {
  type FinanceDoc, type Item, type IncomeItem, type Account, type Goal, type AllocRule, type AllocLine,
  type Allowance, type SavingItem,
  monthView, monthKey, addMonths, monthsBetween, shares, bearerShares, computeSettlement, categoryOf,
  amortise, simulatePrepay, loanView, INR, monthLabel,
} from '@/lib/finance-data'

const today = () => new Date().toISOString().slice(0, 10)
const ownerOf = (viewer: string | null) => viewer ?? 'common'

// ----- accounts -------------------------------------------------

export const ACCOUNT_TYPE_LABEL: Record<Account['type'], string> = { bank: 'Bank', cash: 'Cash', wallet: 'Wallet', card: 'Credit card' }

/** The accounts a viewer's money lives in. */
export function accountsOf(doc: FinanceDoc, viewer: string | null, includeArchived = false): Account[] {
  const o = ownerOf(viewer)
  return (doc.accounts ?? []).filter(a => a.owner === o && (includeArchived || !a.archived))
}

/** Where anything not tagged to an account goes: the owner's primary account,
 *  else their first non-card account, else whatever they have. */
export function primaryAccount(doc: FinanceDoc, owner: string): Account | undefined {
  const mine = (doc.accounts ?? []).filter(a => a.owner === owner && !a.archived)
  return mine.find(a => a.primary) ?? mine.find(a => a.type !== 'card') ?? mine[0]
}

export function itemAccount(doc: FinanceDoc, it: Item): string | undefined {
  if (it.account && (doc.accounts ?? []).some(a => a.id === it.account)) return it.account
  return primaryAccount(doc, it.paidBy)?.id
}
export function incomeAccount(doc: FinanceDoc, inc: IncomeItem): string | undefined {
  if (inc.account && (doc.accounts ?? []).some(a => a.id === inc.account)) return inc.account
  return primaryAccount(doc, inc.entity)?.id
}

/** A recurring bill this month that has not been ticked off yet. It is money
 *  that is still in the account, but already spoken for. */
export function isPending(it: Item, k: string, now: string = monthKey(), day: string = today()): boolean {
  if (k !== now) return k > now
  if (it.paid) return false
  if (it.src === 'template') return true
  return !!it.date && it.date > day
}

export interface AccountMonth {
  key: string
  opening: number
  income: number
  transfersIn: number
  expenses: number
  transfersOut: number
  computed: number        // what the entries say the month closed at
  closing: number         // the checkpoint if one was recorded, else `computed`
  checkpoint?: number
  unrecorded: number      // checkpoint minus computed — money that moved without an entry
  pending: number         // this month's bills not yet marked paid (inside `expenses`)
}

/**
 * The month-by-month rollover for a set of accounts, from each account's
 * opening month up to `upto`. September's closing is October's opening.
 */
export function accountLedgers(doc: FinanceDoc, accounts: Account[], upto: string = monthKey()): Record<string, AccountMonth[]> {
  const out: Record<string, AccountMonth[]> = {}
  if (!accounts.length) return out
  const start = accounts.reduce((m, a) => (a.openingMonth < m ? a.openingMonth : m), accounts[0].openingMonth)
  const ids = new Set(accounts.map(a => a.id))
  const bal: Record<string, number> = {}
  const now = monthKey()
  for (let k = start; k <= upto; k = addMonths(k, 1)) {
    const m = monthView(doc, k)
    const flow: Record<string, { inc: number; exp: number; tin: number; tout: number; pend: number }> = {}
    const f = (id: string) => (flow[id] ??= { inc: 0, exp: 0, tin: 0, tout: 0, pend: 0 })
    for (const it of m.items) {
      const acc = itemAccount(doc, it)
      if (!acc || !ids.has(acc)) continue
      f(acc).exp += it.amount || 0
      if (isPending(it, k, now)) f(acc).pend += it.amount || 0
    }
    for (const inc of m.income) {
      const acc = incomeAccount(doc, inc)
      if (acc && ids.has(acc)) f(acc).inc += inc.amount || 0
    }
    for (const t of doc.transfers ?? []) {
      if (t.month !== k) continue
      if (ids.has(t.from)) f(t.from).tout += t.amount || 0
      if (ids.has(t.to)) f(t.to).tin += t.amount || 0
    }
    for (const a of accounts) {
      if (k < a.openingMonth) continue
      const opening = k === a.openingMonth ? a.opening : (bal[a.id] ?? 0)
      const x = f(a.id)
      const computed = opening + x.inc + x.tin - x.exp - x.tout
      const cp = a.checkpoints?.[k]
      // A checkpoint in the running month is the balance the bank shows TODAY,
      // before the bills still to go out; in a past month it is the close.
      const live = k === now
      const closing = cp == null ? computed : live ? cp - x.pend : cp
      const unrecorded = cp == null ? 0 : live ? cp - (computed + x.pend) : cp - computed
      bal[a.id] = closing
      ;(out[a.id] ??= []).push({
        key: k, opening, income: x.inc, transfersIn: x.tin, expenses: x.exp, transfersOut: x.tout,
        computed, closing, checkpoint: cp, unrecorded, pending: x.pend,
      })
    }
  }
  return out
}

/** Each account as it stands right now: the projected close of this month,
 *  less the bills that have not gone out yet. */
export function balancesNow(doc: FinanceDoc, accounts: Account[]): Record<string, { now: number; close: number; pending: number }> {
  const led = accountLedgers(doc, accounts, monthKey())
  const out: Record<string, { now: number; close: number; pending: number }> = {}
  for (const a of accounts) {
    const last = led[a.id]?.[led[a.id].length - 1]
    if (!last) { out[a.id] = { now: a.opening, close: a.opening, pending: 0 }; continue }
    // Bills not yet paid are still sitting in the account.
    out[a.id] = { now: last.closing + last.pending, close: last.closing, pending: last.pending }
  }
  return out
}

// ----- savings: what can actually be drawn on -------------------

const LOCKED = /(ppf|epf|pf\b|nps|gold|sgb|property|land|stock|share|equity|mf\b|mutual|elss|ulip|insurance|bond|crypto|pension)/i
export function isLiquid(s: SavingItem): boolean {
  if (s.liquid != null) return s.liquid
  return !LOCKED.test(`${s.kind ?? ''} ${s.label}`)
}

// ----- Available Money ------------------------------------------

export interface AvailableMoney {
  hasAccounts: boolean
  bank: number
  cash: number
  savingsAvailable: number
  investments: number           // locked away — shown for context, not counted
  cardPayable: number           // positive: what the cards are owed
  reserved: number              // this month's bills not yet marked paid
  owedOut: number               // settlement dues still to pay
  owedIn: number                // settlement dues others still owe you (not counted)
  goalsEarmarked: number        // already set aside in goal buckets (inside the figures above)
  gross: number                 // bank + cash + savings available
  available: number             // gross − cards − reserved − owed out
  pendingItems: { name: string; amount: number }[]
  byAccount: { account: Account; now: number; pending: number }[]
}

export function availableMoney(doc: FinanceDoc, viewer: string | null, k: string = monthKey()): AvailableMoney {
  const accs = accountsOf(doc, viewer)
  const bal = balancesNow(doc, accs)
  let bank = 0, cash = 0, cardPayable = 0
  const byAccount = accs.map(a => ({ account: a, now: bal[a.id]?.now ?? a.opening, pending: bal[a.id]?.pending ?? 0 }))
  for (const { account: a, now } of byAccount) {
    if (a.type === 'card') cardPayable += Math.max(0, -now)
    else if (a.type === 'cash') cash += now
    else bank += now
  }
  const mine = viewer ? doc.savings.filter(s => s.entity === viewer) : []
  const savingsAvailable = mine.filter(isLiquid).reduce((a, s) => a + (s.balance || 0), 0)
  const investments = mine.filter(s => !isLiquid(s)).reduce((a, s) => a + (s.balance || 0), 0)

  // Bills still to go out this month from this viewer's money.
  const m = monthView(doc, k)
  const ids = new Set(accs.map(a => a.id))
  const o = ownerOf(viewer)
  const pendingItems = m.items
    .filter(it => isPending(it, k) && (ids.size ? ids.has(itemAccount(doc, it) ?? '') : it.paidBy === o))
    .map(it => ({ name: it.name || 'Bill', amount: it.amount || 0 }))
    .sort((a, b) => b.amount - a.amount)
  const reserved = pendingItems.reduce((a, x) => a + x.amount, 0)

  // What is still owed in the settlement — this month and anything carried in.
  let owedOut = 0, owedIn = 0
  if (viewer) {
    for (const tr of computeSettlement(doc, k).transfers) {
      if (tr.from === viewer) owedOut += tr.due
      if (tr.to === viewer) owedIn += tr.due
    }
  }
  const goalsEarmarked = (doc.goals ?? []).filter(g => !g.archived && g.owner === (viewer ?? 'household')).reduce((a, g) => a + (g.saved || 0), 0)
  const gross = bank + cash + savingsAvailable
  return {
    hasAccounts: accs.length > 0, bank, cash, savingsAvailable, investments, cardPayable, reserved, owedOut, owedIn,
    goalsEarmarked, gross, available: gross - cardPayable - reserved - owedOut, pendingItems, byAccount,
  }
}

// ----- goals ----------------------------------------------------

export interface GoalStatus {
  goal: Goal
  remaining: number
  pct: number
  monthsLeft: number | null     // months to the target date, this one included
  required: number | null       // a month, to hit the date
  planned: number
  shortBy: number               // a month; 0 when on track
  reachBy: string | null        // at the planned rate
  done: boolean
  message: string
}

export function goalStatus(g: Goal, k: string = monthKey()): GoalStatus {
  const remaining = Math.max(0, (g.target || 0) - (g.saved || 0))
  const pct = g.target > 0 ? Math.min(100, ((g.saved || 0) / g.target) * 100) : 0
  const planned = Math.max(0, g.monthly ?? 0)
  const done = remaining < 0.5
  const monthsLeft = g.targetDate ? Math.max(1, monthsBetween(k, g.targetDate.slice(0, 7))) : null
  const required = monthsLeft != null ? remaining / monthsLeft : null
  const shortBy = required != null ? Math.max(0, required - planned) : 0
  const reachBy = done ? k : planned > 0 ? addMonths(k, Math.ceil(remaining / planned) - 1) : null
  const by = g.targetDate ? monthLabel(g.targetDate.slice(0, 7)) : null
  let message: string
  if (done) message = `${g.name} is fully funded.`
  else if (required != null && g.targetDate && g.targetDate.slice(0, 7) < k) message = `The target date has passed with ${INR(remaining)} still to go.`
  else if (required != null && shortBy > 0.5) message = planned > 0
    ? `You’re ${INR(shortBy)}/month short of reaching ${g.name} by ${by}.`
    : `Put aside ${INR(required)}/month to reach ${g.name} by ${by}.`
  else if (required != null) message = `On track — ${INR(planned)}/month gets you there${reachBy ? ` by ${monthLabel(reachBy)}` : ''}.`
  else if (reachBy) message = `At ${INR(planned)}/month you’ll get there by ${monthLabel(reachBy)}.`
  else message = `Set a monthly amount or a target date to plan this goal.`
  return { goal: g, remaining, pct, monthsLeft, required, planned, shortBy, reachBy, done, message }
}

/** What the viewer's goals ask for each month, less anything already put in this month. */
export function goalsDueThisMonth(doc: FinanceDoc, viewer: string | null, k: string = monthKey()): number {
  const owner = viewer ?? 'household'
  return (doc.goals ?? []).filter(g => !g.archived && g.owner === owner).reduce((sum, g) => {
    const st = goalStatus(g, k)
    if (st.done) return sum
    const want = Math.max(st.planned, st.required ?? 0)
    const inThisMonth = (g.contributions ?? []).filter(c => c.month === k).reduce((a, c) => a + c.amount, 0)
    return sum + Math.max(0, want - inThisMonth)
  }, 0)
}

// ----- Safe to spend --------------------------------------------

export interface SafeToSpend { available: number; goals: number; safe: number; daysLeft: number; perDay: number }
export function safeToSpend(doc: FinanceDoc, viewer: string | null, k: string = monthKey()): SafeToSpend {
  const am = availableMoney(doc, viewer, k)
  const goals = goalsDueThisMonth(doc, viewer, k)
  const safe = am.available - goals
  const d = new Date()
  const daysLeft = Math.max(1, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1)
  return { available: am.available, goals, safe, daysLeft, perDay: Math.max(0, safe) / daysLeft }
}

// ----- the month-by-month projection ----------------------------

export interface ProjMonth {
  key: string
  income: number
  recurring: number     // regular monthly bills (and, for a person, their common top-up)
  emi: number
  annual: number
  other: number         // one-offs already entered for that month
  goals: number         // planned goal contributions
  outflow: number       // recurring + emi + annual + other
  surplus: number       // income − outflow − goals
}

/** One month as the viewer will feel it. A person carries their share of what
 *  they and others pay (the settlement evens it out) plus their part of the
 *  common shortfall; the household is the common account itself. */
export function projectMonth(doc: FinanceDoc, viewer: string | null, k: string, goalsPerMonth = 0): ProjMonth {
  const m = monthView(doc, k)
  let income = 0, recurring = 0, emi = 0, annual = 0, other = 0
  const add = (it: Item, amt: number) => {
    if (it.kind === 'emi') emi += amt
    else if (it.kind === 'annual') annual += amt
    else if (it.kind === 'monthly') recurring += amt
    else other += amt
  }
  if (viewer) {
    income = m.income.filter(i => i.entity === viewer).reduce((a, i) => a + (i.amount || 0), 0)
    for (const it of m.items) {
      if (it.paidBy === 'common') continue
      const f = shares(it)[viewer] ?? 0
      if (f > 0) add(it, (it.amount || 0) * f)
    }
    const s = computeSettlement(doc, k)
    if (s.contributors.includes(viewer)) recurring += s.perContributor
  } else {
    income = m.income.filter(i => i.entity === 'common').reduce((a, i) => a + (i.amount || 0), 0)
    for (const it of m.items) if (it.paidBy === 'common') add(it, it.amount || 0)
  }
  const outflow = recurring + emi + annual + other
  return { key: k, income, recurring, emi, annual, other, goals: goalsPerMonth, outflow, surplus: income - outflow - goalsPerMonth }
}

export function goalsPlannedPerMonth(doc: FinanceDoc, viewer: string | null): number {
  const owner = viewer ?? 'household'
  return (doc.goals ?? []).filter(g => !g.archived && g.owner === owner && (g.saved || 0) < g.target)
    .reduce((a, g) => a + Math.max(0, g.monthly ?? 0), 0)
}

/** The next `n` months after this one. */
export function projection(doc: FinanceDoc, viewer: string | null, n = 12, from: string = monthKey()): ProjMonth[] {
  const goals = goalsPlannedPerMonth(doc, viewer)
  return Array.from({ length: n }, (_, i) => projectMonth(doc, viewer, addMonths(from, i + 1), goals))
}

/** Liquid cash to start a projection from: what is available now once this
 *  month's remaining bills and dues are paid. */
export function startingCash(doc: FinanceDoc, viewer: string | null): number {
  const am = availableMoney(doc, viewer)
  return am.bank + am.cash + am.savingsAvailable - am.cardPayable - am.reserved - am.owedOut
}

// ----- the health timeline --------------------------------------

export interface Horizon {
  label: string
  months: number
  income: number
  recurring: number
  emi: number
  annual: number
  goals: number
  surplus: number
  cash: number          // expected cash balance at the end of it
  savings: number       // expected in goal buckets by then
  lowest: number        // the lowest month-end balance on the way
}

export function healthTimeline(doc: FinanceDoc, viewer: string | null): { start: number; saved: number; rows: Horizon[]; months: ProjMonth[] } {
  const months = projection(doc, viewer, 12)
  const start = startingCash(doc, viewer)
  const saved = (doc.goals ?? []).filter(g => !g.archived && g.owner === (viewer ?? 'household')).reduce((a, g) => a + (g.saved || 0), 0)
  const spans: [string, number][] = [['Today', 0], ['30 days', 1], ['3 months', 3], ['6 months', 6], ['1 year', 12]]
  const rows = spans.map(([label, n]) => {
    const part = months.slice(0, n)
    const sum = (f: (p: ProjMonth) => number) => part.reduce((a, p) => a + f(p), 0)
    let cash = start, lowest = start
    for (const p of part) { cash += p.surplus; lowest = Math.min(lowest, cash) }
    return {
      label, months: n,
      income: sum(p => p.income), recurring: sum(p => p.recurring + p.other), emi: sum(p => p.emi), annual: sum(p => p.annual),
      goals: sum(p => p.goals), surplus: sum(p => p.surplus), cash, savings: saved + sum(p => p.goals), lowest,
    }
  })
  return { start, saved, rows, months }
}

// ----- "Can I afford it?" ---------------------------------------

export function emiFor(principal: number, annualRate: number, months: number): number {
  if (!(principal > 0) || !(months > 0)) return 0
  const r = annualRate / 12 / 100
  if (r <= 0) return principal / months
  const f = Math.pow(1 + r, months)
  return principal * r * f / (f - 1)
}

export interface AffordResult {
  price: number
  balance: number          // liquid money now
  upcoming: number         // this month's unpaid bills, dues, and yearly bills within 60 days
  upcomingParts: { label: string; amount: number }[]
  savingsTarget: number    // goal money due this month
  safeBefore: number
  cash: { safeAfter: number; monthEndBefore: number; monthEndAfter: number; verdict: 'yes' | 'tight' | 'no' }
  emi?: {
    months: number; rate: number; down: number; emi: number; interest: number; total: number
    safeAfter: number; surplusBefore: number; surplusAfter: number
    emiLoadBefore: number; emiLoadAfter: number    // EMIs as a share of income, %
    verdict: 'yes' | 'tight' | 'no'
  }
}

export function affordCheck(doc: FinanceDoc, viewer: string | null, price: number, opts?: { months?: number; rate?: number; down?: number }): AffordResult {
  const k = monthKey()
  const am = availableMoney(doc, viewer, k)
  const balance = am.bank + am.cash + am.savingsAvailable - am.cardPayable
  // Yearly bills that land within the next two months, at the viewer's share.
  const soon: { label: string; amount: number }[] = []
  for (const key of [addMonths(k, 1), addMonths(k, 2)]) {
    const p = projectMonth(doc, viewer, key)
    if (p.annual > 0.5) soon.push({ label: `Yearly bills in ${monthLabel(key)}`, amount: p.annual })
  }
  const upcomingParts = [
    ...(am.reserved > 0.5 ? [{ label: 'Bills this month not yet paid', amount: am.reserved }] : []),
    ...(am.owedOut > 0.5 ? [{ label: 'Settlement you still owe', amount: am.owedOut }] : []),
    ...soon,
  ]
  const upcoming = upcomingParts.reduce((a, x) => a + x.amount, 0)
  const savingsTarget = goalsDueThisMonth(doc, viewer, k)
  const safeBefore = balance - upcoming - savingsTarget
  const thisMonth = projectMonth(doc, viewer, k)
  const verdict = (after: number, before: number): 'yes' | 'tight' | 'no' =>
    after < 0 ? 'no' : after < Math.max(5000, before * 0.1) ? 'tight' : 'yes'
  const safeAfter = safeBefore - price
  const res: AffordResult = {
    price, balance, upcoming, upcomingParts, savingsTarget, safeBefore,
    cash: { safeAfter, monthEndBefore: thisMonth.surplus, monthEndAfter: thisMonth.surplus - price, verdict: verdict(safeAfter, safeBefore) },
  }
  if (opts?.months && opts.months > 0) {
    const down = Math.max(0, Math.min(price, opts.down ?? 0))
    const rate = Math.max(0, opts.rate ?? 0)
    const emi = emiFor(price - down, rate, opts.months)
    const total = down + emi * opts.months
    const next = projectMonth(doc, viewer, addMonths(k, 1))
    const surplusBefore = next.surplus
    const surplusAfter = surplusBefore - emi
    const inc = next.income || 0
    const after = safeBefore - down
    res.emi = {
      months: opts.months, rate, down, emi, interest: total - price, total,
      safeAfter: after, surplusBefore, surplusAfter,
      emiLoadBefore: inc > 0 ? (next.emi / inc) * 100 : 0,
      emiLoadAfter: inc > 0 ? ((next.emi + emi) / inc) * 100 : 0,
      verdict: after < 0 || surplusAfter < 0 ? 'no' : surplusAfter < Math.max(3000, inc * 0.1) || (inc > 0 && (next.emi + emi) / inc > 0.45) ? 'tight' : 'yes',
    }
  }
  return res
}

// ----- the what-if engine ---------------------------------------

export type ScenarioChange =
  | { id: string; type: 'income'; label?: string; amount: number; from: number; months: number }      // + or − a month
  | { id: string; type: 'expense'; label?: string; amount: number; from: number; months: number }     // + or − a month
  | { id: string; type: 'purchase'; label?: string; amount: number; at: number }                       // a one-time outflow
  | { id: string; type: 'loan'; label?: string; principal: number; rate: number; tenure: number; down: number; at: number }
  | { id: string; type: 'prepay'; label?: string; loanId: string; amount: number; at: number }
// `from` / `at` are month offsets: 0 is next month.

export interface ScenarioRow { key: string; baseNet: number; scenNet: number; baseCash: number; scenCash: number }
export interface ScenarioResult {
  rows: ScenarioRow[]
  start: number
  baseEnd: number
  scenEnd: number
  lowest: { key: string; cash: number } | null
  firstNegative: string | null
  notes: string[]
}

export function runScenario(doc: FinanceDoc, viewer: string | null, changes: ScenarioChange[], n = 24): ScenarioResult {
  const base = projection(doc, viewer, n)
  const start = startingCash(doc, viewer)
  const delta = new Array(n).fill(0)
  const notes: string[] = []
  const inRange = (i: number) => i >= 0 && i < n
  for (const c of changes) {
    if (c.type === 'income' || c.type === 'expense') {
      const sign = c.type === 'income' ? 1 : -1
      const end = c.months > 0 ? c.from + c.months : n
      for (let i = Math.max(0, c.from); i < Math.min(n, end); i++) delta[i] += sign * c.amount
    } else if (c.type === 'purchase') {
      if (inRange(c.at)) delta[c.at] -= c.amount
    } else if (c.type === 'loan') {
      const emi = emiFor(Math.max(0, c.principal - c.down), c.rate, c.tenure)
      if (inRange(c.at)) delta[c.at] -= c.down
      for (let i = c.at + 1; i < Math.min(n, c.at + 1 + c.tenure); i++) delta[i] -= emi
      const interest = emi * c.tenure - Math.max(0, c.principal - c.down)
      notes.push(`${c.label || 'The new loan'}: EMI ${INR(emi)} for ${c.tenure} months, ${INR(interest)} in interest.`)
    } else if (c.type === 'prepay') {
      const loan = doc.template.emis.find(e => e.id === c.loanId)
      if (!loan) continue
      const frac = viewer ? (shares(loan)[viewer] ?? 0) : 1
      const at = addMonths(monthKey(), c.at + 1)
      const sim = simulatePrepay(loan, { lump: c.amount / (frac || 1), from: at })
      if (inRange(c.at)) delta[c.at] -= c.amount
      if (sim && sim.clears) {
        // Same EMI, shorter loan: the instalments after the new end simply stop.
        const baseEnd = loanView(loan, at).endsOn
        const newEnd = sim.endsOn
        if (baseEnd && newEnd) {
          const emi = (loan.amount || 0) * frac
          for (let i = 0; i < n; i++) {
            const key = addMonths(monthKey(), i + 1)
            if (key > newEnd && key <= baseEnd) delta[i] += emi
          }
        }
        notes.push(`Prepaying ${loan.name}: ${sim.monthsSaved} fewer instalments, ${INR(sim.interestSaved * frac)} less interest${sim.endsOn ? `, done by ${monthLabel(sim.endsOn)}` : ''}.`)
      } else notes.push(`${loan.name} needs the amount borrowed and tenure recorded to simulate a prepayment.`)
    }
  }
  let bc = start, sc = start
  let lowest: { key: string; cash: number } | null = null
  let firstNegative: string | null = null
  const rows = base.map((p, i) => {
    const scenNet = p.surplus + delta[i]
    bc += p.surplus; sc += scenNet
    if (!lowest || sc < lowest.cash) lowest = { key: p.key, cash: sc }
    if (sc < 0 && !firstNegative) firstNegative = p.key
    return { key: p.key, baseNet: p.surplus, scenNet, baseCash: bc, scenCash: sc }
  })
  return { rows, start, baseEnd: bc, scenEnd: sc, lowest, firstNegative, notes }
}

// ----- surplus allocation ---------------------------------------

export function monthSurplus(doc: FinanceDoc, viewer: string | null, k: string): number {
  return projectMonth(doc, viewer, k).surplus
}

/** The rules to use: the owner's own, or a sensible default built from their goals. */
export function allocRulesFor(doc: FinanceDoc, owner: string): AllocRule[] {
  const own = doc.allocRules?.[owner]
  if (own && own.length) return own
  const goals = (doc.goals ?? []).filter(g => !g.archived && g.owner === owner && g.saved < g.target)
  const emergency = goals.find(g => g.kind === 'emergency') ?? goals[0]
  const next = goals.find(g => g !== emergency)
  const rules: AllocRule[] = []
  if (emergency) rules.push({ target: emergency.id, pct: next ? 50 : 70 })
  if (next) rules.push({ target: next.id, pct: 20 })
  rules.push({ target: 'invest', pct: 20 })
  rules.push({ target: 'carry', pct: goals.length ? 10 : 80 })
  return rules
}

export function proposeAllocation(doc: FinanceDoc, owner: string, surplus: number, rules: AllocRule[] = allocRulesFor(doc, owner)): AllocLine[] {
  const total = rules.reduce((a, r) => a + Math.max(0, r.pct), 0) || 1
  const label = (t: string) => t === 'carry' ? 'Carry forward' : t === 'invest' ? 'Investments' : (doc.goals ?? []).find(g => g.id === t)?.name ?? 'Goal'
  const lines = rules.filter(r => r.pct > 0).map(r => ({ target: r.target, label: label(r.target), amount: Math.floor((Math.max(0, surplus) * r.pct) / total) }))
  // Rounding dust goes to carry-forward so the lines add up exactly.
  const dust = Math.max(0, Math.floor(surplus)) - lines.reduce((a, l) => a + l.amount, 0)
  if (dust > 0) {
    const carry = lines.find(l => l.target === 'carry')
    if (carry) carry.amount += dust
    else lines.push({ target: 'carry', label: 'Carry forward', amount: dust })
  }
  return lines
}

// ----- allowances -----------------------------------------------

export interface AllowanceStatus {
  allowance: Allowance
  spent: number
  remaining: number
  byCategory: { name: string; spent: number; limit?: number }[]
  saved: number                 // unspent from earlier months, accrued since it started
  items: { name: string; amount: number; date?: string | null }[]
  pendingApprovals: number
}

export function allowanceStatus(doc: FinanceDoc, a: Allowance, k: string = monthKey()): AllowanceStatus {
  const spentIn = (key: string) => {
    const m = monthView(doc, key)
    const rows: { name: string; amount: number; cat: string; date?: string | null }[] = []
    for (const it of m.items) {
      const f = bearerShares(it)[a.entity] ?? 0
      if (f > 0) rows.push({ name: it.name, amount: (it.amount || 0) * f, cat: categoryOf(it), date: it.date })
    }
    return rows
  }
  const rows = spentIn(k)
  const spent = rows.reduce((s, r) => s + r.amount, 0)
  const cats = new Map<string, number>()
  for (const r of rows) cats.set(r.cat, (cats.get(r.cat) ?? 0) + r.amount)
  for (const c of Object.keys(a.categoryLimits ?? {})) if (!cats.has(c)) cats.set(c, 0)
  let saved = 0
  for (let key = a.startMonth; key < k; key = addMonths(key, 1)) {
    saved += Math.max(0, a.monthly - spentIn(key).reduce((s, r) => s + r.amount, 0))
    if (monthsBetween(a.startMonth, key) > 60) break
  }
  const pendingApprovals = (doc.proposals ?? []).filter(p => (bearerShares(p.item)[a.entity] ?? 0) > 0 && p.approvers.some(x => a.approvers.includes(x))).length
  return {
    allowance: a, spent, remaining: a.monthly - spent,
    byCategory: [...cats.entries()].map(([name, v]) => ({ name, spent: v, limit: a.categoryLimits?.[name] })).sort((x, y) => y.spent - x.spent),
    saved, items: rows.map(r => ({ name: r.name, amount: r.amount, date: r.date })).sort((x, y) => y.amount - x.amount), pendingApprovals,
  }
}

// ----- who paid vs who owns -------------------------------------

export interface PaidOwned { entity: string; paid: number; owns: number; net: number }
/** For a month: what each person actually paid, what they own, and the gap
 *  the settlement closes. Common-account spending is the household's. */
export function paidVsOwned(doc: FinanceDoc, k: string): PaidOwned[] {
  const m = monthView(doc, k)
  const persons = doc.entities.filter(e => e.kind === 'person').map(e => e.id)
  const paid: Record<string, number> = {}, owns: Record<string, number> = {}
  for (const it of m.items) {
    if (it.paidBy === 'common') continue
    paid[it.paidBy] = (paid[it.paidBy] ?? 0) + (it.amount || 0)
    for (const [id, f] of Object.entries(shares(it))) owns[id] = (owns[id] ?? 0) + (it.amount || 0) * f
  }
  return [...persons, 'common'].filter(id => (paid[id] ?? 0) > 0.5 || (owns[id] ?? 0) > 0.5)
    .map(id => ({ entity: id, paid: paid[id] ?? 0, owns: owns[id] ?? 0, net: (paid[id] ?? 0) - (owns[id] ?? 0) }))
}

// ----- anomalies ------------------------------------------------

export interface Anomaly { id: string; kind: 'spike' | 'category' | 'new' | 'duplicate'; severity: 'high' | 'medium'; text: string; detail?: string; amount?: number }

const nameKey = (s: string) => (s || '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length > 2).slice(0, 3).join(' ')

/** The viewer's share of each item, or the whole of it for the household. */
const partOf = (it: Item, viewer: string | null) => viewer ? (it.amount || 0) * (bearerShares(it)[viewer] ?? 0) : (it.paidBy === 'common' ? (it.amount || 0) : 0)

export function detectAnomalies(doc: FinanceDoc, viewer: string | null, k: string = monthKey()): Anomaly[] {
  const out: Anomaly[] = []
  const cur = monthView(doc, k).items.filter(it => partOf(it, viewer) > 0.5)
  const hist = Array.from({ length: 12 }, (_, i) => addMonths(k, -(i + 1)))
    .filter(key => doc.months[key])                      // only months that were actually used
    .map(key => ({ key, items: monthView(doc, key).items.filter(it => partOf(it, viewer) > 0.5) }))
  const last6 = hist.slice(0, 6)

  // 1. A bill well above its own recent average (electricity, water, …).
  const byName = new Map<string, number[]>()
  for (const h of last6) {
    const seen = new Map<string, number>()
    for (const it of h.items) { const n = nameKey(it.name); if (n) seen.set(n, (seen.get(n) ?? 0) + (it.amount || 0)) }
    for (const [n, v] of seen) (byName.get(n) ?? byName.set(n, []).get(n)!).push(v)
  }
  const curByName = new Map<string, { amt: number; name: string }>()
  for (const it of cur) { const n = nameKey(it.name); if (n) { const x = curByName.get(n); curByName.set(n, { amt: (x?.amt ?? 0) + (it.amount || 0), name: it.name }) } }
  for (const [n, { amt, name }] of curByName) {
    const past = byName.get(n)
    if (!past || past.length < 3) continue
    const avg = past.reduce((a, b) => a + b, 0) / past.length
    if (avg > 0 && amt > avg * 1.25 && amt - avg >= 300 && past.some(v => Math.abs(v - past[0]) > 0.5)) {
      out.push({ id: `spike:${n}`, kind: 'spike', severity: amt > avg * 1.5 ? 'high' : 'medium', amount: amt - avg,
        text: `${name} is ${Math.round(((amt - avg) / avg) * 100)}% higher than its ${past.length}-month average.`,
        detail: `${INR(amt)} this month against ${INR(avg)} on average.` })
    }
  }

  // 2. A category running above its normal range.
  const catOf = (items: Item[]) => { const m = new Map<string, number>(); for (const it of items) m.set(categoryOf(it), (m.get(categoryOf(it)) ?? 0) + partOf(it, viewer)); return m }
  const curCat = catOf(cur)
  const pastCats = last6.map(h => catOf(h.items))
  if (pastCats.length >= 3) {
    for (const [c, v] of curCat) {
      if (c === 'Loans & EMIs' || c === 'Transfers') continue
      const vals = pastCats.map(m => m.get(c) ?? 0)
      // A category with no real history is a new payee's job, not a range's.
      if (vals.filter(v => v > 0.5).length < 3) continue
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      const sd = Math.sqrt(vals.reduce((a, b) => a + (b - avg) ** 2, 0) / vals.length)
      const top = Math.max(avg * 1.3, avg + 1.5 * sd, ...vals)
      if (v > top && v - top >= 1500) {
        out.push({ id: `cat:${c}`, kind: 'category', severity: v - top > 5000 ? 'high' : 'medium', amount: v - top,
          text: `${c} spending is ${INR(v - top)} above your normal monthly range.`,
          detail: `${INR(v)} so far; it has usually been ${INR(Math.min(...vals))}–${INR(Math.max(...vals))}.` })
      }
    }
  }

  // 3. A payee never seen in the last year.
  if (hist.length >= 2) {
    const known = new Set<string>()
    for (const h of hist) for (const it of h.items) known.add(nameKey(it.name))
    for (const it of cur) {
      if (it.src === 'template' || (it.amount || 0) < 1000) continue
      const n = nameKey(it.name)
      if (n && !known.has(n)) {
        out.push({ id: `new:${it.id}`, kind: 'new', severity: 'medium', amount: it.amount,
          text: `${it.name} appeared for the first time.`, detail: `${INR(it.amount)}${it.date ? ` on ${it.date}` : ''} — nothing like it in the last ${hist.length} months.` })
        known.add(n)
      }
    }
  }

  // 4. The same charge twice.
  const manual = cur.filter(it => it.src !== 'template' && (it.amount || 0) >= 100)
  const flagged = new Set<string>()
  for (let i = 0; i < manual.length; i++) for (let j = i + 1; j < manual.length; j++) {
    const a = manual[i], b = manual[j]
    if (flagged.has(a.id) || flagged.has(b.id)) continue
    if (Math.abs((a.amount || 0) - (b.amount || 0)) > 0.5) continue
    if (nameKey(a.name) !== nameKey(b.name)) continue
    if (a.date && b.date && Math.abs(new Date(a.date).getTime() - new Date(b.date).getTime()) > 4 * 86400000) continue
    flagged.add(a.id); flagged.add(b.id)
    out.push({ id: `dup:${a.id}`, kind: 'duplicate', severity: 'high', amount: a.amount,
      text: `You were charged ${INR(a.amount)} twice for ${a.name}.`, detail: [a.date, b.date].filter(Boolean).join(' and ') || 'Both in this month.' })
  }
  return out.sort((x, y) => (x.severity === y.severity ? (y.amount ?? 0) - (x.amount ?? 0) : x.severity === 'high' ? -1 : 1))
}

// ----- financial memory -----------------------------------------

export interface Memory {
  id: string
  text: string
  when?: string          // YYYY-MM it is expected next
  amount?: number
  soon: boolean          // lands within the next four months
  suggest?: { name: string; target: number; targetDate: string }
}

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const EVENT = /(diwali|holi|rakhi|eid|christmas|new year|lohri|gurpurab|birthday|anniversary|wedding|school|tuition|fees|admission|insurance|premium|property tax|vacation|trip|holiday|festival)/i

/** What the sheet remembers from last year, pointed at what is coming. */
export function financialMemory(doc: FinanceDoc, viewer: string | null, k: string = monthKey()): Memory[] {
  const out: Memory[] = []
  const nextOf = (mm: number) => { const [y, m] = k.split('-').map(Number); const year = mm >= m ? y : y + 1; return `${year}-${String(mm).padStart(2, '0')}` }
  const soon = (key: string) => monthsBetween(k, key) <= 4
  const past = Array.from({ length: 24 }, (_, i) => addMonths(k, -(i + 1))).filter(key => doc.months[key])

  // 1. Events: tags (e.g. "Diwali 2025") and one-off spending with an event-like name.
  const events = new Map<string, { label: string; total: number; months: Set<string> }>()
  for (const key of past.filter(x => monthsBetween(x, k) <= 13)) {
    for (const it of monthView(doc, key).items) {
      const amt = partOf(it, viewer)
      if (amt < 0.5) continue
      const labels = new Set<string>()
      for (const t of it.tags ?? []) labels.add(t.replace(/\b(19|20)\d{2}\b/g, '').trim())
      if (it.src !== 'template' && it.kind !== 'emi') { const m = (it.name || '').match(EVENT); if (m) labels.add(m[1].replace(/\b\w/g, c => c.toUpperCase())) }
      for (const l of labels) {
        if (!l) continue
        const e = events.get(l.toLowerCase()) ?? { label: l, total: 0, months: new Set<string>() }
        e.total += amt; e.months.add(key); events.set(l.toLowerCase(), e)
      }
    }
  }
  for (const e of events.values()) {
    if (e.total < 5000) continue
    const first = [...e.months].sort()[0]
    const when = nextOf(Number(first.slice(5, 7)))
    out.push({ id: `event:${e.label}`, amount: e.total, when, soon: soon(when),
      text: `Last year you spent ${INR(e.total)} on ${e.label} (${MON[Number(first.slice(5, 7)) - 1]}).`,
      suggest: { name: `${e.label} ${when.slice(0, 4)}`, target: Math.round(e.total * 1.05 / 500) * 500, targetDate: when } })
  }

  // 2. Yearly bills — what they usually come to, and when.
  for (const it of doc.template.annual) {
    const amt = viewer ? (it.paidBy === 'common' ? 0 : (it.amount || 0) * (shares(it)[viewer] ?? 0)) : (it.paidBy === 'common' ? it.amount || 0 : 0)
    if (amt < 1000 || !it.dueDate) continue
    const when = nextOf(Number(it.dueDate.slice(5, 7)))
    out.push({ id: `annual:${it.id}`, amount: amt, when, soon: soon(when),
      text: `Your ${it.name} is usually around ${INR(amt)}, due in ${MON[Number(it.dueDate.slice(5, 7)) - 1]}.`,
      suggest: { name: it.name, target: Math.round(amt), targetDate: when } })
  }

  // 3. Seasonal peaks in a bill that recurs (electricity peaking in summer).
  const series = new Map<string, { name: string; byMonth: Map<number, number[]> }>()
  for (const key of past) {
    for (const it of monthView(doc, key).items) {
      const amt = partOf(it, viewer)
      if (amt < 0.5 || it.kind === 'emi') continue
      const n = nameKey(it.name); if (!n) continue
      const s = series.get(n) ?? { name: it.name, byMonth: new Map() }
      const mm = Number(key.slice(5, 7))
      ;(s.byMonth.get(mm) ?? s.byMonth.set(mm, []).get(mm)!).push(amt)
      series.set(n, s)
    }
  }
  for (const s of series.values()) {
    if (s.byMonth.size < 6) continue
    const avgBy = [...s.byMonth.entries()].map(([mm, v]) => ({ mm, v: v.reduce((a, b) => a + b, 0) / v.length }))
    const overall = avgBy.reduce((a, b) => a + b.v, 0) / avgBy.length
    let best = { start: 0, v: 0 }
    for (let st = 1; st <= 12; st++) {
      const win = [0, 1, 2].map(o => avgBy.find(x => x.mm === ((st - 1 + o) % 12) + 1)?.v ?? 0)
      if (win.some(v => v === 0)) continue
      const v = win.reduce((a, b) => a + b, 0) / 3
      if (v > best.v) best = { start: st, v }
    }
    if (best.v > overall * 1.2 && best.v - overall >= 300) {
      const end = ((best.start + 1) % 12) + 1
      const when = nextOf(best.start)
      out.push({ id: `peak:${s.name}`, when, amount: (best.v - overall) * 3, soon: soon(when),
        text: `Your ${s.name.toLowerCase()} bill peaks between ${MON[best.start - 1]} and ${MON[end - 1]} — about ${INR(best.v - overall)} a month above usual.` })
    }
  }
  return out.sort((a, b) => (a.soon === b.soon ? (a.when ?? '9').localeCompare(b.when ?? '9') : a.soon ? -1 : 1))
}

// ----- loans handy for the what-if picker -----------------------
export function loansFor(doc: FinanceDoc, viewer: string | null): Item[] {
  return doc.template.emis.filter(it => (!viewer || (shares(it)[viewer] ?? 0) > 0.001) && amortise(it).length > 0)
}
