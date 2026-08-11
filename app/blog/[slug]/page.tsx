// ============================================================
// app/blog/[slug]/page.tsx
// Retuned typography — the headline is now a readable size and
// the body sits at a proper measure.
// ============================================================

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowUpRight, Clock, Calendar } from 'lucide-react'
import { getPost, getPostSlugs, getRelatedPosts } from '@/lib/blog'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export function generateStaticParams() {
  return getPostSlugs().map(slug => ({ slug }))
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) return {}

  const url = `${SITE_URL}/blog/${post.slug}`

  return {
    title: post.title,
    description: post.excerpt,
    keywords: post.tags,
    authors: [{ name: 'Bhawneet Singh Lamba', url: SITE_URL }],
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: post.title,
      description: post.excerpt,
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
      authors: ['Bhawneet Singh Lamba'],
      tags: post.tags,
      images: post.cover ? [{ url: post.cover, alt: post.coverAlt ?? post.title }] : undefined,
    },
    twitter: {
      card: post.cover ? 'summary_large_image' : 'summary',
      title: post.title,
      description: post.excerpt,
      images: post.cover ? [post.cover] : undefined,
    },
  }
}

export default async function ArticlePage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()

  const related = getRelatedPosts(slug)
  const url = `${SITE_URL}/blog/${post.slug}`

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.excerpt,
            datePublished: post.date,
            dateModified: post.updated ?? post.date,
            keywords: post.tags.join(', '),
            wordCount: post.plain.split(/\s+/).length,
            image: post.cover ? [post.cover] : undefined,
            mainEntityOfPage: { '@type': 'WebPage', '@id': url },
            author: {
              '@type': 'Person',
              name: 'Bhawneet Singh Lamba',
              jobTitle: 'Infrastructure Security Consultant',
              url: SITE_URL,
              sameAs: ['https://www.linkedin.com/in/bhawneet-singh-lamba-92632064/'],
            },
            publisher: { '@type': 'Person', name: 'Bhawneet Singh Lamba', url: SITE_URL },
          }),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
              { '@type': 'ListItem', position: 2, name: 'Journal', item: `${SITE_URL}/blog` },
              { '@type': 'ListItem', position: 3, name: post.title, item: url },
            ],
          }),
        }}
      />

      {/* ---------------- HEADER ---------------- */}
      <header className="border-b border-ink-900/10 bg-paper-dim py-16 sm:py-20">
        <div className="container-page">
          <div className="measure-wide">

            <nav aria-label="Breadcrumb">
              <Link
                href="/blog"
                className="label inline-flex items-center gap-2 text-ink-400 transition-colors hover:text-signal-500"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All articles
              </Link>
            </nav>

            {/* Readable headline. Was clamp(2rem, 5.5vw, 4rem). */}
            <h1 className="heading mt-7 text-[clamp(1.75rem,3.4vw,2.625rem)]">
              {post.title}
            </h1>

            {post.excerpt && (
              <p className="measure mt-5 text-lg leading-relaxed text-ink-600">
                {post.excerpt}
              </p>
            )}

            <div className="label mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-ink-400">
              <span className="inline-flex items-center gap-2">
                <Calendar className="h-4 w-4" aria-hidden="true" />
                <time dateTime={post.date}>{formatDate(post.date)}</time>
              </span>
              <span className="inline-flex items-center gap-2">
                <Clock className="h-4 w-4" aria-hidden="true" />
                {post.readingMinutes} min read
              </span>
              {post.updated && post.updated !== post.date && (
                <span>Updated {formatDate(post.updated)}</span>
              )}
            </div>

            {post.tags.length > 0 && (
              <ul className="mt-6 flex flex-wrap gap-2">
                {post.tags.map(tag => (
                  <li
                    key={tag}
                    className="border border-ink-200 px-3 py-1.5 text-xs text-ink-600"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </header>

      {/* ---------------- BODY ---------------- */}
      <div className="container-page py-14 sm:py-16">

        {post.headings.length >= 3 && (
          <nav aria-label="On this page" className="measure mb-12 border-l-2 border-signal-500 pl-6">
            <span className="label text-signal-500">On this page</span>
            <ul className="mt-4 space-y-2.5">
              {post.headings.map(h => (
                <li key={h.id} className={h.level === 3 ? 'pl-5' : ''}>
                  <a
                    href={`#${h.id}`}
                    className="text-base text-ink-600 transition-colors hover:text-signal-500"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <article
          className="article-body"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />

        {/* ---------------- AUTHOR ---------------- */}
        <aside className="measure mt-16 border-t border-ink-200 pt-9">
          <span className="label text-signal-500">Written by</span>
          <p
            className="heading mt-3 text-xl"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Bhawneet Singh Lamba
          </p>
          <p className="mt-3 leading-relaxed text-ink-600">
            Infrastructure Security Consultant with 13+ years in network access
            control, AAA protocols and enterprise network architecture. Cisco ISE,
            Aruba ClearPass, and the incidents that happen at 2am.
          </p>
          <div className="mt-5 flex flex-wrap gap-4">
            <Link href="/#contact" className="label text-signal-500 hover:text-ink-950">
              Get in touch →
            </Link>
            <a
              href="https://www.linkedin.com/in/bhawneet-singh-lamba-92632064/"
              target="_blank" rel="noopener noreferrer"
              className="label text-signal-500 hover:text-ink-950"
            >
              LinkedIn →
            </a>
          </div>
        </aside>

        {/* ---------------- RELATED ---------------- */}
        {related.length > 0 && (
          <aside className="measure mt-14 border-t border-ink-200 pt-9">
            <span className="label text-signal-500">Related reading</span>
            <ul className="mt-6 space-y-5">
              {related.map(r => (
                <li key={r.slug}>
                  <Link href={`/blog/${r.slug}`} className="group block">
                    <span className="heading text-lg transition-colors group-hover:text-signal-500">
                      {r.title}
                    </span>
                    <ArrowUpRight className="ml-1.5 inline h-4 w-4 text-signal-500" aria-hidden="true" />
                    <p className="mt-1.5 text-base leading-relaxed text-ink-500">
                      {r.excerpt}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </>
  )
}
