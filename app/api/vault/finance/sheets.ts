// ============================================================
// app/api/vault/finance/sheets.ts
//
// Builds a month sheet for one profile from exactly what that profile may
// see, and keeps it (lib/finance-sheet-store.ts). Used by the download
// route and by closing a month, which keeps a final copy for everybody.
// ============================================================

import { type FinanceDoc, monthView, computeSettlement, filterDocForMember } from '@/lib/finance-data'
import { monthWorkbook } from '@/lib/finance-sheet'
import { saveSheet, fingerprint } from '@/lib/finance-sheet-store'
import { viewFor } from './route'

/** What decides whether two copies of a month's sheet are the same. */
export const sheetContent = (view: FinanceDoc, mk: string) => ({
  m: monthView(view, mk), s: computeSettlement(view, mk), closed: !!view.settlements?.[mk]?.closed,
  log: (view.auditLog ?? []).filter(a => a.monthKey === mk).length,
})

export async function buildAndKeep(view: FinanceDoc, mk: string, o: { profile: string; profileName: string; viewer: string | null; by: string; final: boolean }) {
  const at = new Date()
  const body = await monthWorkbook(view, mk, { profileName: o.profileName, viewer: o.viewer, by: o.by, at, final: o.final })
  const key = await saveSheet({ profile: o.profile, profileName: o.profileName, month: mk, final: o.final, hash: fingerprint(sheetContent(view, mk)), body })
  return { body, key }
}

/** On closing a month: a final copy for every person, and for the household. */
export async function keepFinalSheets(doc: FinanceDoc, mk: string, by: string): Promise<number> {
  let kept = 0
  const household = viewFor({ u: 'system', r: 'super', e: null, exp: 0 }, doc)
  await buildAndKeep(household, mk, { profile: 'household', profileName: 'Household', viewer: null, by, final: true }); kept++
  for (const p of doc.entities.filter(e => e.kind === 'person')) {
    await buildAndKeep(filterDocForMember(doc, p.id), mk, { profile: p.id, profileName: p.name, viewer: p.id, by, final: true }); kept++
  }
  return kept
}
