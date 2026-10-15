const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  module._compile(outputText, filename)
}

const { normalize } = require('../lib/adapters/index.ts')
const hotmart = (status, event, eventId = 'event-1') => ({
  id: eventId, event, creation_date: 1792080000000,
  data: {
    product: { id: 123, name: 'Test product' },
    buyer: { name: 'Test', email: 'test@example.com' },
    purchase: {
      transaction: 'HP-TEST-123', status, order_date: 1792080000000,
      price: { value: 17.7, currency_value: 'BRL' },
      payment: { type: 'PIX' },
    },
    commissions: [{ source: 'PRODUCER', value: 15.8 }],
  },
})

test('Hotmart pending, paid, refund and chargeback retain one transaction ID', () => {
  for (const [event, status, expected] of [
    ['PURCHASE_BILLET_PRINTED', 'PRINTED_BILLET', 'waiting_payment'],
    ['PURCHASE_APPROVED', 'APPROVED', 'paid'],
    ['PURCHASE_COMPLETE', 'COMPLETE', 'paid'],
    ['PURCHASE_REFUNDED', 'REFUNDED', 'refunded'],
    ['PURCHASE_CHARGEBACK', 'CHARGEBACK', 'chargedback'],
    ['PURCHASE_EXPIRED', 'EXPIRED', 'refused'],
  ]) {
    const order = normalize('hotmart', hotmart(status, event, event))
    assert.equal(order.externalId, 'HP-TEST-123')
    assert.equal(order.status, expected)
    assert.equal(order.grossCents, 1770)
    assert.equal(order.netCents, 1580)
    assert.equal(order.paymentMethod, 'pix')
    assert.equal(order.saleType, 'producer')
  }
})

test('Hotmart status-only pending and standard token URLs', () => {
  for (const status of ['WAITING_PAYMENT', 'PRINTED_BILLET', 'PROCESSING_TRANSACTION', 'STARTED']) {
    const payload = hotmart(status)
    assert.equal(normalize('hotmart', payload).status, 'waiting_payment')
    assert.deepEqual(normalize('generic', payload), normalize('hotmart', payload))
  }
})

test('Hotmart does not turn abandoned carts or event IDs into orders', () => {
  assert.equal(normalize('hotmart', hotmart('STARTED', 'PURCHASE_OUT_OF_SHOPPING_CART')), null)
  const payload = hotmart('APPROVED', 'PURCHASE_APPROVED')
  delete payload.data.purchase.transaction
  assert.equal(normalize('hotmart', payload), null)
})

test('Wiapy amounts stay in cents and unpaid PIX becomes pending', () => {
  const payload = {
    payment: { id: 'wiapy-123', status: 'unpaid', amount: 1770, fee: 190, payment_method: 'pix', dt_create: '2026-10-15T12:00:00Z' },
    checkout: { id: 'checkout', title: 'Product', amount: 990, orderbump: [{ id: 'bump', title: 'Bump', amount: 780 }] },
    tracking: { utm_source: 'facebook' },
  }
  const order = normalize('generic', payload)
  assert.equal(order.status, 'waiting_payment')
  assert.equal(order.grossCents, 1770)
  assert.equal(order.netCents, 1580)
  assert.equal(order.gatewayFeeCents, 190)
  assert.equal(order.items.length, 2)
  assert.equal(order.items[1].isBump, true)
  assert.equal(order.utms.utm_source, 'facebook')
  assert.equal(normalize('generic', { payment: null }), null)
})

test('Existing generic webhook format remains compatible', () => {
  const order = normalize('generic', { order_id: 'generic-1', status: 'pending', amount: 17.7 })
  assert.equal(order.status, 'waiting_payment')
  assert.equal(order.grossCents, 1770)
})

test('Lowify lifecycle uses sale_amount in reais, stable order ID and tracking', () => {
  for (const [event, expected] of [['sale.pending', 'waiting_payment'], ['sale.paid', 'paid'], ['sale.refunded', 'refunded']]) {
    const payload = {
      event, order_id: 'ord_abc123', sale_amount: 97, timestamp: '2026-10-15 14:29:37',
      product: { id: 42, name: 'Meu Produto Digital', price: 97 },
      customer: { name: 'Test', email: 'test@example.com', phone: '11999999999' },
      affiliate: { id: 'affiliate', commission_amount: 19.4 },
      tracking: { utm_source: 'google', utm_campaign: 'lancamento' },
    }
    const order = normalize('generic', payload)
    assert.equal(order.externalId, 'ord_abc123')
    assert.equal(order.status, expected)
    assert.equal(order.grossCents, 9700)
    assert.equal(order.netCents, 9700) // Fees/net revenue are absent in this format.
    assert.equal(order.paymentMethod, null) // A pending sale is not necessarily PIX.
    assert.equal(order.saleType, 'producer') // An affiliate object does not identify the receiver's role.
    assert.equal(order.items[0].productName, 'Meu Produto Digital')
    assert.equal(order.items[0].priceCents, 9700)
    assert.equal(order.utms.utm_source, 'google')
    assert.equal(order.utms.utm_campaign, 'lancamento')
    if (expected === 'paid') assert.ok(order.approvedAt)
    if (expected === 'refunded') assert.ok(order.refundedAt)
    delete payload.affiliate
    assert.equal(normalize('generic', payload).grossCents, 9700)
  }
})
