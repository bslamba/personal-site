// ============================================================
// app/blog/page.tsx
//
// The Journal, organised into three sections:
//   Network Access Control · Networking · Cloud & Cloud Security
// ============================================================

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight, SlidersHorizontal } from 'lucide-react'
import { getPostSummaries, getAllTags } from '@/lib/blog'
import BlogDirectory from '@/components/blog-directory'
import { REFERENCES } from '@/lib/references'
import { TOPICS } from '@/components/ise/topics'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  title: 'Journal — Infrastructure Security Notes',
  description:
    'Technical writing on network access control, Cisco ISE, RADIUS, 802.1X, ' +
    'networking protocols and cloud security, by Bhawneet Singh Lamba.',
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/blog`,
    title: 'Journal — Infrastructure Security Notes',
    description:
      'Field notes on network access control, networking protocols and ' +
      'cloud security.',
  },
}

export default function BlogIndex() {
  const posts = getPostSummaries()
  const tags = getAllTags()

  // The reference's own metadata is static so the directory — a
  // client component — never has to import the topic registry.
  // The counts are the one thing worth keeping live, so they are
  // injected here, on the server, where the registry is free.
  const interactiveCount = TOPICS.filter(t => t.interactive).length
  const references = REFERENCES.map(reference =>
    reference.slug === 'cisco-ise-cheat-sheet'
      ? {
          ...reference,
          meta: `${TOPICS.length} topics · ${interactiveCount} interactive · ISE 3.x`,
        }
      : reference
  )

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Blog',
            name: 'Bhawneet Singh Lamba — Journal',
            description:
              'Technical writing on network access control, networking and cloud security.',
            url: `${SITE_URL}/blog`,
            author: { '@type': 'Person', name: 'Bhawneet Singh Lamba', url: SITE_URL },
            blogPost: posts.slice(0, 30).map(p => ({
              '@type': 'BlogPosting',
              headline: p.title,
              description: p.excerpt,
              datePublished: p.date,
              url: `${SITE_URL}/blog/${p.slug}`,
              keywords: p.tags.join(', '),
            })),
          }),
        }}
      />

      {/* ---------------- HEADER ---------------- */}
      <section className="border-b border-ink-900/10 bg-paper-dim py-14 sm:py-16">
        <div className="container-page">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">

            <div>
              <div className="flex items-center gap-4">
                <span className="h-px w-12 bg-signal-500" />
                <span className="label text-signal-500">Field notes</span>
              </div>

              <h1 className="heading mt-4 text-[clamp(2rem,4.2vw,3.25rem)]">
                Journal
              </h1>

              <p className="measure mt-4 leading-relaxed text-ink-600">
                Notes from inside the access layer — network access control,
                identity, AAA protocols, and keeping enterprise infrastructure
                answering. Written from thirteen years of doing it.
              </p>
            </div>

            {/* Section signposts */}
            <ul
              className="flex flex-wrap gap-x-6 gap-y-2 text-[0.6875rem] uppercase tracking-[0.16em] text-ink-400 lg:flex-col lg:gap-y-1.5 lg:text-right"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              <li className="inline-flex items-center gap-2 lg:justify-end">
                <span className="h-1.5 w-1.5 bg-signal-500" aria-hidden="true" />
                Network Access Control
              </li>
              <li className="inline-flex items-center gap-2 lg:justify-end">
                <span className="h-1.5 w-1.5 bg-ink-950" aria-hidden="true" />
                Networking
              </li>
              <li className="inline-flex items-center gap-2 lg:justify-end">
                <span className="h-1.5 w-1.5 border border-ink-400" aria-hidden="true" />
                Cloud &amp; Cloud Security
              </li>
            </ul>

          </div>
        </div>
      </section>

      {/* ---------------- FEATURED: THE CHEAT SHEET ----------------
          The cheat sheet is a route, not a markdown article, so it
          cannot come through getPostSummaries(). It is given its own
          band above the directory rather than being smuggled into
          the article list, because it is a different kind of thing:
          a reference you open, not a piece you read. */}
      <section className="border-b border-ink-900/10 pt-10">
        <div className="container-page">
          <Link
            href="/blog/cisco-ise-cheat-sheet"
            className="group block border border-ink-200 bg-white transition-colors hover:border-signal-500"
          >
            <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="label bg-signal-500 px-2 py-1 text-paper">
                    Reference
                  </span>
                  <span
                    className="text-[0.6875rem] uppercase tracking-[0.16em] text-ink-400"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    {TOPICS.length} topics · Cisco ISE 3.x
                  </span>
                </div>

                <h2 className="heading mt-4 text-[clamp(1.375rem,2.6vw,2rem)] transition-colors group-hover:text-signal-500">
                  The Cisco ISE Cheat Sheet
                  <ArrowUpRight
                    className="ml-1.5 inline h-5 w-5 text-signal-500"
                    aria-hidden="true"
                  />
                </h2>

                <p className="measure-wide mt-3 leading-relaxed text-ink-600">
                  Every Cisco ISE topic on a single screen each — architecture,
                  licensing, policy, EAP, 802.1X, profiling, posture, guest,
                  BYOD, TrustSec, pxGrid and operations. Concepts, the full
                  configuration, and the packet flow, with a selector wherever a
                  scenario has more than one option. No scrolling: pick a topic
                  and the whole thing is in front of you.
                </p>

                <ul
                  className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[0.6875rem] uppercase tracking-[0.14em] text-ink-500"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  <li className="inline-flex items-center gap-1.5">
                    <SlidersHorizontal className="h-3 w-3 text-signal-500" />
                    {interactiveCount} interactive sheets
                  </li>
                  <li>13 profiling probes</li>
                  <li>Full switch &amp; WLC configuration</li>
                  <li>Print to PDF</li>
                </ul>
              </div>

              <span className="btn-signal shrink-0 self-start lg:self-center">
                Open the cheat sheet
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* ---------------- DIRECTORY ---------------- */}
      <section className="py-12 sm:py-14">
        <div className="container-page">
          {posts.length > 0 ? (
            <BlogDirectory posts={posts} tags={tags} references={references} />
          ) : (
            <p className="py-20 text-center text-ink-500">
              No articles published yet.
            </p>
          )}
        </div>
      </section>
    </>
  )
}
