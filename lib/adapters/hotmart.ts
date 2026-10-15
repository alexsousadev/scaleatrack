import { NormalizedOrder, OrderStatus, extractUtms, mapStatus, pick, toCents, toIso } from './base'

const STATUS: Record<string, OrderStatus> = {
  PURCHASE_APPROVED: 'paid',
  PURCHASE_COMPLETE: 'paid',
  APPROVED: 'paid',
  COMPLETE: 'paid',
  PURCHASE_CANCELED: 'refused',
  CANCELED: 'refused',
  CANCELLED: 'refused',
  PURCHASE_EXPIRED: 'refused',
  EXPIRED: 'refused',
  NO_FUNDS: 'refused',
  PURCHASE_REFUNDED: 'refunded',
  REFUNDED: 'refunded',
  PURCHASE_CHARGEBACK: 'chargedback',
  CHARGEBACK: 'chargedback',
  PURCHASE_BILLET_PRINTED: 'waiting_payment',
  PRINTED_BILLET: 'waiting_payment',
  PURCHASE_DELAYED: 'waiting_payment',
  OVERDUE: 'waiting_payment',
  PRE_ORDER: 'waiting_payment',
  PROCESSING_TRANSACTION: 'waiting_payment',
  UNDER_ANALISYS: 'waiting_payment',
  WAITING_PAYMENT: 'waiting_payment',
  STARTED: 'waiting_payment',
}

export function normalizeHotmart(payload: any): NormalizedOrder | null {
  if (payload?.event === 'PURCHASE_OUT_OF_SHOPPING_CART') return null
  const data = payload?.data ?? payload
  const purchase = data?.purchase ?? {}
  const externalId = pick(purchase, ['transaction'])
  if (!externalId) return null

  const status = mapStatus(pick(payload, ['event']), STATUS) ?? mapStatus(pick(purchase, ['status']), STATUS)
  if (!status) return null

  // A Hotmart entrega as UTMs dentro de tracking.source / tracking.source_sck.
  const { utms, clickIds, visitorId } = extractUtms(payload, ['data.purchase.tracking', 'data.tracking'])

  const gross = toCents(pick(purchase, ['price.value', 'full_price.value', 'original_offer_price.value']))

  // A comissao do produtor vem na lista de commissions com source PRODUCER.
  const commissions: any[] = Array.isArray(data?.commissions) ? data.commissions : []
  const producer = commissions.find((c) => String(c?.source || '').toUpperCase() === 'PRODUCER')
  const affiliate = commissions.find((c) => String(c?.source || '').toUpperCase() === 'AFFILIATE')
  const net = producer ? toCents(producer.value) : affiliate ? toCents(affiliate.value) : gross

  const product = data?.product ?? {}
  const buyer = data?.buyer ?? {}

  return {
    externalId: String(externalId),
    status,
    paymentMethod: normalizeMethod(pick(purchase, ['payment.type'])),
    installments: Number(pick(purchase, ['payment.installments_number'])) || null,
    isRecurring: !!pick(data, ['subscription']),
    saleType: !producer && affiliate ? 'affiliate' : 'producer',

    customerName: buyer.name ?? null,
    customerEmail: buyer.email ?? null,
    customerPhone: pick(buyer, ['checkout_phone', 'phone']) ?? null,
    customerDoc: pick(buyer, ['document']) ?? null,
    customerCountry: pick(buyer, ['address.country_iso', 'address.country']) ?? null,
    customerIp: pick(buyer, ['ip']) ?? null,

    currency: pick(purchase, ['price.currency_value', 'price.currency_code']) ?? 'BRL',
    grossCents: gross,
    netCents: net,

    createdAt: toIso(pick(purchase, ['order_date']) ?? pick(payload, ['creation_date'])),
    approvedAt: status === 'paid' ? toIso(pick(purchase, ['approved_date', 'order_date'])) : null,
    refundedAt: status === 'refunded' || status === 'chargedback' ? toIso(pick(payload, ['creation_date'])) : null,

    utms,
    clickIds,
    visitorId,

    items: [
      {
        productId: product.id != null ? String(product.id) : null,
        productName: product.name ?? 'Sem nome',
        planName: pick(purchase, ['offer.code']) ?? null,
        quantity: 1,
        priceCents: gross,
        isBump: purchase.order_bump?.is_order_bump === true,
      },
    ],
  }
}

function normalizeMethod(m: unknown): string | null {
  if (!m) return null
  const s = String(m).toUpperCase()
  if (s.includes('PIX')) return 'pix'
  if (s.includes('CREDIT') || s.includes('CARD')) return 'credit_card'
  if (s.includes('BILLET') || s.includes('BOLETO')) return 'boleto'
  if (s.includes('PAYPAL')) return 'paypal'
  return s.toLowerCase()
}
