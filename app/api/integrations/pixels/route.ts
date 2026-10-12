import { NextRequest, NextResponse } from 'next/server'
import { db, initDb, newId } from '@/lib/db'
import { errorResponse } from '@/lib/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const dashboardId = req.nextUrl.searchParams.get('dashboardId') || ''
    await initDb()
    const pixels = await db.execute({ sql: `SELECT * FROM pixels WHERE dashboard_id = ? ORDER BY created_at DESC`, args: [dashboardId] })
    const out = []
    for (const p of pixels.rows as any[]) {
      const t = await db.execute({
        sql: `SELECT id, platform_pixel_id, name, test_code,
                     CASE WHEN capi_token IS NOT NULL AND capi_token != '' THEN substr(capi_token, -6) ELSE NULL END AS capi_token_suffix
              FROM pixel_targets WHERE pixel_id = ?`,
        args: [p.id],
      })
      out.push({ ...p, targets: t.rows }) // capi_token nunca sai daqui
    }
    return NextResponse.json({ pixels: out })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    await initDb()
    const existing = await db.execute({ sql: `SELECT COUNT(*) AS total FROM pixels WHERE dashboard_id = ?`, args: [b.dashboardId] })
    if (Number((existing.rows[0] as any)?.total || 0) >= 5) {
      return NextResponse.json({ error: 'limite de 5 pixels atingido' }, { status: 400 })
    }
    const id = newId()
    await db.execute({
      sql: `INSERT INTO pixels (id, dashboard_id, name, type, send_purchase_type, send_value_type, send_ip_rule,
                                send_initiate_checkout, ic_detection_type, ic_detection_value,
                                send_lead, lead_detection_value, send_add_to_cart, atc_detection_type, atc_detection_value, allowed_domain)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        id, b.dashboardId, b.name || 'Pixel', b.type || 'Meta',
        b.sendPurchaseType || 'paid_sales_only', b.sendValueType || 'commission', b.sendIpRule || 'ipv6_fallback_ipv4',
        b.sendInitiateCheckout ? 1 : 0, b.icDetectionType ?? null, b.icDetectionValue ?? null,
        b.sendLead ? 1 : 0, b.leadDetectionValue ?? null,
        b.sendAddToCart ? 1 : 0, b.atcDetectionType ?? null, b.atcDetectionValue ?? null,
        b.allowedDomain ?? null,
      ],
    })
    for (const t of b.targets || []) {
      await db.execute({
        sql: `INSERT INTO pixel_targets (id, pixel_id, platform_pixel_id, name, capi_token, test_code) VALUES (?,?,?,?,?,?)`,
        args: [newId(), id, String(t.platformPixelId), t.name ?? null, t.capiToken ?? null, t.testCode ?? null],
      })
    }
    return NextResponse.json({ id })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const b = await req.json()
    await initDb()
    if (typeof b.enabled === 'boolean' && Object.keys(b).length <= 2) {
      await db.execute({
        sql: `UPDATE pixels SET enabled = ? WHERE id = ?`,
        args: [b.enabled ? 1 : 0, b.id],
      })
      return NextResponse.json({ ok: true })
    }

    await db.execute({
      sql: `UPDATE pixels
            SET name = ?, send_purchase_type = ?, send_value_type = ?, send_ip_rule = ?,
                send_initiate_checkout = ?, ic_detection_type = ?, ic_detection_value = ?,
                send_lead = ?, lead_detection_value = ?,
                send_add_to_cart = ?, atc_detection_type = ?, atc_detection_value = ?,
                allowed_domain = ?
            WHERE id = ?`,
      args: [
        b.name || 'Pixel',
        b.sendPurchaseType || 'paid_sales_only',
        b.sendValueType || 'commission',
        b.sendIpRule || 'ipv6_fallback_ipv4',
        b.sendInitiateCheckout ? 1 : 0, b.icDetectionType ?? null, b.icDetectionValue ?? null,
        b.sendLead ? 1 : 0, b.leadDetectionValue ?? null,
        b.sendAddToCart ? 1 : 0, b.atcDetectionType ?? null, b.atcDetectionValue ?? null,
        b.allowedDomain ?? null,
        b.id,
      ],
    })
    const target = (b.targets || [])[0]
    if (target?.id) {
      const hasToken = typeof target.capiToken === 'string' && target.capiToken.trim() !== ''
      await db.execute({
        sql: `UPDATE pixel_targets
              SET platform_pixel_id = ?, name = ?, test_code = ?${hasToken ? ', capi_token = ?' : ''}
              WHERE id = ?`,
        args: hasToken
          ? [String(target.platformPixelId), target.name ?? null, target.testCode ?? null, target.capiToken, target.id]
          : [String(target.platformPixelId), target.name ?? null, target.testCode ?? null, target.id],
      })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id') || ''
    await initDb()
    await db.execute({ sql: `DELETE FROM pixel_targets WHERE pixel_id = ?`, args: [id] })
    await db.execute({ sql: `DELETE FROM capi_queue WHERE pixel_id = ? AND status != 'sent'`, args: [id] })
    await db.execute({ sql: `DELETE FROM pixels WHERE id = ?`, args: [id] })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
