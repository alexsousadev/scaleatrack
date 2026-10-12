import { NextRequest, NextResponse } from 'next/server'
import { db, initDb, newId } from '@/lib/db'
import { errorResponse } from '@/lib/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function maskToken(token: string) {
  if (!token) return ''
  return `${token.slice(0, 3)}****${token.slice(-6)}`
}

export async function GET(req: NextRequest) {
  try {
    const dashboardId = req.nextUrl.searchParams.get('dashboardId') || ''
    await initDb()
    const r = await db.execute({
      sql: `SELECT id, name, platform, token, enabled, last_used_at, created_at
            FROM api_tokens WHERE dashboard_id = ? ORDER BY created_at DESC`,
      args: [dashboardId],
    })
    return NextResponse.json({
      tokens: (r.rows as any[]).map((t) => ({ ...t, token: maskToken(String(t.token || '')) })),
    })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { dashboardId, name, platform } = await req.json()
    await initDb()
    const count = await db.execute({ sql: `SELECT COUNT(*) AS total FROM api_tokens WHERE dashboard_id = ?`, args: [dashboardId] })
    if (Number((count.rows[0] as any)?.total || 0) >= 5) {
      return NextResponse.json({ error: 'limite de 5 tokens atingido' }, { status: 400 })
    }
    const token = `lt_${newId()}${newId()}`
    const id = newId()
    await db.execute({
      sql: `INSERT INTO api_tokens (id, dashboard_id, name, platform, token) VALUES (?,?,?,?,?)`,
      args: [id, dashboardId, name || 'Token API', platform || 'API', token],
    })
    return NextResponse.json({ id, token })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id') || ''
    await initDb()
    await db.execute({ sql: `DELETE FROM api_tokens WHERE id = ?`, args: [id] })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
