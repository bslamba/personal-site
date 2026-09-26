'use client'

// ============================================================
// components/vault/finance-sheets.tsx
//
// "Sheet" on the This month tab: download any month as an Excel workbook
// (opens in Excel, Google Sheets and Numbers) or a CSV, and reach every
// copy this profile has ever kept — including the final copy taken when a
// month was closed. Kept copies are never deleted.
// ============================================================

import { useEffect, useState } from 'react'
import { FileSpreadsheet, Download, Loader2, Lock, X, FileText } from 'lucide-react'
import { monthLabel } from '@/lib/finance-data'

interface Saved { key: string; name: string; month: string; final: boolean; at: string; size: number }

const q = (actingAs?: string | null) => (actingAs ? `&as=${encodeURIComponent(actingAs)}` : '')

/** Save a response as a file, using the name the server gave it. */
async function saveResponse(r: Response, fallback: string) {
  const blob = await r.blob()
  const cd = r.headers.get('Content-Disposition') ?? ''
  const name = cd.match(/filename="([^"]+)"/)?.[1] ?? fallback
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function SheetButton({ k, actingAs, compact }: { k: string; actingAs?: string | null; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="vg-btn" onClick={() => setOpen(true)} title="Download this month as a spreadsheet">
        <FileSpreadsheet className="h-4 w-4" /> {compact ? 'Sheet' : <><span className="vg-lg">Download sheet</span><span className="vg-sm">Sheet</span></>}
      </button>
      {open && <SheetDialog initial={k} actingAs={actingAs} onClose={() => setOpen(false)} />}
    </>
  )
}

