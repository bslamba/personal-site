'use client'

// ============================================================
// components/blog-directory.tsx
//
// The Journal, as three parallel sections:
//   Network Access Control · Networking · Cloud & Cloud Security
//
// Search and tag filters apply across all three simultaneously.
// Compact type so three columns fit comfortably on a laptop.
// ============================================================

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, X, SlidersHorizontal, ArrowUpRight, Clock } from 'lucide-react'
import type { PostSummary } from '@/lib/blog'
import { CATEGORIES, groupPosts, type Category } from '@/lib/blog-categories'

const HEADING = { fontFamily: 'var(--font-heading)' } as const

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ------------------------------------------------------------
// One article row
// ------------------------------------------------------------
function ArticleRow({ post, index }: { post: PostSummary; index: number }) {
  return (
    <article className="group border-t border-ink-200 py-5 first:border-t-0 first:pt-0">
      <Link href={`/blog/${post.slug}`} className="block">
        <div className="flex items-start gap-3">
          <span
            className="display-xl outline-type mt-0.5 shrink-0 text-lg leading-none"
            aria-hidden="true"
          >
            {String(index + 1).padStart(2, '0')}
          </span>

          <div className="min-w-0">
            <h3
              className="text-[0.9375rem] font-semibold leading-snug tracking-tight text-ink-950 transition-colors group-hover:text-signal-500"
              style={HEADING}
            >
              {post.title}
            </h3>

            <div
              className="mt-1.5 flex items-center gap-2 text-[0.6875rem] uppercase tracking-[0.14em] text-ink-400"
              style={HEADING}
            >
              <time dateTime={post.date}>{formatDate(post.date)}</time>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {post.readingMinutes} min
              </span>
            </div>

            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-500">
              {post.excerpt}
            </p>
          </div>
        </div>
      </Link>
    </article>
  )
}

// ------------------------------------------------------------
// One section column
// ------------------------------------------------------------
function SectionColumn({
  category, posts, filtering,
}: {
  category: Category
  posts: PostSummary[]
  filtering: boolean
}) {
  const bar =
    category.accent === 'signal' ? 'bg-signal-500'
    : category.accent === 'ink'  ? 'bg-ink-950'
    : 'border border-ink-300 bg-transparent'

  return (
    <section className="flex flex-col">

      {/* ---- Header ---- */}
      <header className="border-b-2 border-ink-950 pb-4">
        <span className={`mb-4 block h-1.5 w-12 ${bar}`} aria-hidden="true" />

        <div className="flex items-baseline justify-between gap-3">
          <h2
            className="text-lg font-bold leading-tight tracking-tight text-ink-950"
            style={HEADING}
          >
            {category.title}
          </h2>
          <span
            className="shrink-0 text-[0.6875rem] font-semibold tracking-[0.14em] text-ink-400"
            style={HEADING}
          >
            {String(posts.length).padStart(2, '0')}
          </span>
        </div>

        <p
          className="mt-1.5 text-[0.6875rem] uppercase tracking-[0.18em] text-signal-500"
          style={HEADING}
        >
          {category.subtitle}
        </p>

        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          {category.blurb}
        </p>
      </header>

      {/* ---- Articles ---- */}
      <div className="mt-6 flex-1">
        {posts.length > 0 ? (
          <div>
            {posts.map((post, i) => (
              <ArticleRow key={post.slug} post={post} index={i} />
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-ink-300 px-5 py-10 text-center">
            <p className="text-sm text-ink-500">
              {filtering
                ? 'No matches in this section.'
                : 'Nothing published here yet.'}
            </p>
            {!filtering && category.id === 'cloud' && (
              <p className="mt-2 text-xs leading-relaxed text-ink-400">
                Azure architecture, cloud identity and workload security
                are next.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

// ------------------------------------------------------------
// The directory
// ------------------------------------------------------------
export default function BlogDirectory({
  posts, tags,
}: {
  posts: PostSummary[]
  tags: { tag: string; count: number }[]
}) {
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)

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

  const grouped = useMemo(() => groupPosts(results), [results])
  const filtering = query.length > 0 || activeTags.length > 0

  function toggleTag(tag: string) {
    setActiveTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  function clearAll() {
    setQuery('')
    setActiveTags([])
  }

  return (
    <div>

      {/* ================= CONTROLS ================= */}
      <div className="flex flex-col gap-3 sm:flex-row">

        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search all articles — try 'ISE upgrade' or 'RADIUS'"
            aria-label="Search articles"
            style={HEADING}
            className="w-full border border-ink-200 bg-paper py-3 pl-11 pr-10 text-sm outline-none transition-colors placeholder:text-ink-400 focus:border-signal-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 transition-colors hover:text-signal-500"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowFilters(v => !v)}
          aria-expanded={showFilters}
          style={HEADING}
          className={`inline-flex shrink-0 items-center justify-center gap-2 border px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
            activeTags.length > 0
              ? 'border-signal-500 bg-signal-500 text-paper'
              : 'border-ink-200 text-ink-600 hover:border-ink-400'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Topics
          {activeTags.length > 0 && <span>({activeTags.length})</span>}
        </button>
      </div>

      {/* ---- Collapsible tag filter ---- */}
      {showFilters && (
        <div className="mt-4 border border-ink-200 bg-paper-dim p-4">
          <div className="flex flex-wrap gap-1.5">
            {tags.map(({ tag, count }) => {
              const on = activeTags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  aria-pressed={on}
                  style={HEADING}
                  className={`border px-2.5 py-1.5 text-[0.6875rem] font-medium transition-colors ${
                    on
                      ? 'border-signal-500 bg-signal-500 text-paper'
                      : 'border-ink-200 bg-paper text-ink-600 hover:border-signal-300 hover:text-signal-600'
                  }`}
                >
                  {tag}
                  <span className={on ? 'ml-1 text-signal-100' : 'ml-1 text-ink-400'}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ---- Result summary ---- */}
      <div className="mt-5 flex items-center justify-between border-b border-ink-200 pb-4">
        <span
          className="text-[0.6875rem] uppercase tracking-[0.18em] text-ink-400"
          style={HEADING}
          aria-live="polite"
        >
          {filtering
            ? `${results.length} of ${posts.length} articles`
            : `${posts.length} articles`}
        </span>
        {filtering && (
          <button
            type="button"
            onClick={clearAll}
            style={HEADING}
            className="text-[0.6875rem] uppercase tracking-[0.18em] text-signal-500 transition-colors hover:text-ink-950"
          >
            Clear all
          </button>
        )}
      </div>

      {/* ================= THREE SECTIONS ================= */}
      <div className="mt-10 grid gap-10 md:grid-cols-2 md:gap-8 lg:grid-cols-3 lg:gap-10">
        {CATEGORIES.map(category => (
          <SectionColumn
            key={category.id}
            category={category}
            posts={grouped[category.id]}
            filtering={filtering}
          />
        ))}
      </div>

      {/* ---- Nothing anywhere ---- */}
      {filtering && results.length === 0 && (
        <div className="mt-12 border border-ink-200 py-20 text-center">
          <p className="text-lg text-ink-600">No articles match that search.</p>
          <button type="button" onClick={clearAll} className="btn-ghost mt-6">
            Clear filters
          </button>
        </div>
      )}

      {/* ---- Footer prompt ---- */}
      <div className="mt-16 border-t border-ink-200 pt-8">
        <p className="text-sm text-ink-500">
          Looking for something specific?{' '}
          <Link href="/#contact" className="text-signal-500 hover:text-ink-950">
            Get in touch
            <ArrowUpRight className="ml-0.5 inline h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </p>
      </div>
    </div>
  )
}
