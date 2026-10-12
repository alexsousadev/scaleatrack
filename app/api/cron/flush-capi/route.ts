import { NextRequest, NextResponse } from 'next/server'
import { flushCapiQueue } from '@/lib/capi'
import { requireCronSecret } from '@/lib/cron-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const unauthorized = requireCronSecret(req)
  if (unauthorized) return unauthorized

  return NextResponse.json(await flushCapiQueue(200))
}
