import type { NextRequest } from 'next/server'

export function integrationUrl(req: NextRequest, platform: string, id: string) {
  const base = (process.env.APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
  return `${base}/api/webhooks/${encodeURIComponent(platform)}/${encodeURIComponent(id)}`
}
