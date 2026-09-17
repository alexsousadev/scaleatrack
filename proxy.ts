import { NextResponse, type NextRequest } from 'next/server'

const COOKIE_NAME = 'scaletrack_auth'

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function authToken() {
  const password = process.env.PANEL_PASSWORD
  if (!password) return null

  const secret = process.env.PANEL_AUTH_SECRET || password
  const data = new TextEncoder().encode(`${password}:${secret}`)
  return toHex(await crypto.subtle.digest('SHA-256', data))
}

function isPublicPath(pathname: string) {
  if (pathname === '/login') return true
  if (pathname === '/t.js') return true
  if (pathname.startsWith('/api/auth/')) return true
  if (pathname.startsWith('/api/collect')) return true
  if (pathname.startsWith('/api/pixel-config')) return true
  if (pathname.startsWith('/api/webhooks/')) return true
  if (pathname.startsWith('/api/cron/')) return true
  return false
}

export async function proxy(request: NextRequest) {
  const expected = await authToken()
  if (!expected || isPublicPath(request.nextUrl.pathname)) return NextResponse.next()

  const current = request.cookies.get(COOKIE_NAME)?.value
  if (current === expected) return NextResponse.next()

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'nao autorizado' }, { status: 401 })
  }

  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
