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
    name: 'Support bundle (.tar)',
    where: 'Operations → Troubleshooting → Download Logs → Shared Key',
    gives:
      'Decrypt the bundle once on your own machine, then drop the archive in. Every log is ' +
      'read — all rotations — and grouped the way Cisco groups debug attributes: ISE version ' +
      'and services, runtime health with noise separated from signal, authentications with ' +
      'SSID and per-step timing, and per-area error counts.',
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

          <FasterPath />
        </div>
      </section>

      <section className="bg-paper-dim pb-24">
        <IseReportAnalyser />
      </section>
    </>
  )
}

/**
 * Optional speed-up. Deliberately framed as optional, because the
 * default path needs nothing installed — it is only slower.
 */
function FasterPath() {
  const STEPS = [
    {
      os: 'macOS',
      install: 'brew install gnupg',
      installNote: 'or install GPG Suite from gpgtools.org if you would rather not use Homebrew',
    },
    {
      os: 'Windows',
      install: 'Install Gpg4win from gpg4win.org',
      installNote: 'then use PowerShell or Command Prompt',
    },
    {
      os: 'Linux',
      install: 'Already installed on most distributions',
      installNote: 'otherwise: sudo apt install gnupg',
    },
  ]

  return (
    <details className="group mt-10 max-w-3xl border border-ink-200 bg-paper">
      <summary className="cursor-pointer list-none px-5 py-4 marker:content-none">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-base font-bold text-ink-950" style={{ fontFamily: 'var(--font-heading)' }}>
              How to decrypt a support bundle
            </p>
            <p className="mt-1 text-sm text-ink-500">
              One command, about fifteen seconds. Needed before a bundle can be analysed here.
            </p>
          </div>
          <span className="shrink-0 text-signal-500 transition-transform group-open:rotate-90" aria-hidden="true">
            ▸
          </span>
        </div>
      </summary>

      <div className="border-t border-ink-200 px-5 py-5">
        <p className="max-w-2xl text-sm leading-relaxed text-ink-600">
          ISE encrypts support bundles with GPG. This page reads the archive but not the
          encryption, so the file has to be decrypted first — on your own machine, which is
          also where the key belongs.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-600">
          An earlier version of this tool decrypted in the browser. It was measured at about
          6 KB/s, which works out at two and a half hours for a 344MB bundle, so it was removed
          rather than left in place looking functional. The cause is structural: GPG needs
          AES-CFB, the Web Crypto API does not implement that mode, and so the cipher falls back
          to JavaScript in front of a two-gigabyte decompression stream. The same work with
          native code takes about fifteen seconds.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map(s => (
            <div key={s.os} className="border-t-2 border-ink-950 pt-3">
              <p className="label text-signal-500">{s.os}</p>
              <p className="mt-2 font-mono text-xs text-ink-800">{s.install}</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">{s.installNote}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-sm font-bold text-ink-950" style={{ fontFamily: 'var(--font-heading)' }}>
          Then, on any platform
        </p>
        <pre className="mt-2 overflow-x-auto border border-ink-200 bg-paper-dim p-3 font-mono text-xs text-ink-800">
{`gpg --output bundle.tar --decrypt ise-support-bundle-....tar.gpg`}
        </pre>
        <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-ink-500">
          It will prompt for the shared key you set when creating the bundle. Use{' '}
          <span className="font-mono">--output</span> rather than a{' '}
          <span className="font-mono">&gt;</span> redirect — on Windows, PowerShell writes
          redirected output as UTF-16 text and silently corrupts the archive.
        </p>

        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-600">
          The decrypted <span className="font-mono">.tar</span> will be a few gigabytes, so
          check you have the disk space. Delete it when you are done — the analysis lives in
          this tab, not in the file.
        </p>

        <div className="mt-5 border-l-2 border-signal-500 bg-signal-50 p-3">
          <p className="text-sm font-bold text-signal-700">
            If the filename contains <span className="font-mono">-pk-</span>
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-signal-700">
            That bundle is public-key encrypted, which means it is encrypted to Cisco&apos;s key
            and only Cisco TAC can open it. Neither this page nor{' '}
            <span className="font-mono">gpg</span> on your machine will decrypt it. Regenerate
            with Shared Key encryption instead — in the GUI under Operations → Troubleshooting →
            Download Logs, or from the CLI with{' '}
            <span className="font-mono">backup-logs NAME repository REPO encryption-key plain YOURKEY</span>.
          </p>
        </div>
      </div>
    </details>
  )
}

