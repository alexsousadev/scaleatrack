import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'

const COOKIE_NAME = 'scaletrack_auth'

function authToken() {
  const password = process.env.PANEL_PASSWORD
  if (!password) return null

  const secret = process.env.PANEL_AUTH_SECRET || password
  return createHash('sha256').update(`${password}:${secret}`).digest('hex')
}

function same(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function POST(req: NextRequest) {
  const expectedPassword = process.env.PANEL_PASSWORD
  if (!expectedPassword) return NextResponse.json({ ok: true })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const password = String(body?.password || '')
  if (!same(password, expectedPassword)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const token = authToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token!, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
