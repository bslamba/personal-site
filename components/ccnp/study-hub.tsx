'use client'

// ============================================================
// components/ccnp/study-hub.tsx
//
// The index for the CCNA / ENCOR / ENARSI track.
//
// Every blueprint topic, in Cisco's own numbering, grouped by exam and
// domain. Search runs over titles, sub-items, tags and lab descriptions at
// once, so "feasible successor", "SIA" and "1.9" all find EIGRP.
//
// A topic with an article links to it. A topic without one still shows its
// sub-items and its lab, because knowing what you have to learn is useful
// before somebody has written it down for you.
// ============================================================

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, ChevronRight, FlaskConical, ArrowUpRight, X } from 'lucide-react'
import { EXAMS, ALL_TOPICS, COUNTS, type ExamId } from './curriculum'

type Filter = ExamId | 'all'

const EXAM_ACCENT: Record<ExamId, string> = {
  ccna: 'bg-signal-500',
  encor: 'bg-ink-800',
  enarsi: 'bg-signal-700',
}

export default function StudyHub() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const q = query.trim().toLowerCase()

  const hits = useMemo(() => {
    if (!q) return null
    const terms = q.split(/\s+/)
    return ALL_TOPICS.filter(t =>
      (filter === 'all' || t.exam.id === filter) &&
      terms.every(term => t.haystack.includes(term)),
    )
  }, [q, filter])

  const exams = EXAMS.filter(e => filter === 'all' || e.id === filter)
  const key = (examId: string, n: string) => `${examId}:${n}`

  return (
    <div className="ccnp">
      {/* ---------- search + filter ---------- */}
      <div className="ccnp-controls">
        <div className="ccnp-search">
          <Search className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search 105 topics — try “feasible successor”, “NSSA”, “CoPP”, “3.2”"
            aria-label="Search every exam topic"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search" className="ccnp-clear">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="ccnp-filters" role="group" aria-label="Filter by exam">
          {(['all', 'ccna', 'encor', 'enarsi'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`ccnp-filter${filter === f ? ' is-on' : ''}`}
            >
              {f === 'all' ? 'All three' : EXAMS.find(e => e.id === f)!.short}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- search results ---------- */}
      {hits && (
        <div className="ccnp-results">
          <p className="ccnp-count">
            {hits.length === 0
              ? <>Nothing matches <b>{query}</b>. Try a protocol name, a blueprint number, or a term like “redistribution”.</>
              : <><b>{hits.length}</b> {hits.length === 1 ? 'topic' : 'topics'} matching <b>{query}</b></>}
          </p>
          <ul className="ccnp-hitlist">
            {hits.map(t => (
              <li key={key(t.exam.id, t.n)}>
                <TopicRow topic={t} examShort={t.exam.short} domainTitle={t.domain.title} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------- full tree ---------- */}
      {!hits && exams.map(exam => (
        <section key={exam.id} className="ccnp-exam" id={exam.id}>
          <header className="ccnp-exam-head">
            <span className={`ccnp-dot ${EXAM_ACCENT[exam.id]}`} aria-hidden="true" />
            <div>
              <h2 className="ccnp-exam-title">
                {exam.short} <span className="ccnp-code">{exam.code}</span>{' '}
                <span className="ccnp-ver">{exam.version}</span>
              </h2>
              <p className="ccnp-exam-blurb">{exam.blurb}</p>
              <p className="ccnp-exam-meta">
                {exam.minutes} minutes · {exam.domains.length} domains ·{' '}
                {exam.domains.reduce((n, d) => n + d.topics.length, 0)} topics ·{' '}
                <a href={exam.official} target="_blank" rel="noopener noreferrer">
                  official blueprint <ArrowUpRight className="inline h-3 w-3" />
                </a>
              </p>
            </div>
          </header>

          {exam.domains.map(domain => {
            const k = key(exam.id, domain.n)
            const isOpen = open[k] ?? true
            return (
              <div key={k} className="ccnp-domain">
                <button
                  className="ccnp-domain-head"
                  onClick={() => setOpen(o => ({ ...o, [k]: !isOpen }))}
                  aria-expanded={isOpen}
                >
                  <ChevronRight className={`h-4 w-4 transition-transform${isOpen ? ' rotate-90' : ''}`} />
                  <span className="ccnp-domain-n">{domain.n}</span>
                  <span className="ccnp-domain-title">{domain.title}</span>
                  <span className="ccnp-weight">{domain.weight}%</span>
                </button>
                {isOpen && (
                  <ul className="ccnp-topics">
                    {domain.topics.map(t => (
                      <li key={t.n}><TopicRow topic={t} /></li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </section>
      ))}

      <p className="ccnp-foot">
        {COUNTS.topics} topics · {COUNTS.subs} sub-items · {COUNTS.labs} labs ·{' '}
        {COUNTS.written} written so far. Numbering follows Cisco&rsquo;s published blueprints exactly,
        so you can check this page against the official PDF line by line.
      </p>
    </div>
  )
}

function TopicRow({
  topic, examShort, domainTitle,
}: {
  topic: { n: string; title: string; subs?: string[]; slug?: string; lab?: string }
  examShort?: string
  domainTitle?: string
}) {
  const body = (
    <>
      <div className="ccnp-topic-head">
        <span className="ccnp-n">{topic.n}</span>
        <span className="ccnp-title">{topic.title}</span>
        {topic.slug && <span className="ccnp-read">Read</span>}
      </div>
      {examShort && (
        <p className="ccnp-breadcrumb">{examShort} · {domainTitle}</p>
      )}
      {topic.subs && topic.subs.length > 0 && (
        <ul className="ccnp-subs">
          {topic.subs.map(s => <li key={s}>{s}</li>)}
        </ul>
      )}
      {topic.lab && (
        <p className="ccnp-lab">
          <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span><b>Lab:</b> {topic.lab}</span>
        </p>
      )}
    </>
  )

  if (topic.slug) {
    return <Link href={`/blog/${topic.slug}`} className="ccnp-topic is-link">{body}</Link>
  }
  return <div className="ccnp-topic">{body}</div>
}
