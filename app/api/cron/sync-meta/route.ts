import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/cron-auth'
import { syncEnabledMetaAccounts } from '@/lib/meta-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Sincroniza gasto da Meta pra todas as contas habilitadas.
 * Reprocessa os ultimos N dias porque a Meta ainda mexe no gasto retroativo.
 *
 *   GET /api/cron/sync-meta?days=7   (header: x-cron-secret)
 */
export async function GET(req: NextRequest) {
  const unauthorized = requireCronSecret(req)
  if (unauthorized) return unauthorized

  return NextResponse.json(await syncEnabledMetaAccounts(Number(req.nextUrl.searchParams.get('days') || 3)))
}
