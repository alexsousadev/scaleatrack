import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { normalize } from '@/lib/adapters'
import { ingestOrder } from '@/lib/orders'
import { enqueueCapi } from '@/lib/capi'

type WebhookPayload = {
  payload: any
  validationOnly: boolean
  invalidJson: boolean
}

async function readWebhookPayload(req: NextRequest): Promise<WebhookPayload> {
  const raw = await req.text()
  if (!raw.trim()) return { payload: null, validationOnly: true, invalidJson: false }

  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return { payload: Object.fromEntries(new URLSearchParams(raw)), validationOnly: false, invalidJson: false }
  }

  try {
    return { payload: JSON.parse(raw), validationOnly: false, invalidJson: false }
  } catch {
    return { payload: null, validationOnly: false, invalidJson: true }
  }
}

async function findWebhook(platform: string, webhookId: string) {
  await initDb()
  if (platform === 'generic' && webhookId.startsWith('lt_')) {
    const result = await db.execute({
      sql: `SELECT id, dashboard_id, enabled FROM api_tokens WHERE token = ?`,
      args: [webhookId],
    })
    const token: any = result.rows[0]
    if (!token || !token.enabled) {
      return { response: NextResponse.json({ ok: false, error: 'URL invalida' }, { status: 404 }) }
    }
    return { hook: { ...token, platform: 'generic', secret: null, apiTokenId: token.id } }
  }
  const hook = await db.execute({ sql: `SELECT * FROM webhooks WHERE id = ?`, args: [webhookId] })
  const h: any = hook.rows[0]

  if (!h || !h.enabled) return { response: NextResponse.json({ ok: false, error: 'webhook invalido' }, { status: 404 }) }
  if (h.platform !== platform) return { response: NextResponse.json({ ok: false, error: 'plataforma divergente' }, { status: 400 }) }

  return { hook: h }
}

export async function validateWebhookEndpoint(platform: string, webhookId: string) {
  if (!webhookId) return NextResponse.json({ ok: false, error: 'id ausente' }, { status: 400 })

  const { response } = await findWebhook(platform, webhookId)
  if (response) return response

  return NextResponse.json({ ok: true, endpoint: 'webhook' })
}

export async function handleWebhookPost(req: NextRequest, platform: string, webhookId: string) {
  if (!webhookId) return NextResponse.json({ ok: false, error: 'id ausente' }, { status: 400 })

  const { hook: h, response } = await findWebhook(platform, webhookId)
  if (response) return response

  const { payload, validationOnly, invalidJson } = await readWebhookPayload(req)
  if (validationOnly) return NextResponse.json({ ok: true, endpoint: 'webhook' })
  if (invalidJson) return NextResponse.json({ ok: true, ignored: 'payload_nao_json' })

  if (h.secret) {
    const got = (platform === 'hotmart' ? req.headers.get('x-hotmart-hottok') : null) || req.headers.get('x-webhook-secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || payload?.secret
    if (got !== h.secret) return NextResponse.json({ ok: false, error: 'segredo invalido' }, { status: 401 })
  }

  if (h.apiTokenId) {
    await db.execute({ sql: `UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?`, args: [h.apiTokenId] })
  }

  const order = normalize(platform, payload)
  if (!order) return NextResponse.json({ ok: true, ignored: true })

  const saleType = req.nextUrl.searchParams.get('saleType')
  if (saleType === 'affiliate' || saleType === 'co-producer') order.saleType = saleType
  if (req.nextUrl.searchParams.get('ignoreRecurrence') === 'true' && order.isRecurring) {
    return NextResponse.json({ ok: true, ignored: 'recorrencia' })
  }

  const result = await ingestOrder(h.dashboard_id, platform, order, payload)

  const wantPending = order.status === 'waiting_payment'
  const pixels = await db.execute({
    sql: `SELECT * FROM pixels WHERE dashboard_id = ? AND enabled = 1`,
    args: [h.dashboard_id],
  })
  for (const p of pixels.rows as any[]) {
    const sendsPending = p.send_purchase_type === 'paid_and_pending_sales'
    if (order.status !== 'paid' && !(wantPending && sendsPending)) continue

    const valueCents =
      p.send_value_type === 'no_value' ? undefined : p.send_value_type === 'gross' ? order.grossCents : order.netCents

    await enqueueCapi(h.dashboard_id, String(p.id), {
      eventName: 'Purchase',
      eventId: `${platform}-${order.externalId}`,
      eventTime: Math.floor(new Date(order.approvedAt || order.createdAt).getTime() / 1000),
      valueCents,
      currency: order.currency || 'BRL',
      email: order.customerEmail,
      phone: order.customerPhone,
      firstName: order.customerName?.split(' ')[0] ?? null,
      country: order.customerCountry,
      ip: order.customerIp,
      externalId: order.customerEmail,
    })
  }

  return NextResponse.json({ ok: true, orderId: result.orderId, trafficSource: result.trafficSource })
}

export async function handleWebhookHead(platform: string, webhookId: string) {
  if (!webhookId) return new NextResponse(null, { status: 400 })

  const { response } = await findWebhook(platform, webhookId)
  if (response) return new NextResponse(null, { status: response.status })

  return new NextResponse(null, { status: 200 })
}
