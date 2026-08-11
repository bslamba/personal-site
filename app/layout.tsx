// ============================================================
// app/layout.tsx
//
// TYPE SYSTEM
//   Anton       — the name, brand moments only
//   Inter Tight — headings, nav, labels, buttons
//   Literata    — all reading text (built for long-form on screen)
// ============================================================

import type { Metadata } from 'next'
import { Anton, Inter_Tight, Literata } from 'next/font/google'
import Link from 'next/link'
import IntroGate from '@/components/intro-gate'
import './globals.css'

const anton = Anton({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-anton',
})

const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-inter-tight',
})

const literata = Literata({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-literata',
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Bhawneet Lamba — Infrastructure Security Consultant',
    template: '%s · Bhawneet Lamba',
  },
  description:
    'Infrastructure Security Consultant with 13+ years in Network Access Control, ' +
    'AAA protocols and network architecture. Cisco ISE, Aruba ClearPass, WAF, Azure.',
  keywords: [
    'Cisco ISE', 'Aruba ClearPass', 'Network Access Control', 'NAC',
    'RADIUS', 'TACACS+', '802.1x', 'EAP-TLS', 'WAF', 'Azure',
    'Infrastructure Security', 'Bangalore',
  ],
  authors: [{ name: 'Bhawneet Singh Lamba' }],
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: SITE_URL,
    siteName: 'Bhawneet Lamba',
    title: 'Bhawneet Lamba — Infrastructure Security Consultant',
    description: '13+ years securing enterprise networks.',
  },
  robots: { index: true, follow: true },

  // Google Search Console — paste your content value here
  // verification: { google: 'your-verification-string' },
}

const NAV = [
  { href: '/#profile',    label: 'Profile' },
  { href: '/#experience', label: 'Experience' },
  { href: '/#expertise',  label: 'Expertise' },
  { href: '/blog',        label: 'Journal' },
]

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-ink-900/10 bg-paper/85 backdrop-blur-lg">
      <div className="container-page flex h-[68px] items-center justify-between">

        <Link href="/" className="group flex items-center gap-2.5">
          <span className="block h-2.5 w-2.5 bg-signal-500 transition-transform duration-300 group-hover:rotate-45" />
          <span
            className="text-sm font-bold uppercase tracking-[0.16em]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Bhawneet
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map(item => (
            <Link key={item.href} href={item.href} className="nav-link text-ink-700 hover:text-ink-950">
              {item.label}
            </Link>
          ))}
          <Link href="/#contact" className="nav-link bg-signal-500 px-4 py-2 text-paper hover:bg-ink-950">
            Contact
          </Link>
        </nav>

        <Link href="/#contact" className="nav-link bg-signal-500 px-4 py-2 text-paper md:hidden">
          Contact
        </Link>

      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="bg-ink-950 text-paper">
      <div className="container-page py-16">

        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">

          <div className="lg:col-span-2">
            <p className="display-xl text-[clamp(1.75rem,4.5vw,3rem)] leading-[0.9]">
              Bhawneet
              <span className="block text-signal-500">Lamba</span>
            </p>
            <p className="mt-5 max-w-sm text-base leading-relaxed text-ink-400">
              Infrastructure Security Consultant &amp; Network Expert.
              Whitefield, Bangalore, India.
            </p>
          </div>

          <div>
            <span className="label text-signal-500">Navigate</span>
            <ul className="mt-5 space-y-3">
              {NAV.map(item => (
                <li key={item.href}>
                  <Link href={item.href} className="text-base text-ink-300 transition-colors hover:text-paper">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <span className="label text-signal-500">Direct</span>
            <ul className="mt-5 space-y-3">
              <li>
                <a href="mailto:bhawneetlamba@outlook.com"
                   className="text-base text-ink-300 transition-colors hover:text-paper">
                  bhawneetlamba@outlook.com
                </a>
              </li>
              <li>
                <a href="tel:+918447732553"
                   className="text-base text-ink-300 transition-colors hover:text-paper">
                  +91 8447732553
                </a>
              </li>
              <li>
                <a
                  href="https://www.linkedin.com/in/bhawneet-singh-lamba-92632064/"
                  target="_blank" rel="noopener noreferrer"
                  className="text-base text-ink-300 transition-colors hover:text-paper"
                >
                  LinkedIn
                </a>
              </li>
            </ul>
          </div>

        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-ink-800 pt-7">
          <span className="text-sm text-ink-500">
            © {new Date().getFullYear()} Bhawneet Singh Lamba
          </span>
          <span className="label text-ink-600">Built from scratch</span>
        </div>

      </div>
    </footer>
  )
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${interTight.variable} ${literata.variable}`}
    >
      <body className="flex min-h-screen flex-col">

        <IntroGate />

        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[110] focus:bg-signal-500 focus:px-4 focus:py-2 focus:text-sm focus:text-paper"
        >
          Skip to content
        </a>

        <Header />
        <main id="main" className="flex-1">{children}</main>
        <Footer />

      </body>
    </html>
  )
}
