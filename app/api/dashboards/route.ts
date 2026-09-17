import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDefaultDashboard, initDb, newId } from '@/lib/db'
import { errorResponse } from '@/lib/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await ensureDefaultDashboard()
    const r = await db.execute(`SELECT * FROM dashboards ORDER BY created_at`)
    return NextResponse.json({ dashboards: r.rows })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, currency, tzOffset, viewType } = await req.json()
    await initDb()
    const id = newId()
    await db.execute({
      sql: `INSERT INTO dashboards (id, name, currency, tz_offset, view_type) VALUES (?,?,?,?,?)`,
      args: [id, name || 'Novo dashboard', currency || 'BRL', tzOffset ?? -3, viewType || 'Normal'],
    })
    return NextResponse.json({ id })
  } catch (e) {
    return errorResponse(e)
  }
}
