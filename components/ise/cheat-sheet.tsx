'use client'

// ============================================================
// components/ise/cheat-sheet.tsx
//
// The shell: a hub of every Cisco ISE topic, and the single
// no-scroll sheet each one opens into.
//
// The topic lives in the URL hash, so a sheet can be linked,
// bookmarked and reached with the back button without pulling
// in a Suspense boundary for search params.
// ============================================================

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Printer,
  Search,
  X,
  SlidersHorizontal,
} from 'lucide-react'
import FitSheet from './fit-sheet'
import { FAMILIES, type Topic } from './types'
import { TOPICS } from './topics'

const HEAD = { fontFamily: 'var(--font-heading)' } as const

// ------------------------------------------------------------
// The open topic lives in the URL hash, which makes the browser
// history the source of truth: it is an external store, so it is
// read with useSyncExternalStore rather than mirrored into state
// by an effect. Clearing the hash uses pushState, which fires no
// event of its own, so we raise one.
// ------------------------------------------------------------
const NAV_EVENT = 'ise:nav'

function subscribeToHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  window.addEventListener('popstate', onChange)
  window.addEventListener(NAV_EVENT, onChange)
  return () => {
    window.removeEventListener('hashchange', onChange)
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(NAV_EVENT, onChange)
  }
}

