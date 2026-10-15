import { extractUtms, mapStatus, toCents, toIso, type NormalizedOrder, type OrderStatus } from './base'

// Formato dos exemplos de webhook fornecidos pela Lowify no painel.
const STATUS: Record<string, OrderStatus> = {
  'SALE.PENDING': 'waiting_payment', PENDING: 'waiting_payment',
  'SALE.PAID': 'paid', PAID: 'paid',
  'SALE.REFUNDED': 'refunded', REFUNDED: 'refunded',
}

export function normalizeLowify(payload: any): NormalizedOrder | null {
  if (!payload?.order_id) return null
  const status = mapStatus(payload.event, STATUS) ?? mapStatus(payload.status, STATUS)
  if (!status) return null
  const gross = toCents(payload.sale_amount)
  const { utms, clickIds, visitorId } = extractUtms(payload)
  const date = toIso(payload.timestamp)
  return {
    externalId: String(payload.order_id), status,
    // O payload não informa método de pagamento nem taxas da plataforma.
    paymentMethod: payload.payment_method ?? null,
    grossCents: gross, netCents: gross, currency: 'BRL', saleType: 'producer',
    customerName: payload.customer?.name ?? null,
    customerEmail: payload.customer?.email ?? null,
    customerPhone: payload.customer?.phone ?? null,
    utms, clickIds, visitorId,
    createdAt: date,
    approvedAt: status === 'paid' ? date : null,
    refundedAt: status === 'refunded' ? date : null,
    items: [{
      productId: payload.product?.id != null ? String(payload.product.id) : null,
      productName: payload.product?.name || 'Sem nome',
      quantity: 1,
      priceCents: payload.product?.price != null ? toCents(payload.product.price) : gross,
    }],
  }
}
