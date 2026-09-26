// ============================================================
// app/vault/layout.tsx
//
// The vault's themes. The stylesheet for all of them comes from
// lib/vault-themes.ts, and a tiny script applies the chosen one before the
// first paint, so a dark theme never flashes light on load. ThemeSync puts
// it back after a client-side navigation, where that script does not rerun.
// ============================================================

import { themeCss, THEME_BOOT } from '@/lib/vault-themes'
import { ThemeSync } from '@/components/vault/vault-chrome'

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
    </>
  )
}
