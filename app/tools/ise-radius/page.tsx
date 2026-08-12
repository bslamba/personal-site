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
import RadiusAnalyser from '@/components/tools/radius-analyser'

export const metadata: Metadata = {
  title: 'Cisco ISE RADIUS Analyser',
  description:
    'Analyse a Cisco ISE RADIUS Authentications CSV export in your browser. Failure rates ' +
    'by ISE node, network device, site, policy set, protocol and endpoint, with every ' +
    'failure reason broken out by ISE message code. Nothing is uploaded.',
  alternates: { canonical: '/tools/ise-radius' },
}

export default function IseRadiusToolPage() {
  return (
    <>
      <section className="border-b border-ink-900/10 bg-paper">
        <div className="container-page pb-10 pt-16 sm:pt-20">
          <Link href="/tools" className="label text-ink-400 transition-colors hover:text-signal-500">
            ← Tools
          </Link>

          <h1 className="heading mt-6 max-w-4xl text-[clamp(2rem,5.5vw,4rem)]">
            Cisco ISE RADIUS Analyser
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-600">
            Export the RADIUS Authentications report from ISE, drop the CSV below, and press
            Analyse. You get failure rates broken down by ISE node, network device, site,
            policy set, protocol and endpoint, with every failure reason resolved to its ISE
            message code — and a ranked list of whatever is genuinely out of line.
          </p>

          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-500">
            The file is read in your browser and never uploaded. You can disconnect from the
            network before pressing Analyse and it will still work.
          </p>
        </div>
      </section>

      <section className="bg-paper-dim pb-24">
        <RadiusAnalyser />
      </section>
    </>
  )
}
