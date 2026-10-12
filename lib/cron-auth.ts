import { NextRequest, NextResponse } from 'next/server'

export function requireCronSecret(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

  if (!cronSecret || (secret !== cronSecret && bearer !== cronSecret)) {
    return NextResponse.json({ error: 'nao autorizado' }, { status: 401 })
  }

  return null
}
