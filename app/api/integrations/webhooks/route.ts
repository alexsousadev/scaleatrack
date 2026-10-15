import { NextRequest, NextResponse } from 'next/server'
import { db, initDb, newId } from '@/lib/db'
import { integrationPlatform } from '@/lib/integration-platform'
import { integrationUrl } from '@/lib/integration-url'
import { errorResponse } from '@/lib/request'
import { PLATFORMS, type Platform } from '@/lib/adapters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const platformIds = new Set(PLATFORMS.map((p) => p.id))

function normalizePlatform(value: unknown): Platform {
  const platform = String(value || 'generic').toLowerCase() as Platform
  return platformIds.has(platform) ? platform : 'generic'
}

/** As variacoes de URL que o gateway pede (afiliado, co-produtor, recorrencia). */
function urlsFor(req: NextRequest, platform: string, id: string) {
  const root = integrationUrl(req, platform, id)
  const urls = [{ title: 'URL padrao', url: root }]
  if (platform === 'kirvano' || platform === 'hotmart' || platform === 'cakto') {
    urls.push(
      { title: 'URL para afiliados', url: `${root}?saleType=affiliate` },
      { title: 'URL para co-produtores', url: `${root}?saleType=co-producer` },
      { title: 'URL ignorando recorrencia', url: `${root}?ignoreRecurrence=true` }
    )
  }
  return urls
}

export async function GET(req: NextRequest) {
  try {
    const dashboardId = req.nextUrl.searchParams.get('dashboardId') || ''
    await initDb()
    const r = await db.execute({
      sql: `SELECT id, name, platform, enabled, created_at FROM webhooks WHERE dashboard_id = ? ORDER BY created_at DESC`,
      args: [dashboardId],
    })
    return NextResponse.json({
      webhooks: (r.rows as any[]).map((w) => ({ ...w, platform: integrationPlatform(w.platform, w.name), integrationUrls: urlsFor(req, integrationPlatform(w.platform, w.name), w.id) })),
    })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { dashboardId, name, platform, secret } = await req.json()
    const normalizedPlatform = normalizePlatform(platform)
    await initDb()
    const id = newId()
    await db.execute({
      sql: `INSERT INTO webhooks (id, dashboard_id, name, platform, secret) VALUES (?,?,?,?,?)`,
      args: [id, dashboardId, name || normalizedPlatform, normalizedPlatform, secret || null],
    })
    return NextResponse.json({ id, name: name || normalizedPlatform, platform: normalizedPlatform, integrationUrls: urlsFor(req, normalizedPlatform, id) })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id') || ''
    await initDb()
    const r = await db.execute({ sql: `SELECT dashboard_id FROM webhooks WHERE id = ?`, args: [id] })
    if (!r.rows.length) return NextResponse.json({ ok: true })
    await db.execute({ sql: `DELETE FROM webhooks WHERE id = ?`, args: [id] })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
