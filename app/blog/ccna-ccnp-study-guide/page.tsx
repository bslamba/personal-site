// ============================================================
// app/blog/ccna-ccnp-study-guide/page.tsx
//
// The hub for the CCNA / ENCOR / ENARSI track: every blueprint topic in
// Cisco's own numbering, searchable, each linking to its own article.
//
// This file is metadata and structured data only — the index itself is the
// client component, because the search has to run in the browser.
// ============================================================

import type { Metadata } from 'next'
import Link from 'next/link'
import StudyHub from '@/components/ccnp/study-hub'
import { EXAMS, COUNTS } from '@/components/ccnp/curriculum'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
const URL = `${SITE_URL}/blog/ccna-ccnp-study-guide`

const TITLE = 'CCNA, ENCOR and ENARSI — The Complete Topic-by-Topic Study Guide'
const DESCRIPTION =
  'Every topic on the CCNA 200-301 v1.1, ENCOR 350-401 v1.2 and ENARSI 300-410 blueprints, ' +
  'explained from first principles with packet flows, architecture diagrams, full configuration, ' +
  'a hands-on lab for each, and knowledge checks. Searchable, in Cisco’s own numbering.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'CCNA', 'CCNA 200-301', 'CCNA study guide', 'CCNA v1.1',
    'CCNP Enterprise', 'ENCOR', '350-401', 'ENCOR study guide', 'ENCOR v1.2',
    'ENARSI', '300-410', 'ENARSI study guide',
    'CCNA exam topics', 'ENCOR exam topics', 'ENARSI exam topics',
    'CCNP labs', 'CCNA labs', 'Cisco certification', 'network engineer',
    'OSPF', 'EIGRP', 'BGP', 'spanning tree', 'VLAN', 'VXLAN', 'LISP',
    'SD-WAN', 'SD-Access', 'DMVPN', 'MPLS', 'QoS', 'NetFlow', 'NETCONF', 'RESTCONF',
  ],
  authors: [{ name: 'Bhawneet Singh Lamba', url: SITE_URL }],
  alternates: { canonical: URL },
  openGraph: {
    type: 'article',
    url: URL,
    title: TITLE,
    description: DESCRIPTION,
    siteName: 'Bhawneet Lamba',
    locale: 'en_IN',
    authors: ['Bhawneet Singh Lamba'],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
}

export default function StudyGuidePage() {
  const totalMinutes = EXAMS.reduce((n, e) => n + e.minutes, 0)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Course',
            name: TITLE,
            description: DESCRIPTION,
            url: URL,
            provider: { '@type': 'Person', name: 'Bhawneet Singh Lamba', url: SITE_URL },
            author: { '@type': 'Person', name: 'Bhawneet Singh Lamba', url: SITE_URL },
            inLanguage: 'en',
            educationalLevel: 'Professional Certification',
            teaches: EXAMS.flatMap(e => e.domains.map(d => `${e.short} ${d.n} ${d.title}`)),
            hasCourseInstance: EXAMS.map(e => ({
              '@type': 'CourseInstance',
              name: `${e.short} ${e.code} ${e.version}`,
              description: e.blurb,
              courseMode: 'online',
            })),
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
              { '@type': 'ListItem', position: 3, name: 'CCNA, ENCOR and ENARSI Study Guide', item: URL },
            ],
          }),
        }}
      />

      <div className="container-page py-10 sm:py-12">
        <Link href="/blog" className="mb-6 inline-flex items-center gap-2 text-sm text-signal-500 hover:underline">
          &larr; Journal
        </Link>

        <div className="mb-6 flex items-center gap-4">
          <span className="h-px w-12 bg-signal-500" />
          <span className="label text-signal-500">Networking · Certification</span>
        </div>

        <h1 className="heading mb-5 text-[clamp(1.9rem,4vw,3rem)] leading-[1.08]">
          CCNA, ENCOR and ENARSI, topic by topic
        </h1>

        <div className="mb-8 max-w-[var(--measure-wide)] space-y-4 text-ink-600">
          <p className="text-lg">
            Every topic on three Cisco blueprints — <b>{COUNTS.topics} of them</b>, with{' '}
            {COUNTS.subs} sub-items and {COUNTS.labs} labs — in Cisco&rsquo;s own numbering, so you can
            check this against the official PDF line by line and see exactly what is left.
          </p>
          <p>
            Each topic gets its own article: the concept built from first principles, an
            architecture diagram, the packet flow, the configuration explained line by line,
            the failure modes, a lab to build it yourself, and a knowledge check at the end.
            Written for somebody meeting the topic for the first time.
          </p>
          <p className="text-sm text-ink-500">
            {EXAMS.map(e => `${e.short} ${e.code} ${e.version}`).join(' · ')} ·{' '}
            {totalMinutes} minutes of exam between them.
          </p>
        </div>

        <StudyHub />
      </div>
    </>
  )
}
