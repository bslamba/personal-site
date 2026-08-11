'use client'

// ============================================================
// components/blog-search.tsx — retuned typography
// ============================================================

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, X, ArrowUpRight } from 'lucide-react'
import type { PostSummary } from '@/lib/blog'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

export default function BlogSearch({
  posts, tags,
}: {
  posts: PostSummary[]
  tags: { tag: string; count: number }[]
}) {
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState<string[]>([])

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    return posts.filter(post => {
      const matchesTags =
        activeTags.length === 0 || activeTags.every(t => post.tags.includes(t))
      const matchesQuery =
        terms.length === 0 || terms.every(term => post.searchText.includes(term))
      return matchesTags && matchesQuery
    })
  }, [posts, query, activeTags])

  function toggleTag(tag: string) {
    setActiveTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  const filtering = query.length > 0 || activeTags.length > 0
  const headingFont = { fontFamily: 'var(--font-heading)' }

  return (
    <div>
      {/* ---------------- SEARCH BOX ---------------- */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search articles — try 'ISE upgrade' or 'RADIUS'"
          aria-label="Search articles"
          style={headingFont}
          className="w-full border border-ink-200 bg-paper py-4 pl-12 pr-12 text-base outline-none transition-colors placeholder:text-ink-400 focus:border-signal-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-400 transition-colors hover:text-signal-500"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* ---------------- TAG FILTERS ---------------- */}
      {tags.length > 0 && (
        <div className="mt-6">
          <span className="label mb-3 block text-ink-400">Filter by topic</span>
          <div className="flex flex-wrap gap-2">
            {tags.map(({ tag, count }) => {
              const on = activeTags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  aria-pressed={on}
                  style={headingFont}
                  className={`border px-3.5 py-2 text-xs font-medium transition-colors ${
                    on
                      ? 'border-signal-500 bg-signal-500 text-paper'
                      : 'border-ink-200 text-ink-600 hover:border-signal-300 hover:text-signal-600'
                  }`}
                >
                  {tag}
                  <span className={on ? 'ml-1.5 text-signal-100' : 'ml-1.5 text-ink-400'}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ---------------- RESULT COUNT ---------------- */}
      <div className="mt-8 flex items-center justify-between border-b border-ink-200 pb-4">
        <span className="label text-ink-400" aria-live="polite">
          {filtering
            ? `${results.length} ${results.length === 1 ? 'result' : 'results'}`
            : `${posts.length} ${posts.length === 1 ? 'article' : 'articles'}`}
        </span>
        {filtering && (
          <button
            type="button"
            onClick={() => { setQuery(''); setActiveTags([]) }}
            className="label text-signal-500 hover:text-ink-950"
          >
            Clear all
          </button>
        )}
      </div>

      {/* ---------------- RESULTS ---------------- */}
      {results.length > 0 ? (
        <div className="mt-10 space-y-11">
          {results.map((post, i) => (
            <article
              key={post.slug}
              className="group grid gap-5 border-b border-ink-200 pb-11 last:border-0 lg:grid-cols-[auto_1fr] lg:gap-10"
            >
              <div className="lg:w-20">
                <span className="display-xl outline-type block text-3xl leading-none">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>

              <div className="min-w-0">
                <Link href={`/blog/${post.slug}`}>
                  {/* Was text-3xl / sm:text-4xl in Syne 800 */}
                  <h2 className="heading text-xl transition-colors group-hover:text-signal-500 sm:text-2xl">
                    {post.title}
                  </h2>
                </Link>

                <div className="label mt-2.5 text-ink-400">
                  <time dateTime={post.date}>{formatDate(post.date)}</time>
                  {' · '}{post.readingMinutes} min read
                </div>

                <p className="measure mt-4 leading-relaxed text-ink-600">
                  {post.excerpt}
                </p>

                {post.tags.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {post.tags.map(tag => (
                      <li key={tag}>
                        <button
                          type="button"
                          onClick={() => toggleTag(tag)}
                          style={headingFont}
                          className="border border-ink-200 px-2.5 py-1 text-xs text-ink-500 transition-colors hover:border-signal-300 hover:text-signal-600"
                        >
                          {tag}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <Link
                  href={`/blog/${post.slug}`}
                  className="label mt-5 inline-flex items-center gap-2 text-signal-500 hover:text-ink-950"
                >
                  Read article
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="py-24 text-center">
          <p className="text-lg text-ink-500">No articles match that search.</p>
          <button
            type="button"
            onClick={() => { setQuery(''); setActiveTags([]) }}
            className="btn-ghost mt-6"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  )
}
