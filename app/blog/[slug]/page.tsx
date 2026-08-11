// ============================================================
// app/blog/[slug]/page.tsx
//
// Layout: sticky table of contents on the left, article centred
// in the remaining space. Full page width is used.
// ============================================================

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowUpRight, Clock, Calendar } from 'lucide-react'
import { getPost, getPostSlugs, getRelatedPosts } from '@/lib/blog'
import ArticleToc from '@/components/article-toc'

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

      {/* ================= HEADER ================= */}
      <header className="border-b border-ink-900/10 bg-paper-dim py-14 sm:py-16">
        <div className="container-page">
          <div className="mx-auto max-w-[52rem]">

            <nav aria-label="Breadcrumb">
              <Link
                href="/blog"
                className="label inline-flex items-center gap-2 text-ink-400 transition-colors hover:text-signal-500"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All articles
              </Link>
            </nav>

            <h1 className="heading mt-7 text-[clamp(1.75rem,3.4vw,2.625rem)]">
              {post.title}
            </h1>

            {post.excerpt && (
              <p className="mt-5 max-w-[46rem] text-lg leading-relaxed text-ink-600">
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

      {/* ================= BODY ================= */}
      <div className="container-page py-12 sm:py-14">
        <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14 xl:gap-20">

          {/* ---- Sticky contents rail ---- */}
          <ArticleToc headings={post.headings} />

          {/* ---- Article ---- */}
          <div className="min-w-0">
            <article
              className="article-body"
              dangerouslySetInnerHTML={{ __html: post.html }}
            />

            {/* ---- Author ---- */}
            <aside className="mx-auto mt-16 max-w-[46rem] border-t border-ink-200 pt-9">
              <span className="label text-signal-500">Written by</span>
              <p className="heading mt-3 text-xl">Bhawneet Singh Lamba</p>
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

            {/* ---- Related ---- */}
            {related.length > 0 && (
              <aside className="mx-auto mt-14 max-w-[46rem] border-t border-ink-200 pt-9">
                <span className="label text-signal-500">Related reading</span>
                <ul className="mt-6 grid gap-5 sm:grid-cols-2">
                  {related.map(r => (
                    <li key={r.slug}>
                      <Link href={`/blog/${r.slug}`} className="group block">
                        <span className="heading text-base transition-colors group-hover:text-signal-500">
                          {r.title}
                        </span>
                        <ArrowUpRight
                          className="ml-1 inline h-3.5 w-3.5 text-signal-500"
                          aria-hidden="true"
                        />
                        <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-ink-500">
                          {r.excerpt}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </aside>
            )}
          </div>

        </div>
      </div>
    </>
  )
}
