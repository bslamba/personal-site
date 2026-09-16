// ============================================================
// app/vault/page.tsx
//
// The vault landing page. Three tiles: the finance tracker, the
// family photo wall, and the original file vault. Frosted-glass
// theme, mobile-first. Everything here sits behind the vault
// session cookie.
// ============================================================

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Wallet, Images, FolderLock, ArrowRight } from 'lucide-react'
import { verifySession, VAULT_COOKIE } from '@/lib/vault-auth'
import VaultLogout from '@/components/vault/logout-button'

export const metadata: Metadata = {
  title: 'Vault',
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = 'force-dynamic'

const TILES = [
  {
    href: '/vault/finance',
    title: 'Finance',
    desc: 'Month-by-month and year-by-year expenses, income, EMIs and the Bhawneet · Gurneet split — with analysis.',
    icon: Wallet,
    grad: 'linear-gradient(135deg,#7b5be0,#a06be0)',
  },
  {
    href: '/vault/photos',
    title: 'Family Photos',
    desc: 'Upload photos from your phone, sort them into albums, and play them back as a soft slideshow.',
    icon: Images,
    grad: 'linear-gradient(135deg,#4b7bec,#5bd0e0)',
  },
  {
    href: '/vault/files',
    title: 'Files',
    desc: 'Your private file vault — upload, organise into folders, download anywhere.',
    icon: FolderLock,
    grad: 'linear-gradient(135deg,#b0479a,#e0708f)',
  },
]

export default async function VaultHome() {
  const jar = await cookies()
  if (!(await verifySession(jar.get(VAULT_COOKIE)?.value))) redirect('/vault/login')

  return (
    <div className="vg">
      <div className="vg-wrap">
        <div className="vg-top">
          <div>
            <p className="vg-eyebrow">Private</p>
            <h1 className="vg-h1">The Vault</h1>
            <p className="vg-sub">Everything in one quiet place. Only you can see this.</p>
          </div>
          <VaultLogout />
        </div>

        <div className="vg-tiles">
          {TILES.map(t => {
            const Icon = t.icon
            return (
              <Link key={t.href} href={t.href} className="vg-tile">
                <span className="vg-tile-go">
                  <ArrowRight className="h-5 w-5" />
                </span>
                <span className="vg-tile-ic" style={{ background: t.grad }}>
                  <Icon className="h-6 w-6" />
                </span>
                <h3>{t.title}</h3>
                <p>{t.desc}</p>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
