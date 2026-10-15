const assert = require('node:assert/strict')
const test = require('node:test')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(require('node:fs').readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
const { metricBand, metricValue, matchesMetricFilter } = require('../lib/metric-thresholds.ts')

test('Every fixed threshold includes the correct boundary', () => {
  for (const [key, low, high] of [['ctr', .008, .015], ['connect', .7, .8], ['icRate', .1, .15], ['conversion', .2, .3], ['roas', 1, 1.5]]) {
    assert.equal(metricBand(key, low - .00001), 'bad')
    assert.equal(metricBand(key, low), 'attention')
    assert.equal(metricBand(key, high - .00001), 'attention')
    assert.equal(metricBand(key, high), 'ideal')
    assert.equal(metricBand(key, null), null)
    assert.equal(metricBand(key, NaN), null)
  }
  assert.equal(metricBand('cpc', 79), 'ideal')
  assert.equal(metricBand('cpc', 80), 'attention')
  assert.equal(metricBand('cpc', 150), 'attention')
  assert.equal(metricBand('cpc', 151), 'bad')
})

test('Funnel rates use the documented denominator and missing data stays neutral', () => {
  const row = { visits: 80, clicks: 100, ic: 12, approvedOrders: 4 }
  assert.equal(metricValue(row, 'connect'), .8)
  assert.equal(metricValue(row, 'icRate'), .15)
  assert.equal(metricValue(row, 'conversion'), 4 / 12)
  assert.equal(metricValue({ clicks: 100, visits: 0, ic: 0 }, 'icRate'), null)
  assert.equal(metricValue({ ic: 0, approvedOrders: 0 }, 'conversion'), null)
  assert.equal(metricBand('conversion', metricValue({ ic: 10, approvedOrders: 0 }, 'conversion')), 'bad')
})

test('Metric filters support individual metrics, any metric and reset', () => {
  const row = { roas: 1.2, ctr: .02, cpc: 160 }
  assert.equal(matchesMetricFilter(row, { metric: 'roas', band: 'attention' }), true)
  assert.equal(matchesMetricFilter(row, { metric: 'roas', band: 'ideal' }), false)
  assert.equal(matchesMetricFilter(row, { metric: '', band: 'ideal' }), true)
  assert.equal(matchesMetricFilter({}, { metric: '', band: 'bad' }), false)
  assert.equal(matchesMetricFilter({}, { metric: '', band: '' }), true)
})