const getHash = () => window.location.hash.replace(/^#/, '')
const getServerHash = () => ''

export default function CheatSheet() {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const hash = useSyncExternalStore(subscribeToHash, getHash, getServerHash)
  const topicId = TOPICS.some(t => t.id === hash) ? hash : null

  const open = useCallback((id: string | null) => {
    if (id) {
      window.location.hash = id
      return
    }
    history.pushState(null, '', window.location.pathname + window.location.search)
    window.dispatchEvent(new Event(NAV_EVENT))
  }, [])

  const index = TOPICS.findIndex(t => t.id === topicId)
  const topic = index >= 0 ? TOPICS[index] : null

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      if (e.key === 'Escape') {
        if (typing) return
        open(null)
        return
      }
      if (!topic || typing || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowRight') open(TOPICS[(index + 1) % TOPICS.length].id)
      if (e.key === 'ArrowLeft')
        open(TOPICS[(index - 1 + TOPICS.length) % TOPICS.length].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [topic, index, open])

  return (
    <div className="ise-root flex flex-col bg-paper">
      {topic ? (
        <SheetView
          topic={topic}
          index={index}
          onBack={() => open(null)}
          onGo={open}
        />
      ) : (
        <Hub
          query={query}
          setQuery={setQuery}
          searchRef={searchRef}
          onOpen={open}
        />
      )}
    </div>
  )
}

// ============================================================
// HUB
// ============================================================
function Hub({
  query,
  setQuery,
  searchRef,
  onOpen,
}: {
  query: string
  setQuery: (v: string) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  onOpen: (id: string) => void
}) {
  const q = query.trim().toLowerCase()

  const matches = useMemo(() => {
    if (!q) return TOPICS
    return TOPICS.filter(t =>
      [t.title, t.short, t.blurb, t.tags.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [q])

  const interactiveCount = TOPICS.filter(t => t.interactive).length

  return (
    <>
      {/* ---------- masthead ---------- */}
      <header className="ise-hub-head shrink-0 border-b border-ink-200 bg-paper-dim">
        <div className="container-page py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="h-px w-10 bg-signal-500" />
                <span className="label text-signal-500">Reference</span>
                <Link
                  href="/blog"
                  className="label inline-flex items-center gap-1.5 text-ink-400 transition-colors hover:text-signal-500"
                >
                  <ArrowLeft className="h-3 w-3" /> Journal
                </Link>
              </div>

              <h1 className="heading mt-3 text-[clamp(1.6rem,3.2vw,2.5rem)]">
                The Cisco ISE Cheat Sheet
              </h1>

              <p className="mt-2 max-w-[46rem] text-[0.95rem] leading-relaxed text-ink-600">
                Every Cisco ISE topic on a single screen each — architecture,
                policy, access methods, profiling, posture, segmentation and
                operations. Concepts, configuration and packet flow, with no
                scrolling: pick a topic and the whole thing is in front of you.
              </p>

              <ul
                className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] uppercase tracking-[0.14em] text-ink-400"
                style={HEAD}
              >
                <li>{TOPICS.length} topics</li>
                <li className="inline-flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3 w-3 text-signal-500" />
                  {interactiveCount} with configuration selectors
                </li>
                <li>ISE 3.x</li>
              </ul>
            </div>

            {/* search */}
            <div className="w-full shrink-0 lg:w-[19rem]">
              <div className="flex items-center gap-2 border border-ink-300 bg-white px-3 py-2 focus-within:border-signal-500">
                <Search className="h-4 w-4 shrink-0 text-ink-400" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search topics — probe, SGT, posture, CoA…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
                  style={HEAD}
                  aria-label="Search topics"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="text-ink-400 hover:text-signal-500"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {q && (
                <p
                  className="mt-1.5 text-[0.6875rem] uppercase tracking-[0.14em] text-ink-400"
                  style={HEAD}
                >
                  {matches.length} of {TOPICS.length} topics
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ---------- topic grid ---------- */}
      <div className="ise-hub-body min-h-0 flex-1">
        <FitSheet canvas={1480} maxScale={1.25} padding={18}>
          {matches.length === 0 ? (
            <p className="py-16 text-center text-sm text-ink-500">
              Nothing matches that. Try “profiling”, “TrustSec”, “TACACS” or
              “CoA”.
            </p>
          ) : (
            <div className="grid grid-cols-5 gap-4">
              {FAMILIES.map(fam => {
                const list = matches.filter(t => t.family === fam.id)
                if (!list.length) return null
                return (
                  <section key={fam.id} className="min-w-0">
                    <div className="border-b-2 border-ink-950 pb-1.5">
                      <h2
                        className="text-[12px] font-bold uppercase tracking-[0.13em] text-ink-950"
                        style={HEAD}
                      >
                        {fam.title}
                      </h2>
                      <p
                        className="mt-0.5 text-[10px] leading-[1.35] text-ink-400"
                        style={HEAD}
                      >
                        {fam.blurb}
                      </p>
                    </div>

                    <ul className="mt-1">
                      {list.map(t => (
                        <li key={t.id}>
                          <HubCard topic={t} onOpen={onOpen} />
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
          )}
        </FitSheet>
      </div>
    </>
  )
}

function HubCard({
  topic,
  onOpen,
}: {
  topic: Topic
  onOpen: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(topic.id)}
      className="group block w-full border-b border-ink-200 py-2 text-left transition-colors hover:bg-white"
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className="text-[12.5px] font-semibold leading-tight tracking-tight text-ink-950 transition-colors group-hover:text-signal-500"
          style={HEAD}
        >
          {topic.short}
        </h3>
        <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0 text-ink-300 transition-colors group-hover:text-signal-500" />
      </div>

      <p
        className="mt-1 text-[10px] leading-[1.4] text-ink-500"
        style={HEAD}
      >
        {topic.blurb}
      </p>

      {topic.interactive && (
        <span
          className="mt-1.5 inline-flex items-center gap-1 bg-signal-50 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-[0.1em] text-signal-700"
          style={HEAD}
        >
          <SlidersHorizontal className="h-2.5 w-2.5" />
          {topic.interactive}
        </span>
      )}
    </button>
  )
}

// ============================================================
// SHEET VIEW
// ============================================================
function SheetView({
  topic,
  index,
  onBack,
  onGo,
}: {
  topic: Topic
  index: number
  onBack: () => void
  onGo: (id: string) => void
}) {
  const family = FAMILIES.find(f => f.id === topic.family)
  const prev = TOPICS[(index - 1 + TOPICS.length) % TOPICS.length]
  const next = TOPICS[(index + 1) % TOPICS.length]
  const Body = topic.Sheet

  return (
    <>
      {/* ---------- sheet chrome ---------- */}
      <header className="ise-noprint shrink-0 border-b border-ink-200 bg-ink-950 text-paper">
        <div className="flex items-center gap-3 px-3 py-1.5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex shrink-0 items-center gap-1.5 border border-white/20 px-2 py-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-paper transition-colors hover:border-signal-500 hover:bg-signal-500"
            style={HEAD}
          >
            <ArrowLeft className="h-3 w-3" /> All topics
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span
                className="shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] text-signal-400"
                style={HEAD}
              >
                {family?.title}
              </span>
              <h1
                className="truncate text-[13px] font-bold tracking-tight"
                style={HEAD}
              >
                {topic.title}
              </h1>
            </div>
          </div>

          <select
            value={topic.id}
            onChange={e => onGo(e.target.value)}
            className="max-w-[15rem] shrink-0 border border-white/20 bg-ink-900 px-1.5 py-1 text-[9.5px] font-semibold text-paper outline-none focus:border-signal-500"
            style={HEAD}
            aria-label="Jump to topic"
          >
            {FAMILIES.map(f => (
              <optgroup key={f.id} label={f.title}>
                {TOPICS.filter(t => t.family === f.id).map(t => (
                  <option key={t.id} value={t.id}>
                    {t.short}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <div className="flex shrink-0 items-center gap-px">
            <button
              type="button"
              onClick={() => onGo(prev.id)}
              title={`Previous — ${prev.short}`}
              className="border border-white/20 px-1.5 py-1 text-paper transition-colors hover:border-signal-500 hover:bg-signal-500"
              aria-label="Previous topic"
            >
              <ArrowLeft className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onGo(next.id)}
              title={`Next — ${next.short}`}
              className="border border-white/20 px-1.5 py-1 text-paper transition-colors hover:border-signal-500 hover:bg-signal-500"
              aria-label="Next topic"
            >
              <ArrowRight className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              title="Print or save as PDF"
              className="ml-1 border border-white/20 px-1.5 py-1 text-paper transition-colors hover:border-signal-500 hover:bg-signal-500"
              aria-label="Print"
            >
              <Printer className="h-3 w-3" />
            </button>
          </div>
        </div>
      </header>

      {/* ---------- the sheet ---------- */}
      <div className="ise-sheet-body min-h-0 flex-1">
        <FitSheet>
          <SheetHeading topic={topic} />
          <Body />
        </FitSheet>
      </div>
    </>
  )
}

// The title block printed at the top of every sheet. Visible on
// screen and, more importantly, on paper.
function SheetHeading({ topic }: { topic: Topic }) {
  const family = FAMILIES.find(f => f.id === topic.family)
  return (
    <div className="mb-2.5 flex items-end justify-between gap-4 border-b-2 border-ink-950 pb-1.5">
      <div className="min-w-0">
        <span
          className="text-[9px] font-bold uppercase tracking-[0.2em] text-signal-500"
          style={HEAD}
        >
          Cisco ISE · {family?.title}
        </span>
        <h2
          className="text-[19px] font-bold leading-tight tracking-tight text-ink-950"
          style={HEAD}
        >
          {topic.title}
        </h2>
      </div>
      <p
        className="max-w-[38rem] shrink-0 text-right text-[10px] leading-[1.4] text-ink-500"
        style={HEAD}
      >
        {topic.blurb}
      </p>
    </div>
  )
}
