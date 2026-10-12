import { db, initDb } from './db'

const VERSION = process.env.META_API_VERSION || 'v21.0'
const GRAPH = `https://graph.facebook.com/${VERSION}`

function centsFromMetaBudget(value: unknown) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : null
}

type InsightRow = {
  date_start: string
  spend?: string
  impressions?: string
  clicks?: string
  inline_link_clicks?: string
  reach?: string
  account_id?: string
  campaign_id?: string
  campaign_name?: string
  adset_id?: string
  adset_name?: string
  ad_id?: string
  ad_name?: string
}

async function graph<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok || json.error) {
    throw new Error(`Meta API: ${json?.error?.message || res.status}`)
  }
  return json as T
}

async function graphAll<T>(url: string): Promise<T[]> {
  const out: T[] = []
  while (url) {
    const page = await graph<{ data: T[]; paging?: { next?: string } }>(url)
    out.push(...(page.data || []))
    url = page.paging?.next || ''
  }
  return out
}

type Stmt = { sql: string; args: any[] }

/**
 * Grava em lotes. Com Turso remoto cada db.execute e um round-trip de rede;
 * centenas de INSERTs um a um podem estourar o tempo do cron na Vercel.
 */
async function writeBatch(stmts: Stmt[], size = 200) {
  for (let i = 0; i < stmts.length; i += size) {
    await db.batch(stmts.slice(i, i + size), 'write')
  }
  stmts.length = 0
}

/**
 * Puxa gasto por anuncio e por dia. time_increment=1 e o que permite recortar
 * qualquer periodo depois sem pedir de novo pra API.
 */
export async function syncMetaInsights(opts: {
  dashboardId: string
  accountId: string
  accessToken: string
  since: string // YYYY-MM-DD
  until: string
}) {
  await initDb()
  const { dashboardId, accountId, accessToken, since, until } = opts

  const fields = [
    'spend', 'impressions', 'clicks', 'inline_link_clicks', 'reach',
    'account_id', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
  ].join(',')

  let url =
    `${GRAPH}/act_${accountId}/insights?level=ad&fields=${fields}` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
    `&time_increment=1&limit=500&access_token=${encodeURIComponent(accessToken)}`

  let rows = 0
  const stmts: Stmt[] = []
  const seenObjects = new Map<string, { level: string; id: string; name: string; campaignId?: string; adsetId?: string }>()

  while (url) {
    const page = await graph<{ data: InsightRow[]; paging?: { next?: string } }>(url)

    for (const r of page.data || []) {
      if (!r.ad_id) continue
      const cents = Math.round(parseFloat(r.spend || '0') * 100)

      stmts.push({
        sql: `INSERT INTO ad_insights (dashboard_id, platform, date, account_id, campaign_id, adset_id, ad_id,
                                       spend_cents, impressions, clicks, link_clicks, reach, updated_at)
              VALUES (?, 'meta', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT (dashboard_id, platform, ad_id, date) DO UPDATE SET
                spend_cents = excluded.spend_cents,
                impressions = excluded.impressions,
                clicks      = excluded.clicks,
                link_clicks = excluded.link_clicks,
                reach       = excluded.reach,
                updated_at  = datetime('now')`,
        args: [
          dashboardId, r.date_start, accountId, r.campaign_id ?? null, r.adset_id ?? null, r.ad_id,
          cents, Number(r.impressions || 0), Number(r.clicks || 0), Number(r.inline_link_clicks || 0), Number(r.reach || 0),
        ],
      })
      rows++

      if (r.campaign_id) seenObjects.set(`campaign:${r.campaign_id}`, { level: 'campaign', id: r.campaign_id, name: r.campaign_name || r.campaign_id })
      if (r.adset_id) seenObjects.set(`adset:${r.adset_id}`, { level: 'adset', id: r.adset_id, name: r.adset_name || r.adset_id, campaignId: r.campaign_id })
      seenObjects.set(`ad:${r.ad_id}`, { level: 'ad', id: r.ad_id, name: r.ad_name || r.ad_id, campaignId: r.campaign_id, adsetId: r.adset_id })
    }

    await writeBatch(stmts)
    url = page.paging?.next || ''
  }

  for (const o of seenObjects.values()) {
    stmts.push({
      sql: `INSERT INTO ad_objects (dashboard_id, platform, level, object_id, account_id, campaign_id, adset_id, ad_id, name, updated_at)
            VALUES (?, 'meta', ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT (dashboard_id, platform, level, object_id) DO UPDATE SET
              name = excluded.name, campaign_id = excluded.campaign_id, adset_id = excluded.adset_id,
              updated_at = datetime('now')`,
      args: [
        dashboardId, o.level, o.id, accountId, o.campaignId ?? null, o.adsetId ?? null,
        o.level === 'ad' ? o.id : null, o.name,
      ],
    })
  }

  await writeBatch(stmts)
  return { insightRows: rows, objects: seenObjects.size }
}

