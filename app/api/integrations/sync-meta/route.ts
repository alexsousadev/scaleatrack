import { NextRequest, NextResponse } from 'next/server'
import { syncEnabledMetaAccounts } from '@/lib/meta-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  return NextResponse.json(await syncEnabledMetaAccounts(Number(body?.days || 7)))
}
