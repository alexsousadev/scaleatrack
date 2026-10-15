import { extractUtms, mapStatus, toIso, type NormalizedOrder, type OrderStatus } from './base'

const STATUS: Record<string, OrderStatus> = {
  UNPAID: 'waiting_payment',
  PAID: 'paid',
  CREDIT_CARD_DECLINED: 'refused',
  REFUNDED: 'refunded',
  CHARGEDBACK: 'chargedback',
}

// Wiapy: https://help.wiapy.com/pt-br/article/webhook-jtggmu/
// Todos os valores financeiros deste payload já estão em centavos.
export function normalizeWiapy(payload: any): NormalizedOrder | null {
  const payment = payload?.payment
  if (!payment || typeof payment.id !== 'string' || !payment.id) return null
  const status = mapStatus(payment.status, STATUS)
  if (!status) return null
  const cents = (value: unknown) => Math.round(Number(value) || 0)
  const gross = cents(payment.amount)
  const fee = cents(payment.fee)
  const bumps = Array.isArray(payload.checkout?.orderbump) ? payload.checkout.orderbump : []
  const createdAt = toIso(payment.dt_create)
  const { utms, clickIds, visitorId } = extractUtms(payload)

  return {
    externalId: payment.id,
    status,
    paymentMethod: payment.payment_method ?? null,
    installments: Number(payment.installments) || null,
    isRecurring: payment.type === 'subscription',
    saleType: 'producer',
    grossCents: gross,
    netCents: gross - fee,
    gatewayFeeCents: fee,
    currency: 'BRL',
    customerName: payload.customer?.name ?? null,
    customerEmail: payload.customer?.email ?? null,
    customerPhone: payload.customer?.mobile_phone ?? null,
    customerDoc: payload.customer?.document ?? null,
    customerIp: payload.tracking?.ip ?? null,
    utms, clickIds, visitorId,
    createdAt,
    approvedAt: status === 'paid' ? toIso(payment.dt_update || payment.dt_create) : null,
    refundedAt: status === 'refunded' || status === 'chargedback' ? toIso(payment.dt_update) : null,
    items: [
      {
        productId: payload.checkout?.id ?? null,
        productName: payload.checkout?.title || payload.products?.[0]?.title || 'Sem nome',
        quantity: 1,
        priceCents: payload.checkout?.amount != null ? cents(payload.checkout.amount) : gross - bumps.reduce((sum: number, b: any) => sum + cents(b.amount), 0),
      },
      ...bumps.map((b: any) => ({
        productId: b.id ?? null, productName: b.title || 'Orderbump', quantity: 1,
        priceCents: cents(b.amount), isBump: true,
      })),
    ],
  }
}
