// ============================================================
// app/blog/cisco-ise-cheat-sheet/page.tsx
//
// The Cisco ISE cheat sheet: a hub of topics, each opening into
// a single no-scroll sheet. All of the interactivity lives in
// the client component; this file is metadata and structured
// data only.
// ============================================================

import type { Metadata } from 'next'
import CheatSheet from '@/components/ise/cheat-sheet'
import { TOPICS } from '@/components/ise/topics'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
const URL = `${SITE_URL}/blog/cisco-ise-cheat-sheet`

export const metadata: Metadata = {
  title: 'The Cisco ISE Cheat Sheet — Every Topic on One Screen',
  description:
    'A complete Cisco ISE reference: architecture, personas, sizing, licensing, ' +
    'policy sets, EAP methods, 802.1X, MAB, RADIUS and CoA, profiling probes, ' +
    'posture, guest, BYOD, TrustSec, pxGrid, TACACS+, upgrades and ' +
    'troubleshooting — each topic on a single screen with the configuration ' +
    'for every option.',
  keywords: [
    'Cisco ISE', 'Cisco ISE cheat sheet', 'ISE 3.4', 'ISE 3.5',
    'Network Access Control', 'NAC', 'RADIUS', 'TACACS+', '802.1X', 'MAB',
    'EAP-TLS', 'TEAP', 'PEAP', 'CoA', 'Profiling', 'Posture', 'BYOD',
    'Guest Access', 'TrustSec', 'SGT', 'pxGrid', 'Passive ID',
    'ISE licensing', 'ISE ports', 'ISE upgrade',
  ],
  authors: [{ name: 'Bhawneet Singh Lamba', url: SITE_URL }],
  alternates: { canonical: URL },
  openGraph: {
    type: 'article',
    url: URL,
    title: 'The Cisco ISE Cheat Sheet',
    description:
      'Every Cisco ISE topic on a single screen each — concepts, complete ' +
      'configuration and packet flow, with interactive selectors wherever a ' +
      'scenario has more than one option.',
    authors: ['Bhawneet Singh Lamba'],
  },
  twitter: {
    card: 'summary',
    title: 'The Cisco ISE Cheat Sheet',
    description:
      'Every Cisco ISE topic on a single screen each, with the configuration ' +
      'for every option.',
  },
}

export default function CiscoIseCheatSheetPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'TechArticle',
            headline: 'The Cisco ISE Cheat Sheet',
            description:
              'A complete Cisco ISE technical reference covering architecture, ' +
              'policy, access methods, profiling, posture, segmentation, ' +
              'integrations and operations.',
            about: TOPICS.map(t => ({ '@type': 'Thing', name: t.title })),
            keywords: TOPICS.flatMap(t => t.tags).join(', '),
            mainEntityOfPage: { '@type': 'WebPage', '@id': URL },
            author: {
              '@type': 'Person',
              name: 'Bhawneet Singh Lamba',
              jobTitle: 'Infrastructure Security Consultant',
              url: SITE_URL,
              sameAs: [
                'https://www.linkedin.com/in/bhawneet-singh-lamba-92632064/',
              ],
            },
            publisher: {
              '@type': 'Person',
              name: 'Bhawneet Singh Lamba',
              url: SITE_URL,
            },
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
              {
                '@type': 'ListItem',
                position: 2,
                name: 'Journal',
                item: `${SITE_URL}/blog`,
              },
              {
                '@type': 'ListItem',
                position: 3,
                name: 'The Cisco ISE Cheat Sheet',
                item: URL,
              },
            ],
          }),
        }}
      />

      <CheatSheet />
    </>
  )
}
