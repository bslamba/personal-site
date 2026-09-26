// ============================================================
// app/vault/layout.tsx
//
// The vault's themes. The stylesheet for all of them comes from
// lib/vault-themes.ts, and a tiny script applies the chosen one before the
// first paint, so a dark theme never flashes light on load. ThemeSync puts
// it back after a client-side navigation, where that script does not rerun.
//
// It also makes the vault an iPhone web app: Safari → Share → Add to Home
// Screen installs "Vault" with its own icon and launch screen, opening full
// screen at /vault. The manifest and images live outside /vault (in
// public/) so the sign-in guard in proxy.ts never blocks them.
// ============================================================

import type { Metadata, Viewport } from 'next'
import { themeCss, THEME_BOOT } from '@/lib/vault-themes'
import { ThemeSync } from '@/components/vault/vault-chrome'
import { InstallHint } from '@/components/vault/install-hint'

// iPhone launch screens, by the screen they fit (points × pixel ratio).
const splash = (w: number, h: number, file: string) => ({
  url: `/vault-app/${file}`,
  media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)`,
})

export const metadata: Metadata = {
  manifest: '/vault.webmanifest',
  applicationName: 'Vault',
  icons: { apple: [{ url: '/vault-app/apple-touch-icon.png', sizes: '180x180' }] },
  appleWebApp: {
    capable: true,
    title: 'Vault',
    statusBarStyle: 'black-translucent',
    startupImage: [
      splash(393, 852, 'splash-1179x2556.png'),   // iPhone 15, 15 Pro, 14 Pro
      splash(430, 932, 'splash-1290x2796.png'),   // iPhone 15 Plus, 15 Pro Max
      splash(390, 844, 'splash-1170x2532.png'),   // iPhone 12–14
    ],
  },
  formatDetection: { telephone: false },
}

// Draw under the notch and home bar; the vault pads itself with the
// safe-area insets. No pinch-zoom inside the app.
export const viewport: Viewport = {
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0b0c0f',
}

export default function VaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      <ThemeSync />
      {/* Present for as long as any vault page is — including the moment
          between two of them — so the portfolio's header and footer never
          flash on screen while the vault is loading. See globals.css. */}
      <span className="vg-scope" hidden />
      {children}
      <InstallHint />
    </>
  )
}