function SheetDialog({ initial, actingAs, onClose }: { initial: string; actingAs?: string | null; onClose: () => void }) {
  const [mk, setMk] = useState(initial)
  const [all, setAll] = useState(false)
  const [busy, setBusy] = useState<'xlsx' | 'csv' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [list, setList] = useState<Saved[] | null>(null)
  const [profile, setProfile] = useState('')

  const [nonce, setNonce] = useState(0)          // bumped to re-read the list after a download
  const reload = () => setNonce(n => n + 1)
  useEffect(() => {
    let live = true                               // a slower, older answer never overwrites a newer one
    fetch(`/api/vault/finance/sheet?${all ? '' : `month=${mk}`}${q(actingAs)}`)
      .then(async r => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (!live) return
        if (!ok) { setErr(d.error ?? 'Could not list the saved sheets.'); setList([]); return }
        setList(d.sheets ?? []); setProfile(d.profileName ?? '')
      })
      .catch(() => { if (live) { setErr('Could not reach the server.'); setList([]) } })
    return () => { live = false }
  }, [mk, all, actingAs, nonce])

  async function download(format: 'xlsx' | 'csv') {
    setBusy(format); setErr(null)
    try {
      const r = await fetch('/api/vault/finance/sheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: mk, format, actingAs: actingAs ?? undefined }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? 'Could not build the sheet.'); return }
      await saveResponse(r, `Lamba Family ${monthLabel(mk)}.${format}`)
      reload()
    } catch { setErr('Could not reach the server.') } finally { setBusy(null) }
  }

  async function fetchSaved(s: Saved) {
    try {
      const r = await fetch(`/api/vault/finance/sheet?key=${encodeURIComponent(s.key)}${q(actingAs)}`)
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? 'Could not fetch that sheet.'); return }
      await saveResponse(r, s.name)
    } catch { setErr('Could not reach the server.') }
  }

  // Group the list by month when every month is shown.
  const groups = (list ?? []).reduce<Record<string, Saved[]>>((acc, s) => { (acc[s.month] ??= []).push(s); return acc }, {})

  return (
    <div className="vg-lb" onClick={onClose}>
      <div className="vg-card vg-pad" onClick={e => e.stopPropagation()} style={{ width: 'min(520px, 96vw)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
          <p className="vg-sec" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><FileSpreadsheet className="h-4 w-4" /> Month sheet</p>
          <button className="vg-icobtn" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <label className="vg-lbl" htmlFor="sheet-month">Month</label>
        <input id="sheet-month" type="month" className="vg-input" value={mk} onChange={e => e.target.value && setMk(e.target.value)} />

        <div style={{ display: 'flex', gap: 8, marginTop: '0.8rem', flexWrap: 'wrap' }}>
          <button className="vg-btn vg-btn-primary" style={{ flex: '1 1 200px', justifyContent: 'center' }} disabled={!!busy} onClick={() => download('xlsx')}>
            {busy === 'xlsx' ? <Loader2 className="h-4 w-4 vg-spin" /> : <Download className="h-4 w-4" />} Excel / Google Sheets (.xlsx)
          </button>
          <button className="vg-btn" style={{ flex: '0 1 auto', justifyContent: 'center' }} disabled={!!busy} onClick={() => download('csv')}>
            {busy === 'csv' ? <Loader2 className="h-4 w-4 vg-spin" /> : <FileText className="h-4 w-4" />} CSV
          </button>
        </div>
        <p className="vg-muted" style={{ fontSize: '0.76rem', margin: '0.5rem 0 0' }}>
          Every entry, each person’s share, the common-account working and the full settlement — with the formulas left in. For Google Sheets, open the .xlsx from Drive.
        </p>
        {err && <p style={{ margin: '0.6rem 0 0', padding: '0.5rem 0.7rem', borderRadius: 10, fontSize: '0.84rem', background: 'color-mix(in srgb, var(--vg-neg) 12%, transparent)', color: 'var(--vg-neg)' }}>{err}</p>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.1rem', marginBottom: '0.4rem' }}>
          <p className="vg-lbl" style={{ margin: 0 }}>Kept sheets{profile ? ` · ${profile}` : ''}</p>
          <div className="vg-subtabs">
            <button className="vg-subtab" data-on={!all} onClick={() => setAll(false)}>{monthLabel(mk)}</button>
            <button className="vg-subtab" data-on={all} onClick={() => setAll(true)}>All months</button>
          </div>
        </div>
        {list === null && <p className="vg-muted" style={{ fontSize: '0.84rem' }}><Loader2 className="h-4 w-4 vg-spin" style={{ display: 'inline' }} /> Looking…</p>}
        {list && list.length === 0 && <p className="vg-muted" style={{ fontSize: '0.84rem' }}>None kept yet. Each download is kept here, and a final copy is kept when a month is closed.</p>}
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {Object.entries(groups).map(([month, rows]) => (
            <div key={month}>
              {all && <p style={{ margin: '0.6rem 0 0.2rem', fontSize: '0.78rem', fontWeight: 700 }}>{monthLabel(month)}</p>}
              {rows.map(s => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.4rem 0', borderBottom: '1px dashed var(--vg-line)', fontSize: '0.84rem' }}>
                  {s.final
                    ? <span className="vg-chip" style={{ background: 'color-mix(in srgb, var(--vg-pos) 14%, transparent)', color: 'var(--vg-pos)' }}><Lock className="h-3 w-3" /> Final</span>
                    : <span className="vg-chip">Copy</span>}
                  <span style={{ flex: 1 }}>{new Date(s.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  <span className="vg-muted" style={{ fontSize: '0.74rem' }}>{Math.max(1, Math.round(s.size / 1024))} KB</span>
                  <button className="vg-icobtn" onClick={() => fetchSaved(s)} aria-label={`Download the ${s.final ? 'final' : 'saved'} sheet from ${s.at}`}><Download className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Shown on a closed month: it can be read and downloaded, not changed. */
export function ClosedBanner({ k, closedAt, closedBy, actingAs }: { k: string; closedAt?: string; closedBy?: string; actingAs?: string | null }) {
  return (
    <div className="vg-card" style={{ padding: '0.7rem 0.95rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: '1px solid color-mix(in srgb, var(--vg-pos) 35%, transparent)' }}>
      <Lock className="h-5 w-5" style={{ color: 'var(--vg-pos)', flex: '0 0 auto' }} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 700 }}>{monthLabel(k)} is closed</div>
        <div className="vg-muted" style={{ fontSize: '0.8rem' }}>
          Read-only{closedAt ? ` since ${new Date(closedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}{closedBy ? ` · closed by ${closedBy}` : ''}. The final sheet is kept; reopen the month on Settlement to change anything.
        </div>
      </div>
      <SheetButton k={k} actingAs={actingAs} compact />
    </div>
  )
}
