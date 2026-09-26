// ============================================================
// lib/deposits.ts
//
// Recurring and fixed deposits, worked out the way Indian banks work them.
//
//   RD  Interest compounds every quarter. Each monthly instalment earns
//       from the day it goes in, so the maturity value is the sum of every
//       instalment grown for the months it was held:
//         M = Σ R · (1 + r/4)^(months held / 3)
//       (this is the formula behind the SBI / post-office RD calculators).
//
//   FD  Cumulative: compounds quarterly, A = P · (1 + r/4)^(4t), with t in
//       years (days / 365). Deposits shorter than six months earn simple
//       interest instead, as banks pay them.
//       Payout: the interest is paid out monthly / quarterly / yearly and
//       the principal comes back at maturity.
//
// Everything is worked out from the dates, so "current value" moves on
// by itself day by day.
// ============================================================

export type FdPayout = 'cumulative' | 'monthly' | 'quarterly' | 'yearly'

export interface RdTerms { monthly: number; rate: number; start: string; months: number }
export interface FdTerms { principal: number; rate: number; start: string; maturity: string; payout: FdPayout }

const DAY = 86_400_000
const d = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`)
const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
const today = () => iso(new Date())

/** A date n months after another, kept to the same day where the month allows. */
export function addMonthsIso(start: string, n: number): string {
  const s = d(start)
  const t = new Date(s.getFullYear(), s.getMonth() + n, 1)
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
  t.setDate(Math.min(s.getDate(), last))
  return iso(t)
}
/** Whole months from one date to another (the tenure between start and end). */
export function monthsBetweenIso(a: string, b: string): number {
  const x = d(a), y = d(b)
  let m = (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth())
  if (y.getDate() < x.getDate()) m--
  return Math.max(0, m)
}
const monthsHeld = (from: string, to: string) => (d(to).getTime() - d(from).getTime()) / DAY / (365 / 12)

export interface RdView {
  maturityDate: string          // the day the deposit matures (a full tenure after the start)
  lastInstalment: string        // the date of the final monthly instalment
  installmentsPaid: number      // instalments made up to today
  deposited: number             // what has gone in so far
  totalDeposit: number          // what will have gone in by maturity
  currentValue: number          // today: deposits plus the interest they have earned
  maturityValue: number
  interest: number              // maturity − total deposit
  matured: boolean
}

export function rdView(t: RdTerms, on: string = today()): RdView {
  const n = Math.max(0, Math.round(t.months))
  const q = 1 + (t.rate || 0) / 400
  const maturityDate = addMonthsIso(t.start, n)
  const at = on < maturityDate ? on : maturityDate
  let maturityValue = 0, currentValue = 0, paid = 0
  for (let j = 0; j < n; j++) {
    const paidOn = addMonthsIso(t.start, j)
    maturityValue += t.monthly * Math.pow(q, (n - j) / 3)
    if (paidOn <= at) { paid++; currentValue += t.monthly * Math.pow(q, monthsHeld(paidOn, at) / 3) }
  }
  const totalDeposit = t.monthly * n
  return {
    maturityDate, lastInstalment: n ? addMonthsIso(t.start, n - 1) : t.start,
    installmentsPaid: paid, deposited: t.monthly * paid, totalDeposit,
    currentValue: on >= maturityDate ? maturityValue : currentValue,
    maturityValue, interest: maturityValue - totalDeposit, matured: on >= maturityDate,
  }
}

export interface FdView {
  days: number                  // the full term
  currentValue: number
  maturityValue: number
  interest: number              // total interest over the term
  payoutEach: number            // for a payout FD: the interest paid each period
  payoutLabel: string           // "a month", "a quarter", "a year", or "at maturity"
  simple: boolean               // under six months: simple interest
  matured: boolean
}

export function fdView(t: FdTerms, on: string = today()): FdView {
  const r = (t.rate || 0) / 100
  const days = Math.max(0, Math.round((d(t.maturity).getTime() - d(t.start).getTime()) / DAY))
  const years = days / 365
  const simple = days < 181
  const grow = (yrs: number) => (simple ? t.principal * (1 + r * yrs) : t.principal * Math.pow(1 + r / 4, 4 * yrs))
  const heldYears = Math.max(0, Math.min(days, (d(on).getTime() - d(t.start).getTime()) / DAY)) / 365
  if (t.payout === 'cumulative') {
    const maturityValue = grow(years)
    return { days, currentValue: grow(heldYears), maturityValue, interest: maturityValue - t.principal, payoutEach: 0, payoutLabel: 'at maturity', simple, matured: on >= t.maturity }
  }
  const per = { monthly: 12, quarterly: 4, yearly: 1 }[t.payout]
  const each = (t.principal * r) / per
  return {
    days, currentValue: t.principal, maturityValue: t.principal, interest: t.principal * r * years,
    payoutEach: each, payoutLabel: { monthly: 'a month', quarterly: 'a quarter', yearly: 'a year' }[t.payout],
    simple, matured: on >= t.maturity,
  }
}
