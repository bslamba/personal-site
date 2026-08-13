// ============================================================
// app/tools/ise-radius/page.tsx
//
// Wrapper around the analyser. Everything interactive lives in
// the client component; this page supplies the metadata and the
// explanatory header so the route is still useful to a search
// engine that will never press the button.
// ============================================================

import type { Metadata } from 'next'
import Link from 'next/link'
import IseReportAnalyser from '@/components/tools/radius-analyser'

export const metadata: Metadata = {
  title: 'Cisco ISE Report Analyser',
  description:
    'Analyse Cisco ISE RADIUS Authentications and Key Performance Metrics exports in your ' +
    'browser. Failure rates by ISE node, network device, site, policy set, protocol and ' +
    'endpoint, with every failure reason broken out by ISE message code, alongside node ' +
    'throughput, latency, load and log suppression. Nothing is uploaded.',
  alternates: { canonical: '/tools/ise-radius' },
}

const REPORTS = [
  {
    name: 'Support bundle (.tar.gpg)',
    where: 'Operations → Troubleshooting → Download Logs → Shared Key',
    gives:
      'Drop the encrypted bundle straight in and give it the shared key. It is decrypted in ' +
      'your browser, the archive is walked without ever being written down, and out comes ISE ' +
      'version and services, runtime health with the noise separated from the signal, ' +
      'authentications with SSID and per-step timing, and application events.',
  },
  {
    name: 'RADIUS Authentications',
    where: 'Operations → Reports → Reports → Endpoints and Users',
    gives:
      'Pass and fail rates, every failure reason resolved to its ISE message code, and where ' +
      'the failures concentrate — by site, network device, ISE node, policy set, authorisation ' +
      'rule, protocol, identity store, endpoint and user.',
  },
  {
    name: 'Key Performance Metrics',
    where: 'Operations → Reports → Reports → Diagnostics',
    gives:
      'Per-node throughput, processing latency, system load, RADIUS request volume and log ' +
      'suppression, sampled hourly — so you can see which nodes are carrying the deployment ' +
      'and which are struggling.',
  },
]

export default function IseReportToolPage() {
  return (
    <>
      <section className="border-b border-ink-900/10 bg-paper">
        <div className="container-page pb-10 pt-16 sm:pt-20">
          <Link href="/tools" className="label text-ink-400 transition-colors hover:text-signal-500">
            ← Tools
          </Link>

          <h1 className="heading mt-6 max-w-4xl text-[clamp(2rem,5.5vw,4rem)]">
            Cisco ISE Report Analyser
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-600">
            Drop in an encrypted support bundle or your CSV exports and press Analyse. Each is
            recognised on its own and gets its own dashboard — drop several together and you get
            all of them, which is the point: a spike in failures at 11:40 reads very differently
            depending on whether node load spiked too, or OCSP was timing out.
          </p>

          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {REPORTS.map(r => (
              <div key={r.name} className="border-t-2 border-ink-950 pt-4">
                <p className="text-base font-bold text-ink-950"
                   style={{ fontFamily: 'var(--font-heading)' }}>
                  {r.name}
                </p>
                <p className="label mt-1 text-signal-500">{r.where}</p>
                <p className="mt-3 text-sm leading-relaxed text-ink-600">{r.gives}</p>
              </div>
            ))}
          </div>

          <p className="mt-8 max-w-2xl text-sm leading-relaxed text-ink-500">
            Files are read in your browser and never uploaded. You can disconnect from the
            network before pressing Analyse and it will still work — which is the test that
            proves it.
          </p>
        </div>
      </section>

      <section className="bg-paper-dim pb-24">
        <IseReportAnalyser />
      </section>
    </>
  )
}
