'use client'

// ============================================================
// components/vault/install-hint.tsx
//
// On an iPhone or iPad in Safari, a small card explains how to install
// the vault as an app: Share → Add to Home Screen. It never shows once the
// vault is running as the installed app, on other devices, or after it has
// been dismissed (remembered in localStorage).
// ============================================================

import { useState, useSyncExternalStore } from 'react'

const KEY = 'vg-install-hint'

function shouldShow(): boolean {
  try {
    const ua = navigator.userAgent
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
    const installed = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches
    return ios && safari && !installed && localStorage.getItem(KEY) !== 'no'
  } catch {
    return false
  }
}
const noop = () => () => {}

export function InstallHint() {
  const eligible = useSyncExternalStore(noop, shouldShow, () => false)
  const [closed, setClosed] = useState(false)
  if (!eligible || closed) return null
  const close = () => {
    try { localStorage.setItem(KEY, 'no') } catch { /* private mode: just hide it */ }
    setClosed(true)
  }
  return (
    <div className="vg-install" role="dialog" aria-label="Install the Vault app">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/vault-app/icon-192.png" alt="" width={44} height={44} />
      <div className="vg-install-txt">
        <b>Install Vault on your iPhone</b>
        <span>
          Tap{' '}
          <svg viewBox="0 0 24 24" aria-label="Share" role="img"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" /><path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v7A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16" /></svg>
          {' '}then <b>Add to Home Screen</b>
        </span>
      </div>
      <button type="button" onClick={close} aria-label="Dismiss">×</button>
    </div>
  )
}