/** Status, hierarquia e orcamento atuais - a API de insights nao devolve isso. */
export async function syncMetaStatuses(opts: { dashboardId: string; accountId: string; accessToken: string }) {
  const { dashboardId, accountId, accessToken } = opts
  let campaignsUrl = `${GRAPH}/act_${accountId}/campaigns?fields=id,name,status,effective_status,daily_budget,lifetime_budget,budget_remaining&limit=500&access_token=${encodeURIComponent(accessToken)}`
  let url = `${GRAPH}/act_${accountId}/ads?fields=id,name,status,effective_status,adset_id,campaign_id&limit=500&access_token=${encodeURIComponent(accessToken)}`
  let count = 0
  const stmts: Stmt[] = []

  while (campaignsUrl) {
    const page = await graph<{ data: any[]; paging?: { next?: string } }>(campaignsUrl)
    for (const campaign of page.data || []) {
      const daily = centsFromMetaBudget(campaign.daily_budget)
      const lifetime = centsFromMetaBudget(campaign.lifetime_budget)
      stmts.push({
        sql: `INSERT INTO ad_objects (
                dashboard_id, platform, level, object_id, account_id, name, status, effective_status,
                budget_cents, daily_budget_cents, lifetime_budget_cents, budget_remaining_cents, updated_at
              )
              VALUES (?, 'meta', 'campaign', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT (dashboard_id, platform, level, object_id) DO UPDATE SET
                name = excluded.name, status = excluded.status, effective_status = excluded.effective_status,
                budget_cents = excluded.budget_cents, daily_budget_cents = excluded.daily_budget_cents,
                lifetime_budget_cents = excluded.lifetime_budget_cents, budget_remaining_cents = excluded.budget_remaining_cents,
                updated_at = datetime('now')`,
        args: [
          dashboardId, campaign.id, accountId, campaign.name, campaign.status, campaign.effective_status,
          daily ?? lifetime, daily, lifetime, centsFromMetaBudget(campaign.budget_remaining),
        ],
      })
      count++
    }
    await writeBatch(stmts)
    campaignsUrl = page.paging?.next || ''
  }

  let adsetsUrl = `${GRAPH}/act_${accountId}/adsets?fields=id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,budget_remaining&limit=500&access_token=${encodeURIComponent(accessToken)}`
  while (adsetsUrl) {
    const page = await graph<{ data: any[]; paging?: { next?: string } }>(adsetsUrl)
    for (const adset of page.data || []) {
      const daily = centsFromMetaBudget(adset.daily_budget)
      const lifetime = centsFromMetaBudget(adset.lifetime_budget)
      stmts.push({
        sql: `INSERT INTO ad_objects (
                dashboard_id, platform, level, object_id, account_id, campaign_id, name, status, effective_status,
                budget_cents, daily_budget_cents, lifetime_budget_cents, budget_remaining_cents, updated_at
              )
              VALUES (?, 'meta', 'adset', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT (dashboard_id, platform, level, object_id) DO UPDATE SET
                name = excluded.name, campaign_id = excluded.campaign_id, status = excluded.status,
                effective_status = excluded.effective_status, budget_cents = excluded.budget_cents,
                daily_budget_cents = excluded.daily_budget_cents, lifetime_budget_cents = excluded.lifetime_budget_cents,
                budget_remaining_cents = excluded.budget_remaining_cents, updated_at = datetime('now')`,
        args: [
          dashboardId, adset.id, accountId, adset.campaign_id ?? null, adset.name, adset.status, adset.effective_status,
          daily ?? lifetime, daily, lifetime, centsFromMetaBudget(adset.budget_remaining),
        ],
      })
      count++
    }
    await writeBatch(stmts)
    adsetsUrl = page.paging?.next || ''
  }

  while (url) {
    const page = await graph<{ data: any[]; paging?: { next?: string } }>(url)
    for (const ad of page.data || []) {
      stmts.push({
        sql: `INSERT INTO ad_objects (dashboard_id, platform, level, object_id, account_id, campaign_id, adset_id, ad_id, name, status, effective_status, updated_at)
              VALUES (?, 'meta', 'ad', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT (dashboard_id, platform, level, object_id) DO UPDATE SET
                name = excluded.name, status = excluded.status, effective_status = excluded.effective_status,
                updated_at = datetime('now')`,
        args: [dashboardId, ad.id, accountId, ad.campaign_id ?? null, ad.adset_id ?? null, ad.id, ad.name, ad.status, ad.effective_status],
      })
      count++
    }
    await writeBatch(stmts)
    url = page.paging?.next || ''
  }
  await writeBatch(stmts)
  return count
}

