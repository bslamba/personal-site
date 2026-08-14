// ============================================================
// app/tools/clearpass/page.tsx
//
// Its own route rather than a tab on the ISE page. Someone with a
// ClearPass problem searches for ClearPass, and a page that tries
// to rank for two products ranks well for neither.
// ============================================================

import type { Metadata } from 'next'
import Link from 'next/link'
import ClearPassAnalyser from '@/components/tools/clearpass-analyser'

export const metadata: Metadata = {
  title: 'Aruba ClearPass Log Analyser',
  description:
    'Analyse Aruba ClearPass Access Tracker and Insight exports in your browser. Failure ' +
    'reasons ranked, and where rejections concentrate by network device, service, ' +
    'authentication source, enforcement profile, user and endpoint. Columns are detected ' +
    'from your file, so any ClearPass version works. Nothing is uploaded.',
  alternates: { canonical: '/tools/clearpass' },
}

const REPORTS = [
  {
    name: 'Access Tracker',
    where: 'Monitoring → Live Monitoring → Access Tracker → Export',
    gives:
      'The per-request record: login status, service, authentication source, enforcement ' +
      'profile, network device and error. This is the one that answers "why is this failing".',
  },
  {
    name: 'Insight reports',
    where: 'Insight → Reports → run, then export as CSV',
    gives:
      'Already aggregated by ClearPass. Useful for trends across a longer window than Access ' +
      'Tracker keeps, at the cost of per-request detail.',
  },
  {
    name: 'Any auth CSV, really',
    where: 'Wherever you can get one',
    gives:
      'Columns are worked out from the file rather than assumed, so an export with unusual ' +
      'columns — or one from a version this was never tested against — still produces a ' +
      'dashboard. You confirm the mapping before anything is computed.',
  },
]

export default function ClearPassToolPage() {
  return (
    <>
      <section className="border-b border-ink-900/10 bg-paper">
        <div className="container-page pb-10 pt-16 sm:pt-20">
          <Link href="/tools" className="label text-ink-400 transition-colors hover:text-signal-500">
            ← Tools
          </Link>

          <h1 className="heading mt-6 max-w-4xl text-[clamp(2rem,5.5vw,4rem)]">
            Aruba ClearPass Log Analyser
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-600">
            Drop in an Access Tracker export and get the same treatment the ISE analyser gives a
            RADIUS report: every failure reason ranked, and where the rejections actually
            concentrate — which device, which service, which authentication source, which
            enforcement profile.
          </p>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {REPORTS.map(r => (
              <div key={r.name} className="border-t-2 border-ink-950 pt-4">
                <p className="text-base font-bold text-ink-950">{r.name}</p>
                <p className="label mt-1 text-signal-500">{r.where}</p>
                <p className="mt-3 text-sm leading-relaxed text-ink-600">{r.gives}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 max-w-3xl border-l-2 border-signal-500 bg-signal-50 p-4">
            <p className="text-sm font-bold text-signal-700">
              Why this one asks you to confirm the columns
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-signal-700">
              ClearPass column sets differ between versions, between Access Tracker and Insight,
              and depending on which columns you ticked before exporting. Rather than hardcode one
              layout and quietly mis-read every other, this reads a few hundred rows, works out
              which column is which from the values themselves, and shows you what it found. A
              dashboard built on a misidentified column is confidently wrong, which is worse than
              one that stops to ask.
            </p>
          </div>

          <p className="mt-8 max-w-2xl text-sm leading-relaxed text-ink-500">
            Files are read in your browser and never uploaded. You can disconnect from the network
            before pressing Analyse and it will still work — which is the test that proves it.
          </p>
        </div>
      </section>

      <section>
        <ClearPassAnalyser />
      </section>
    </>
  )
}
