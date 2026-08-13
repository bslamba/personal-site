// ============================================================
// app/layout.tsx
//
// TYPE SYSTEM
//   Anton       — the name, brand moments only
//   Inter Tight — headings, nav, labels, buttons
//   Literata    — all reading text (built for long-form on screen)
//
// The header is a dark purple bar with a silver glitter layer and
// a slow shine sweep. Both are decorative pseudo-elements defined
// in globals.css under the BRAND-BAR block.
// ============================================================

import type { Metadata } from 'next'
import { Anton, Inter_Tight, Literata, Kaushan_Script } from 'next/font/google'
import Link from 'next/link'
import IntroGate from '@/components/intro-gate'
import WhatsAppFloat from '@/components/whatsapp-float'
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

// The wordmark only. A brush script rather than a fine one — thin
// copperplate faces disappear at 25px on a dark bar, where Kaushan's
// heavy strokes still read.
const kaushan = Kaushan_Script({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-script',
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
    default: 'Bhawneet Lamba — Infrastructure & Cloud Security Consultant',
    template: '%s · Bhawneet Lamba',
  },
  description:
    'Infrastructure, cloud and application security. 13+ years across Network ' +
    'Access Control, Azure and AWS cloud security, and web application firewalls. ' +
    'Cisco ISE, Aruba ClearPass, F5, AWS WAF, Azure WAF.',
  keywords: [
    'Infrastructure Security', 'Cloud Security', 'Application Security',
    'Cisco ISE', 'Aruba ClearPass', 'Network Access Control', 'NAC',
    'RADIUS', 'TACACS+', '802.1x', 'EAP-TLS',
    'WAF', 'AWS WAF', 'Azure WAF', 'F5 ASM',
    'Microsoft Azure', 'Zero Trust', 'Bangalore',
  ],
  authors: [{ name: 'Bhawneet Singh Lamba' }],
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: SITE_URL,
    siteName: 'Bhawneet Lamba',
    title: 'Bhawneet Lamba — Infrastructure & Cloud Security Consultant',
    description:
      '13+ years securing enterprise infrastructure, cloud platforms and applications.',
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
  { href: '/tools',       label: 'Tools' },
]

// ============================================================
// Vault mark — a vault door with a spinning dial. The dial turns
// on hover; the rotation is handled by .vault-badge in CSS.
// ============================================================
function VaultMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="vaultGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#D3002D" />
          <stop offset="55%"  stopColor="#D3002D" />
          <stop offset="100%" stopColor="#D3002D" />
        </linearGradient>
      </defs>

      {/* door frame */}
      <rect
        x="3.2" y="4.6" width="25.6" height="22.8" rx="3.4"
        stroke="url(#vaultGrad)" strokeWidth="1.7"
      />
      {/* hinge nubs */}
      <path d="M3.2 11.2h2.1M3.2 20.8h2.1" stroke="url(#vaultGrad)" strokeWidth="1.5" strokeLinecap="round" />

      {/* dial */}
      <circle cx="16" cy="16" r="6.1" stroke="url(#vaultGrad)" strokeWidth="1.7" />
      <circle cx="16" cy="16" r="2" fill="url(#vaultGrad)" />

      {/* spokes */}
      <path
        d="M16 9.9V7.4M16 22.1v2.5M9.9 16H7.4M22.1 16h2.5"
        stroke="url(#vaultGrad)" strokeWidth="1.6" strokeLinecap="round"
      />
      <path
        d="M20.35 11.65l1.75-1.75M11.65 20.35l-1.75 1.75M20.35 20.35l1.75 1.75M11.65 11.65L9.9 9.9"
        stroke="url(#vaultGrad)" strokeWidth="1.3" strokeLinecap="round" opacity="0.7"
      />
    </svg>
  )
}

// The bar is `position: fixed` — that is set on .brand-bar in
// globals.css, together with the body padding that reserves its 48px.
function Header() {
  return (
    <header className="brand-bar z-50">
      {/* decorative shine sweep — sits behind .brand-inner */}
      <span className="brand-sheen" aria-hidden="true" />

      <div className="brand-inner container-page flex h-12 items-center justify-between gap-4">

        {/* ---------- wordmark ----------
            One flowing script line rather than the old stacked block —
            cursive needs the horizontal run to be worth reading. The
            tilt, the drop and the hover zoom live in .brand-logo.     */}
        <Link href="/" className="brand-logo" aria-label="Bhawneet Lamba — home">
          <span className="brand-logo-plate">
            <span className="brand-logo-line">
              <span className="brand-logo-first">Bhawneet</span>{' '}
              <span className="brand-logo-last">Lamba</span>
            </span>
          </span>
        </Link>

        {/* ---------- desktop nav ---------- */}
        <nav className="hidden items-center gap-5 md:flex lg:gap-6">
          {NAV.map(item => (
            <Link key={item.href} href={item.href} className="nav-link neon-link">
              {item.label}
            </Link>
          ))}

          <Link href="/vault" className="vault-badge" title="Private vault" aria-label="Private vault">
            <VaultMark className="h-[19px] w-[19px]" />
          </Link>

          <Link
            href="/#contact"
            className="neon-pill px-3.5 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.15em]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Contact
          </Link>
        </nav>

        {/* ---------- mobile ---------- */}
        <div className="flex items-center gap-2.5 md:hidden">
          <Link href="/vault" className="vault-badge" title="Private vault" aria-label="Private vault">
            <VaultMark className="h-[18px] w-[18px]" />
          </Link>
          <Link
            href="/#contact"
            className="neon-pill px-3 py-1.5 text-[0.62rem] font-bold uppercase tracking-[0.14em]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Contact
          </Link>
        </div>

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
              Infrastructure, cloud and application security.
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
                <a
                  href="https://www.linkedin.com/in/bhawneet-singh-lamba-92632064/"
                  target="_blank" rel="noopener noreferrer"
                  className="text-base text-ink-300 transition-colors hover:text-paper"
                >
                  LinkedIn
                </a>
              </li>
              <li>
                <a
                  href="https://wa.me/918447732553"
                  target="_blank" rel="noopener noreferrer"
                  className="text-base text-ink-300 transition-colors hover:text-paper"
                >
                  WhatsApp
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
      className={`${anton.variable} ${interTight.variable} ${literata.variable} ${kaushan.variable}`}
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

        <WhatsAppFloat />

      </body>
    </html>
  )
}
