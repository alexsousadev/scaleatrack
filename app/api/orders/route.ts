import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { errorResponse, readContext } from '@/lib/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { dashboardId, range, currency } = await readContext(req)
    await initDb()
    const status = req.nextUrl.searchParams.get('status')
    const origin = req.nextUrl.searchParams.get('origin')
    const product = req.nextUrl.searchParams.get('product')
    const platform = req.nextUrl.searchParams.get('platform')
    const campaign = req.nextUrl.searchParams.get('campaign')
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || 100), 500)

    const args: any[] = [dashboardId, range.fromUtc, range.toUtc]
    let sql = `SELECT o.id, o.platform, o.external_id, o.status, o.payment_method,
                      o.customer_name, o.customer_email, o.customer_phone, o.customer_country, o.customer_ip,
                      o.gross_cents, o.net_cents, o.gateway_fee_cents, o.tax_cents, o.cost_cents,
                      o.src, o.sck, o.utm_source, o.utm_medium, o.utm_campaign, o.utm_content, o.utm_term,
                      o.traffic_source, o.account_id, o.campaign_id, o.adset_id, o.ad_id,
                      o.visitor_id, o.fbp, o.fbc, o.created_at, o.approved_at, o.refunded_at,
                      (SELECT group_concat(product_name, ' + ') FROM order_items i WHERE i.order_id = o.id) AS products,
                      (SELECT SUM(CASE WHEN is_bump = 1 THEN 1 ELSE 0 END) FROM order_items i WHERE i.order_id = o.id) AS bumps,
                      (SELECT status FROM capi_queue q
                        WHERE q.dashboard_id = o.dashboard_id
                          AND q.event_name = 'Purchase'
                          AND json_extract(q.payload, '$.eventId') = o.platform || '-' || o.external_id
                        ORDER BY q.created_at DESC LIMIT 1) AS capi_status
               FROM orders o
               WHERE o.dashboard_id = ? AND o.created_at BETWEEN ? AND ?`
    if (status) {
      sql += ` AND o.status = ?`
      args.push(status)
    }
    if (origin) {
      sql += ` AND COALESCE(o.traffic_source, o.utm_source, 'organic') = ?`
      args.push(origin)
    }
    if (platform) {
      sql += ` AND o.platform = ?`
      args.push(platform)
    }
    if (campaign) {
      sql += ` AND o.utm_campaign = ?`
      args.push(campaign)
    }
    if (product) {
      sql += ` AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.product_name = ?)`
      args.push(product)
    }
    sql += ` ORDER BY o.created_at DESC LIMIT ?`
    args.push(limit)

    const r = await db.execute({ sql, args })

    const facets = await db.execute({
      sql: `SELECT 'product' AS kind, i.product_name AS value
              FROM orders o JOIN order_items i ON i.order_id = o.id
             WHERE o.dashboard_id = ? AND o.created_at BETWEEN ? AND ?
             GROUP BY i.product_name
            UNION ALL
            SELECT 'platform' AS kind, o.platform AS value
              FROM orders o
             WHERE o.dashboard_id = ? AND o.created_at BETWEEN ? AND ?
             GROUP BY o.platform
            UNION ALL
            SELECT 'campaign' AS kind, o.utm_campaign AS value
              FROM orders o
             WHERE o.dashboard_id = ? AND o.created_at BETWEEN ? AND ? AND o.utm_campaign IS NOT NULL
             GROUP BY o.utm_campaign
            UNION ALL
            SELECT 'origin' AS kind, COALESCE(o.traffic_source, o.utm_source, 'organic') AS value
              FROM orders o
             WHERE o.dashboard_id = ? AND o.created_at BETWEEN ? AND ?
             GROUP BY COALESCE(o.traffic_source, o.utm_source, 'organic')`,
      args: [
        dashboardId, range.fromUtc, range.toUtc,
        dashboardId, range.fromUtc, range.toUtc,
        dashboardId, range.fromUtc, range.toUtc,
        dashboardId, range.fromUtc, range.toUtc,
      ],
    })
    const options = { products: [] as string[], platforms: [] as string[], campaigns: [] as string[], origins: [] as string[] }
    for (const f of facets.rows as any[]) {
      if (!f.value) continue
      if (f.kind === 'product') options.products.push(String(f.value))
      if (f.kind === 'platform') options.platforms.push(String(f.value))
      if (f.kind === 'campaign') options.campaigns.push(String(f.value))
      if (f.kind === 'origin') options.origins.push(String(f.value))
    }

    return NextResponse.json({ currency, orders: r.rows, options })
  } catch (e) {
    return errorResponse(e)
  }
}
