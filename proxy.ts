// ============================================================
// proxy.ts  (project root — NOT middleware.ts)
//
// Guards the private vault. Next.js 16 renamed middleware.ts to
// proxy.ts; a file named middleware.ts is silently ignored.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server'
import { verifySession, VAULT_COOKIE } from '@/lib/vault-auth'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isVaultPage = pathname === '/vault' || pathname.startsWith('/vault/')
  const isLogin     = pathname === '/vault/login'
  const isVaultApi  = pathname.startsWith('/api/vault/')
                      && !pathname.startsWith('/api/vault/login')
                      && !pathname.startsWith('/api/vault/logout')

  if (!isVaultPage && !isVaultApi) return NextResponse.next()

  const ok = await verifySession(request.cookies.get(VAULT_COOKIE)?.value)

  if (isLogin) {
    if (ok) {
      const url = request.nextUrl.clone()
      url.pathname = '/vault'
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  if (!ok) {
    if (isVaultApi) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/vault/login'
    return NextResponse.redirect(url)
  }

  // Never let a private page be cached or indexed
  const res = NextResponse.next()
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}

export const config = {
  matcher: ['/vault/:path*', '/api/vault/:path*'],
}
