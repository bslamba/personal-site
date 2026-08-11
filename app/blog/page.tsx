// ============================================================
// app/blog/page.tsx
//
// The Journal, organised into three sections:
//   Network Access Control · Networking · Cloud & Cloud Security
// ============================================================

import type { Metadata } from 'next'
import { getPostSummaries, getAllTags } from '@/lib/blog'
import BlogDirectory from '@/components/blog-directory'

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

      {/* ---------------- DIRECTORY ---------------- */}
      <section className="py-12 sm:py-14">
        <div className="container-page">
          {posts.length > 0 ? (
            <BlogDirectory posts={posts} tags={tags} />
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
