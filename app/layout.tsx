// ============================================================
// app/layout.tsx
// Fonts, SEO, header, footer, and the intro gate.
// ============================================================

import type { Metadata } from 'next'
import { Anton, Syne, Space_Grotesk } from 'next/font/google'
import Link from 'next/link'
import IntroGate from '@/components/intro-gate'
import './globals.css'

// --- Fonts -------------------------------------------------
// next/font downloads these at build time and serves them from
// your own domain: fast, and no request to Google at runtime.

// Poster display face. Used only for the giant name.
const anton = Anton({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-anton',
})

// Distinctive modern face. Nav, headings, labels, buttons.
const syne = Syne({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  display: 'swap',
  variable: '--font-syne',
})

// Body copy. Technical but warm.
const grotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-grotesk',
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
      <div className="container-page flex h-[72px] items-center justify-between">

        <Link href="/" className="group flex items-center gap-2.5">
          <span className="block h-2.5 w-2.5 bg-signal-500 transition-transform duration-300 group-hover:rotate-45" />
          <span
            className="text-sm font-extrabold uppercase tracking-[0.2em]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Bhawneet
          </span>
        </Link>

        <nav className="hidden items-center gap-9 md:flex">
          {NAV.map(item => (
            <Link key={item.href} href={item.href} className="nav-link text-ink-700 hover:text-ink-950">
              {item.label}
            </Link>
          ))}
          <Link
            href="/#contact"
            className="nav-link bg-signal-500 px-4 py-2 text-paper hover:bg-ink-950"
          >
            Contact
          </Link>
        </nav>

        <Link
          href="/#contact"
          className="nav-link bg-signal-500 px-4 py-2 text-paper md:hidden"
        >
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
            <p className="display-xl text-[clamp(2rem,6vw,4rem)] leading-[0.85]">
              Bhawneet
              <span className="block text-signal-500">Lamba</span>
            </p>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-400">
              Infrastructure Security Consultant &amp; Network Expert.
              Whitefield, Bangalore, India.
            </p>
          </div>

          <div>
            <span className="label text-signal-500">Navigate</span>
            <ul className="mt-5 space-y-3">
              {NAV.map(item => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-ink-300 transition-colors hover:text-paper">
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
                <a
                  href="mailto:bhawneetlamba@outlook.com"
                  className="text-sm text-ink-300 transition-colors hover:text-paper"
                >
                  bhawneetlamba@outlook.com
                </a>
              </li>
              <li>
                <a href="tel:+918447732553" className="text-sm text-ink-300 transition-colors hover:text-paper">
                  +91 8447732553
                </a>
              </li>
              <li>
                <a
                  href="https://www.linkedin.com/in/bhawneet-singh-lamba-92632064/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-ink-300 transition-colors hover:text-paper"
                >
                  LinkedIn
                </a>
              </li>
            </ul>
          </div>

        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-ink-800 pt-7">
          <span className="text-xs text-ink-500">
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
      className={`${anton.variable} ${syne.variable} ${grotesk.variable}`}
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