type MetaAccountSource = 'direct' | 'owned' | 'client'

type MetaAdAccount = {
  accountId: string
  name: string
  currency: string
  accountStatus: number | null
  businessId: string | null
  businessName: string | null
  source: MetaAccountSource
}

type MetaAdAccountImportDiagnostics = {
  businesses: Array<{ id: string; name: string; ownedCount: number; clientCount: number }>
  directCount: number
  ownedCount: number
  clientCount: number
  /** Erros/limitacoes da Meta que antes eram engolidos silenciosamente. */
  warnings: string[]
}

/** Lista as contas de anuncio do token, pra tela de integracao. */
export async function listMetaAdAccounts(accessToken: string) {
  const result = await listMetaAdAccountsWithDiagnostics(accessToken)
  return result.accounts
}

/** Lista contas e devolve um diagnostico do que a Meta liberou para este token. */
export async function listMetaAdAccountsWithDiagnostics(accessToken: string): Promise<{
  accounts: MetaAdAccount[]
  diagnostics: MetaAdAccountImportDiagnostics
}> {
  const token = encodeURIComponent(accessToken)
  const byAccount = new Map<string, MetaAdAccount>()
  const diagnostics: MetaAdAccountImportDiagnostics = {
    businesses: [],
    directCount: 0,
    ownedCount: 0,
    clientCount: 0,
    warnings: [],
  }

  function addAccount(a: any, business: any | null, source: MetaAccountSource) {
    const rawId = String(a.account_id || a.id || '').replace(/^act_/, '')
    if (!rawId) return
    const prev = byAccount.get(rawId)
    const next = {
      accountId: rawId,
      name: String(a.name || prev?.name || rawId),
      currency: String(a.currency || prev?.currency || 'BRL'),
      accountStatus: a.account_status == null ? prev?.accountStatus ?? null : Number(a.account_status),
      businessId: business?.id ? String(business.id) : prev?.businessId ?? null,
      businessName: business?.name ? String(business.name) : prev?.businessName ?? null,
      source: source === 'direct' && prev ? prev.source : source,
    }
    byAccount.set(rawId, next)
  }

  const fields = 'account_id,name,currency,account_status'
  const direct = await graphAll<any>(`${GRAPH}/me/adaccounts?fields=${fields}&limit=500&access_token=${token}`)
  diagnostics.directCount = direct.length
  direct.forEach((a) => addAccount(a, null, 'direct'))

  // Sem business_management a Meta bloqueia /me/businesses -> nenhuma BM aparece.
  const perms = await graph<{ data: Array<{ permission: string; status: string }> }>(
    `${GRAPH}/me/permissions?access_token=${token}`,
  ).catch(() => ({ data: [] }))
  const granted = new Set(perms.data.filter((p) => p.status === 'granted').map((p) => p.permission))
  if (!granted.has('business_management')) {
    diagnostics.warnings.push(
      'Token sem a permissao business_management: a Meta nao libera a lista de BMs. ' +
        'Gere um novo token marcando business_management (alem de ads_read/ads_management).',
    )
  }

  // Guarda o motivo da falha em vez de devolver [] calado.
  const safe = (label: string, url: string) =>
    graphAll<any>(url).catch((e: Error) => {
      diagnostics.warnings.push(`${label}: ${e.message}`)
      return [] as any[]
    })

  const businesses = await safe('Listar BMs', `${GRAPH}/me/businesses?fields=id,name&limit=200&access_token=${token}`)
  for (const business of businesses) {
    const encodedFields = encodeURIComponent(fields)
    const base = `${GRAPH}/${business.id}`
    const label = `BM ${business.name || business.id}`
    const owned = await safe(`${label} (owned)`, `${base}/owned_ad_accounts?fields=${encodedFields}&limit=500&access_token=${token}`)
    const client = await safe(`${label} (client)`, `${base}/client_ad_accounts?fields=${encodedFields}&limit=500&access_token=${token}`)
    diagnostics.ownedCount += owned.length
    diagnostics.clientCount += client.length
    diagnostics.businesses.push({
      id: String(business.id),
      name: String(business.name || business.id),
      ownedCount: owned.length,
      clientCount: client.length,
    })
    owned.forEach((a) => addAccount(a, business, 'owned'))
    client.forEach((a) => addAccount(a, business, 'client'))
  }

  return {
    accounts: Array.from(byAccount.values()).sort((a, b) => a.name.localeCompare(b.name)),
    diagnostics,
  }
}
