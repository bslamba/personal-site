// ============================================================
// app/blog/page.tsx
//
// The Journal index. Server Component — the article list is built
// into the HTML at deploy time, so Google sees every article
// immediately without running any JavaScript.
//
// The search box is a small client component layered on top.
// ============================================================

import type { Metadata } from 'next'
import { getPostSummaries, getAllTags } from '@/lib/blog'
import BlogSearch from '@/components/blog-search'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  title: 'Journal — Infrastructure Security Notes',
  description:
    'Technical writing on Cisco ISE, Aruba ClearPass, network access control, ' +
    'RADIUS, TACACS+, 802.1X and enterprise infrastructure security, ' +
    'by Bhawneet Singh Lamba.',
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/blog`,
    title: 'Journal — Infrastructure Security Notes',
    description:
      'Field notes on network access control, identity and enterprise ' +
      'infrastructure security.',
  },
}

export default function BlogIndex() {
  const posts = getPostSummaries()
  const tags = getAllTags()

  return (
    <>
      {/* Tells Google this page is a list of articles, and what's on it */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Blog',
            name: 'Bhawneet Singh Lamba — Journal',
            description:
              'Technical writing on network access control and infrastructure security.',
            url: `${SITE_URL}/blog`,
            author: {
              '@type': 'Person',
              name: 'Bhawneet Singh Lamba',
              url: SITE_URL,
            },
            blogPost: posts.slice(0, 20).map(p => ({
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
      <section className="border-b border-ink-900/10 bg-paper-dim py-24 sm:py-32">
        <div className="container-page">
          <div className="flex items-center gap-4">
            <span className="h-px w-14 bg-signal-500" />
            <span className="label text-signal-500">Field notes</span>
          </div>

          <h1 className="heading mt-6 text-[clamp(2.5rem,8vw,6rem)]">Journal</h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-600">
            Notes from inside the access layer — network access control,
            identity, AAA protocols, and keeping enterprise infrastructure
            answering. Written from thirteen years of doing it.
          </p>
        </div>
      </section>

      {/* ---------------- SEARCH + LIST ---------------- */}
      <section className="py-16 sm:py-20">
        <div className="container-page max-w-4xl">
          {posts.length > 0 ? (
            <BlogSearch posts={posts} tags={tags} />
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
