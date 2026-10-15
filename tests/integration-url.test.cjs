const assert = require('node:assert/strict')
const test = require('node:test')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(require('node:fs').readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
const { integrationUrl } = require('../lib/integration-url.ts')

test('Generated webhook URLs always include a valid protocol and colon', () => {
  const previous = process.env.APP_URL
  try {
    for (const value of ['https//app.scaletrack.net', 'https:/app.scaletrack.net', 'https://app.scaletrack.net/', 'app.scaletrack.net', ' https://app.scaletrack.net ']) {
      process.env.APP_URL = value
      const url = integrationUrl({ nextUrl: { origin: 'http://localhost:3210' } }, 'hotmart', 'abc123')
      assert.equal(url, 'https://app.scaletrack.net/api/webhooks/hotmart/abc123')
      assert.equal(new URL(url).protocol, 'https:')
      const variant = new URL(url)
      variant.searchParams.set('saleType', 'affiliate')
      assert.equal(variant.searchParams.get('saleType'), 'affiliate')
      assert.equal(variant.pathname, '/api/webhooks/hotmart/abc123')
    }
  } finally { previous === undefined ? delete process.env.APP_URL : process.env.APP_URL = previous }
})

test('Invalid configuration falls back to the request origin and local development remains usable', () => {
  const previous = process.env.APP_URL
  try {
    for (const value of ['javascript:alert(1)', 'https://', 'https://user:secret@example.com']) {
      process.env.APP_URL = value
      assert.equal(integrationUrl({ nextUrl: { origin: 'https://app.scaletrack.net' } }, 'generic', 'token'), 'https://app.scaletrack.net/api/webhooks/generic/token')
    }
    process.env.APP_URL = 'http://localhost:3210/'
    assert.equal(integrationUrl({ nextUrl: { origin: 'http://localhost:3210' } }, 'wiapy', 'token'), 'http://localhost:3210/api/webhooks/wiapy/token')
  } finally { previous === undefined ? delete process.env.APP_URL : process.env.APP_URL = previous }
})
