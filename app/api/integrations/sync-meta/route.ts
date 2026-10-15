import { NextRequest, NextResponse } from 'next/server'
import { syncEnabledMetaAccounts } from '@/lib/meta-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  if (typeof body.dashboardId !== 'string' || !body.dashboardId.trim()) {
    return NextResponse.json({ error: 'Dashboard obrigatório.' }, { status: 400 })
  }
  try {
    return NextResponse.json(await syncEnabledMetaAccounts(Number(body?.days || 7), body.dashboardId))
  } catch {
    return NextResponse.json({ error: 'Não foi possível sincronizar as contas. Tente novamente.' }, { status: 500 })
  }
}
