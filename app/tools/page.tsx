// ============================================================
// app/tools/page.tsx
//
// The Tools landing page. Add an entry to TOOLS and the card
// appears — nothing else needs editing.
// ============================================================

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight, ShieldCheck, Lock, Gauge } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Tools',
  description:
    'Free browser-based tools for network and security engineers. Analyse Cisco ISE ' +
    'RADIUS authentication exports without uploading anything anywhere.',
}

const TOOLS = [
  {
    href: '/tools/ise-radius',
    status: 'Live',
    name: 'Cisco ISE Report Analyser',
    blurb:
      'Drop in a support bundle archive, or your RADIUS Authentications, Key Performance ' +
      'Metrics and Current Active Sessions exports, and get a full troubleshooting dashboard — ' +
      'failure reasons with their ISE codes, where failures concentrate by site, device, node ' +
      'and protocol, per-node throughput, latency and live session counts, and runtime health ' +
      'with the noise separated from the signal.',
    points: [
      'Reads every log in a bundle, every rotation, grouped by problem area',
      'All four input types detected automatically, on one page',
      'Ranks what stands out instead of leaving you to spot it',
      'Click anything to filter the whole dashboard to it',
      'Runs entirely in your browser — nothing is uploaded',
    ],
  },
] as const

const PRINCIPLES = [
  {
    icon: Lock,
    title: 'Nothing is uploaded',
    body:
      'Every tool here runs entirely in your browser. The file is read on your own machine, ' +
      'the analysis happens there, and closing the tab discards it. No server sees the data, ' +
      'because no server is involved.',
  },
  {
    icon: ShieldCheck,
    title: 'Safe with real exports',
    body:
      'Production RADIUS logs carry usernames, MAC addresses, site names and policy names. ' +
      'That is exactly the sort of thing that should not be pasted into an unknown website, ' +
      'which is why these tools were built not to need it.',
  },
  {
    icon: Gauge,
    title: 'Built for the real thing',
    body:
      'Tested against genuine ISE exports rather than tidy samples — a hundred thousand rows ' +
      'parse and aggregate in about a second, and column names are detected rather than assumed, ' +
      'so ISE 2.x and 3.x exports both work.',
  },
]

export default function ToolsPage() {
  return (
    <>
      {/* ---------- header ---------- */}
      <section className="border-b border-ink-900/10 bg-paper">
        <div className="container-page py-20 sm:py-28">
          <div className="flex items-center gap-4">
            <span className="h-px w-14 bg-signal-500" />
            <span className="label text-signal-500">Free · No sign-up · No upload</span>
          </div>

          <h1 className="heading mt-8 max-w-4xl text-[clamp(2.5rem,7vw,5.5rem)]">
            Tools
          </h1>

          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-ink-600 sm:text-xl">
            Things I built because I needed them at work, and there was no reason to keep them
            to myself. They run in your browser, so the file you are analysing never leaves
            your computer.
          </p>
        </div>
      </section>

      {/* ---------- the tools ---------- */}
      <section className="border-b border-ink-900/10 bg-paper-dim py-20 sm:py-24">
        <div className="container-page">
          <div className="mb-10 flex items-center gap-4">
            <span className="h-px w-14 bg-signal-500" />
            <span className="label text-signal-500">Available now</span>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {TOOLS.map(tool => (
              <Link
                key={tool.href}
                href={tool.href}
                className="group flex flex-col border border-ink-200 bg-paper p-8 transition-colors hover:border-signal-500"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="label text-signal-500">{tool.status}</span>
                  <ArrowUpRight
                    className="h-5 w-5 shrink-0 text-ink-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-signal-500"
                    aria-hidden="true"
                  />
                </div>

                <h2
                  className="mt-5 text-2xl leading-tight text-ink-950 sm:text-[1.75rem]"
                  style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, letterSpacing: '-0.02em' }}
                >
                  {tool.name}
                </h2>

                <p className="mt-4 flex-1 text-base leading-relaxed text-ink-600">
                  {tool.blurb}
                </p>

                <ul className="mt-6 space-y-2 border-t border-ink-200 pt-5">
                  {tool.points.map(point => (
                    <li key={point} className="flex gap-3 text-sm text-ink-500">
                      <span className="mt-[0.45rem] h-1 w-1 shrink-0 bg-signal-500" aria-hidden="true" />
                      {point}
                    </li>
                  ))}
                </ul>
              </Link>
            ))}

            {/* placeholder so the grid reads as a series rather than a one-off */}
            <div className="flex flex-col justify-center border border-dashed border-ink-200 p-8">
              <span className="label text-ink-400">In progress</span>
              <p className="mt-4 text-base leading-relaxed text-ink-500">
                A certificate expiry checker for ISE deployments is next, and an EAP-TLS
                handshake decoder for packet captures. If there is something you keep doing by
                hand in a spreadsheet, tell me and it might end up here.
              </p>
              <Link href="/#contact" className="mt-6 text-sm font-bold uppercase tracking-wider text-signal-500 hover:underline">
                Suggest a tool →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- principles ---------- */}
      <section className="bg-paper py-20 sm:py-24">
        <div className="container-page">
          <div className="mb-10 flex items-center gap-4">
            <span className="h-px w-14 bg-signal-500" />
            <span className="label text-signal-500">How they work</span>
          </div>

          <div className="grid gap-px bg-ink-200 lg:grid-cols-3">
            {PRINCIPLES.map(item => {
              const Icon = item.icon
              return (
                <div key={item.title} className="bg-paper p-8">
                  <Icon className="h-8 w-8 text-signal-500" aria-hidden="true" />
                  <h3
                    className="mt-6 text-xl text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)', fontWeight: 800 }}
                  >
                    {item.title}
                  </h3>
                  <p className="mt-4 text-sm leading-relaxed text-ink-600">{item.body}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </>
  )
}
