// ============================================================
// app/happy-birthday/page.tsx
//
// A birthday page for Parteek "Nishu" Kaur — 25 September 2026.
//
// Public, because it has to be openable from a phone with nothing
// but the link. Not indexed, because a surprise for one person has
// no business turning up in a search for anyone else, and neither
// does her face. The link is the key; search engines are told to
// look away.
// ============================================================

import type { Metadata } from 'next'
import BirthdayPage from '@/components/birthday/birthday'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  title: 'Happy Birthday, Nishu',
  description: 'For the love of my life, on her thirtieth. 25 September 2026.',

  // Reachable by anyone with the link, invisible to everyone else.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },

  alternates: { canonical: `${SITE_URL}/happy-birthday` },

  // A warm card if he sends the link on WhatsApp, without putting
  // her photograph into anyone's link preview.
  openGraph: {
    type: 'website',
    title: 'Happy Birthday, Nishu ♥',
    description: 'Tap to open your surprise.',
    url: `${SITE_URL}/happy-birthday`,
  },
  twitter: {
    card: 'summary',
    title: 'Happy Birthday, Nishu ♥',
    description: 'Tap to open your surprise.',
  },
}

// Nothing on this page is stale-able — it is a static shell with a
// clock inside it — so let it be prerendered and served instantly.
export const dynamic = 'force-static'

export default function HappyBirthday() {
  return <BirthdayPage />
}
