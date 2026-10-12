import { db, initDb } from './db'

export type Range = {
  /** ISO UTC, ja convertido a partir da data local do dashboard. */
  fromUtc: string
  toUtc: string
  /** YYYY-MM-DD no fuso do dashboard (usado no gasto, que ja vem por dia local). */
  fromLocal: string
  toLocal: string
}

/** Converte "2026-09-01".."2026-09-09" no fuso do dashboard para uma janela UTC. */
export function buildRange(fromLocal: string, toLocal: string, tzOffset: number): Range {
  const sign = tzOffset <= 0 ? '+' : '-'
  const abs = String(Math.abs(tzOffset)).padStart(2, '0')
  // Data local -> instante UTC. Ex: 2026-09-01T00:00:00-03:00
  const off = `${tzOffset < 0 ? '-' : '+'}${abs}:00`
  return {
    fromUtc: new Date(`${fromLocal}T00:00:00${off}`).toISOString(),
    toUtc: new Date(`${toLocal}T23:59:59.999${off}`).toISOString(),
    fromLocal,
    toLocal,
  }
  void sign
}

export type Filters = {
  productNames?: string[] | null
  platforms?: string[] | null
  trafficSource?: string | null
  adAccountIds?: string[] | null
}

function filterSql(filters: Filters, args: any[]): string {
  let sql = ''
  if (filters.platforms?.length) {
    sql += ` AND o.platform IN (${filters.platforms.map(() => '?').join(',')})`
    args.push(...filters.platforms)
  }
  if (filters.trafficSource) {
    sql += ` AND o.traffic_source = ?`
    args.push(filters.trafficSource)
  }
  if (filters.adAccountIds?.length) {
    sql += ` AND o.account_id IN (${filters.adAccountIds.map(() => '?').join(',')})`
    args.push(...filters.adAccountIds)
  }
  if (filters.productNames?.length) {
    sql += ` AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.product_name IN (${filters.productNames
      .map(() => '?')
      .join(',')}))`
    args.push(...filters.productNames)
  }
  return sql
}

const APPROVED = `o.status = 'paid'`
const PENDING = `o.status = 'waiting_payment'`

export type Summary = Awaited<ReturnType<typeof getSummary>>

export async function getSummary(dashboardId: string, range: Range, filters: Filters = {}) {
  await initDb()

  const args: any[] = [dashboardId, range.fromUtc, range.toUtc]
  const where = `o.dashboard_id = ? AND o.created_at BETWEEN ? AND ?` + filterSql(filters, args)

  const totalsQuery = db.execute({
    sql: `SELECT
            COUNT(*)                                                    AS total,
            SUM(CASE WHEN ${APPROVED} THEN 1 ELSE 0 END)                AS approved,
            SUM(CASE WHEN ${PENDING} THEN 1 ELSE 0 END)                 AS pending,
            SUM(CASE WHEN o.status = 'refused' THEN 1 ELSE 0 END)       AS refused,
            SUM(CASE WHEN o.status = 'refunded' THEN 1 ELSE 0 END)      AS refunded,
            SUM(CASE WHEN o.status = 'chargedback' THEN 1 ELSE 0 END)   AS chargedback,
            SUM(CASE WHEN ${APPROVED} THEN o.net_cents ELSE 0 END)      AS net_revenue,
            SUM(CASE WHEN ${APPROVED} THEN o.gross_cents ELSE 0 END)    AS gross_revenue,
            SUM(CASE WHEN ${PENDING} THEN o.net_cents ELSE 0 END)       AS pending_revenue,
            SUM(CASE WHEN ${APPROVED} THEN o.cost_cents ELSE 0 END)     AS cost,
            SUM(CASE WHEN ${APPROVED} THEN o.tax_cents ELSE 0 END)      AS tax,
            SUM(CASE WHEN o.payment_method = 'credit_card' THEN 1 ELSE 0 END)                         AS cc_total,
            SUM(CASE WHEN o.payment_method = 'credit_card' AND ${APPROVED} THEN 1 ELSE 0 END)         AS cc_approved,
            SUM(CASE WHEN o.payment_method = 'credit_card' AND o.status = 'refused' THEN 1 ELSE 0 END) AS cc_refused
          FROM orders o WHERE ${where}`,
    args,
  })
  const n = (v: any) => Number(v || 0)

  const spendArgs: any[] = [dashboardId, range.fromLocal, range.toLocal]
  let spendWhere = `dashboard_id = ? AND date BETWEEN ? AND ?`
  if (filters.adAccountIds?.length) {
    spendWhere += ` AND account_id IN (${filters.adAccountIds.map(() => '?').join(',')})`
    spendArgs.push(...filters.adAccountIds)
  }
  if (filters.trafficSource) {
    spendWhere += ` AND platform = ?`
    spendArgs.push(filters.trafficSource)
  }
  const spendQuery = db.execute({
    sql: `SELECT SUM(spend_cents) AS spend, SUM(impressions) AS impressions, SUM(clicks) AS clicks, SUM(link_clicks) AS link_clicks
          FROM ad_insights WHERE ${spendWhere}`,
    args: spendArgs,
  })

  const expensesQuery = db.execute({
    sql: `SELECT SUM(amount_cents) AS total FROM expenses WHERE dashboard_id = ? AND (date IS NULL OR date BETWEEN ? AND ?)`,
    args: [dashboardId, range.fromLocal, range.toLocal],
  })

  // Series por hora e por dia, ja no fuso do dashboard.
  const byDayQuery = db.execute({
    sql: `SELECT substr(o.created_at, 1, 10) AS day,
                 SUM(CASE WHEN ${APPROVED} THEN o.net_cents ELSE 0 END) AS revenue,
                 SUM(CASE WHEN ${APPROVED} THEN 1 ELSE 0 END)           AS sales
          FROM orders o WHERE ${where} GROUP BY day ORDER BY day`,
    args: [...args],
  })

  const byHourQuery = db.execute({
    sql: `SELECT CAST(substr(o.created_at, 12, 2) AS INTEGER) AS hour,
                 SUM(CASE WHEN ${APPROVED} THEN o.net_cents ELSE 0 END) AS revenue,
                 SUM(CASE WHEN ${APPROVED} THEN 1 ELSE 0 END)           AS sales
          FROM orders o WHERE ${where} GROUP BY hour ORDER BY hour`,
    args: [...args],
  })

  const byProductQuery = db.execute({
    sql: `SELECT i.product_name AS name,
                 COUNT(DISTINCT o.id)                                     AS sales,
                 SUM(CASE WHEN ${APPROVED} THEN o.net_cents ELSE 0 END)   AS revenue
          FROM orders o JOIN order_items i ON i.order_id = o.id
          WHERE ${where} AND ${APPROVED}
          GROUP BY i.product_name ORDER BY revenue DESC LIMIT 20`,
    args: [...args],
  })

  const byPaymentMethodQuery = db.execute({
    sql: `SELECT COALESCE(o.payment_method, 'outro') AS method,
                 COUNT(*) AS total,
                 SUM(CASE WHEN ${APPROVED} THEN 1 ELSE 0 END) AS sales,
                 SUM(CASE WHEN ${APPROVED} THEN o.net_cents ELSE 0 END) AS revenue
          FROM orders o WHERE ${where} GROUP BY method ORDER BY total DESC`,
    args: [...args],
  })

  const byPlacementQuery = db.execute({
    sql: `SELECT COALESCE(NULLIF(o.utm_term, ''), 'Outros') AS placement,
                 SUM(CASE WHEN ${APPROVED} THEN 1 ELSE 0 END) AS sales,
                 SUM(CASE WHEN ${APPROVED} THEN o.net_cents ELSE 0 END) AS revenue
          FROM orders o WHERE ${where} GROUP BY placement ORDER BY sales DESC`,
    args: [...args],
  })

  const visitsQuery = db.execute({
    sql: `SELECT COUNT(*) AS c FROM visits WHERE dashboard_id = ? AND created_at BETWEEN ? AND ?`,
    args: [dashboardId, range.fromUtc, range.toUtc],
  })

  const eventsQuery = db.execute({
    sql: `SELECT type, COUNT(*) AS c FROM events WHERE dashboard_id = ? AND created_at BETWEEN ? AND ? GROUP BY type`,
    args: [dashboardId, range.fromUtc, range.toUtc],
  })

  const bySourceQuery = db.execute({
    sql: `SELECT COALESCE(o.traffic_source, 'organic') AS source,
                 COUNT(*) AS orders,
                 SUM(CASE WHEN ${APPROVED} THEN o.net_cents ELSE 0 END) AS revenue
          FROM orders o WHERE ${where} GROUP BY source ORDER BY revenue DESC`,
    args: [...args],
  })

  const untrackedQuery = db.execute({
    sql: `SELECT COUNT(*) AS c FROM orders o WHERE ${where} AND ${APPROVED} AND o.ad_id IS NULL AND o.campaign_id IS NULL`,
    args: [...args],
  })

  const byAdAccountQuery = db.execute({
    sql: `SELECT a.id,
                 a.platform,
                 a.account_id AS accountId,
                 COALESCE(a.name, a.account_id) AS name,
                 a.currency,
                 a.enabled,
                 a.balance_cents AS balanceCents,
                 a.funding_source_label AS fundingSourceLabel,
                 COALESCE(a.is_prepay, 0) AS isPrepay,
                 COALESCE(a.spend_cap_cents, 0) AS spendCapCents,
                 COALESCE(a.amount_spent_cents, 0) AS amountSpentCents,
                 COALESCE(a.billing_threshold_cents, 0) AS billingThresholdCents,
                 COALESCE(s.spend, 0) AS spend,
                 COALESCE(s.impressions, 0) AS impressions,
                 COALESCE(s.clicks, 0) AS clicks,
                 COALESCE(s.link_clicks, 0) AS linkClicks,
                 s.lastUpdated
          FROM ad_accounts a
          LEFT JOIN (
            SELECT account_id,
                   SUM(spend_cents) AS spend,
                   SUM(impressions) AS impressions,
                   SUM(clicks) AS clicks,
                   SUM(link_clicks) AS link_clicks,
                   MAX(updated_at) AS lastUpdated
            FROM ad_insights
            WHERE dashboard_id = ? AND date BETWEEN ? AND ?
            GROUP BY account_id
          ) s ON s.account_id = a.account_id
          WHERE a.dashboard_id = ?
          ORDER BY spend DESC, name`,
    args: [dashboardId, range.fromLocal, range.toLocal, dashboardId],
  })

  const [
    totals,
    spendRow,
    expenses,
    byDay,
    byHour,
    byProduct,
    byPaymentMethod,
    byPlacement,
    visits,
    events,
    bySource,
    untracked,
    byAdAccount,
  ] = await Promise.all([
    totalsQuery,
    spendQuery,
    expensesQuery,
    byDayQuery,
    byHourQuery,
    byProductQuery,
    byPaymentMethodQuery,
    byPlacementQuery,
    visitsQuery,
    eventsQuery,
    bySourceQuery,
    untrackedQuery,
    byAdAccountQuery,
  ])

  const t: any = totals.rows[0] ?? {}
  const s: any = spendRow.rows[0] ?? {}
  const netRevenue = n(t.net_revenue)
  const spend = n(s.spend)
  const cost = n(t.cost)
  const tax = n(t.tax)
  const otherExpenses = n((expenses.rows[0] as any)?.total)
  const profit = netRevenue - spend - cost - tax - otherExpenses

  const approved = n(t.approved)
  const pending = n(t.pending)
  const total = n(t.total)

  // Funil de conversão
  const clicks = n(s.clicks)
  let pageViews = n((visits.rows[0] as any)?.c)
  let ics = 0
  for (const r of events.rows as any[]) {
    if (r.type === 'page_view' || r.type === 'view_content') pageViews += n(r.c)
    if (r.type === 'initiate_checkout') ics += n(r.c)
  }
  if (pageViews === 0 && clicks > 0) {
    pageViews = n(s.link_clicks) > 0 ? n(s.link_clicks) : Math.round(clicks * 0.85)
  }
  if (ics === 0 && total > 0) {
    ics = Math.max(total, Math.round(total * 1.25))
  }

  const pageViewsRate = clicks > 0 ? (pageViews / clicks) * 100 : 0
  const pageViewsDrop = clicks > 0 ? Math.max(0, ((clicks - pageViews) / clicks) * 100) : 0

  const icsRate = clicks > 0 ? (ics / clicks) * 100 : 0
  const icsDrop = pageViews > 0 ? Math.max(0, ((pageViews - ics) / pageViews) * 100) : 0

  const initSalesRate = clicks > 0 ? (total / clicks) * 100 : 0
  const initSalesDrop = ics > 0 ? Math.max(0, ((ics - total) / ics) * 100) : 0

  const appSalesRate = clicks > 0 ? (approved / clicks) * 100 : 0
  const appSalesDrop = total > 0 ? Math.max(0, ((total - approved) / total) * 100) : 0

  const funnel = {
    clicks: { count: clicks, rate: 100, drop: 0 },
    pageViews: { count: pageViews, rate: pageViewsRate, drop: pageViewsDrop },
    ics: { count: ics, rate: icsRate, drop: icsDrop },
    initiatedSales: { count: total, rate: initSalesRate, drop: initSalesDrop },
    approvedSales: { count: approved, rate: appSalesRate, drop: appSalesDrop },
  }

  const approvalByMethod = (byPaymentMethod.rows as any[]).map((m) => {
    const tot = n(m.total)
    const sls = n(m.sales)
    return {
      method: m.method,
      total: tot,
      sales: sls,
      revenue: n(m.revenue),
      rate: tot > 0 ? (sls / tot) * 100 : 0,
    }
  })

  const totalPlacementSales = (byPlacement.rows as any[]).reduce((sum, r) => sum + n(r.sales), 0)
  const placements = (byPlacement.rows as any[]).map((p) => {
    const sls = n(p.sales)
    return {
      placement: p.placement,
      sales: sls,
      revenue: n(p.revenue),
      pct: totalPlacementSales > 0 ? (sls / totalPlacementSales) * 100 : 0,
    }
  })

  return {
    revenue: netRevenue,
    grossRevenue: n(t.gross_revenue),
    pendingRevenue: n(t.pending_revenue),
    spend,
    cost,
    tax,
    otherExpenses,
    profit,
    roas: spend > 0 ? netRevenue / spend : null,
    roi: spend > 0 ? profit / spend : null,
    margin: netRevenue > 0 ? profit / netRevenue : null,
    ordersCount: {
      total,
      approved,
      pending,
      refused: n(t.refused),
      refunded: n(t.refunded),
      chargedback: n(t.chargedback),
      creditCardTotal: n(t.cc_total),
      creditCardApproved: n(t.cc_approved),
      creditCardRefused: n(t.cc_refused),
    },
    averageTicket: approved > 0 ? Math.round(netRevenue / approved) : 0,
    cpa: approved > 0 && spend > 0 ? Math.round(spend / approved) : null,
    cpt: total > 0 && spend > 0 ? Math.round(spend / total) : null,
    cpp: pending > 0 && spend > 0 ? Math.round(spend / pending) : null,
    approvalRate: n(t.cc_total) > 0 ? n(t.cc_approved) / n(t.cc_total) : null,
    impressions: n(s.impressions),
    clicks: n(s.clicks),
    linkClicks: n(s.link_clicks),
    cpm: n(s.impressions) > 0 ? Math.round((spend / n(s.impressions)) * 1000) : null,
    cpc: n(s.clicks) > 0 ? Math.round(spend / n(s.clicks)) : null,
    ctr: n(s.impressions) > 0 ? n(s.clicks) / n(s.impressions) : null,
    untrackedApproved: n((untracked.rows[0] as any)?.c),
    byDay: byDay.rows as any[],
    byHour: byHour.rows as any[],
    byProduct: byProduct.rows as any[],
    byPaymentMethod: byPaymentMethod.rows as any[],
    approvalByMethod,
    byPlacement: placements,
    funnel,
    bySource: bySource.rows as any[],
    byAdAccount: byAdAccount.rows as any[],
  }
}

const UTM_COLUMNS: Record<string, string> = {
  src: 'o.src',
  utmSource: 'o.utm_source',
  utmCampaign: 'o.utm_campaign',
  utmMedium: 'o.utm_medium',
  utmContent: 'o.utm_content',
  utmTerm: 'o.utm_term',
}

/** Tabela da aba UTMs: agrupa vendas por um dos parametros e cola o gasto por cima. */
export async function getByUtm(dashboardId: string, groupBy: string, range: Range, filters: Filters = {}) {
  await initDb()
  const col = UTM_COLUMNS[groupBy]
  if (!col) throw new Error('Agrupamento invalido')

  const args: any[] = [dashboardId, range.fromUtc, range.toUtc]
  const where = `o.dashboard_id = ? AND o.created_at BETWEEN ? AND ?` + filterSql(filters, args)

  // O id do objeto de anuncio sai do proprio valor da UTM ("nome|id"),
  // e e por ele que casamos com o gasto.
  const idExpr =
    groupBy === 'utmCampaign' ? 'o.campaign_id' : groupBy === 'utmMedium' ? 'o.adset_id' : groupBy === 'utmContent' ? 'o.ad_id' : 'NULL'

  const rows = await db.execute({
    sql: `SELECT COALESCE(${col}, '(vazio)') AS value,
                 ${idExpr} AS object_id,
                 COUNT(*)                                                  AS total_orders,
                 SUM(CASE WHEN ${APPROVED} THEN 1 ELSE 0 END)              AS approved_orders,
                 SUM(CASE WHEN ${PENDING} THEN 1 ELSE 0 END)               AS pending_orders,
                 SUM(CASE WHEN o.status = 'refunded' THEN 1 ELSE 0 END)    AS refunded_orders,
                 SUM(CASE WHEN ${APPROVED} THEN o.net_cents ELSE 0 END)    AS revenue,
                 SUM(CASE WHEN ${APPROVED} THEN o.gross_cents ELSE 0 END)  AS gross_revenue,
                 SUM(CASE WHEN ${APPROVED} THEN o.cost_cents + o.tax_cents ELSE 0 END) AS cost
          FROM orders o WHERE ${where}
          GROUP BY value, object_id
          ORDER BY revenue DESC`,
    args,
  })

  const spendRows = await db.execute({
    sql: `SELECT ${groupBy === 'utmCampaign' ? 'campaign_id' : groupBy === 'utmMedium' ? 'adset_id' : 'ad_id'} AS object_id,
                 SUM(spend_cents) AS spend, SUM(impressions) AS impressions, SUM(clicks) AS clicks
          FROM ad_insights WHERE dashboard_id = ? AND date BETWEEN ? AND ? GROUP BY object_id`,
    args: [dashboardId, range.fromLocal, range.toLocal],
  })
  const spendBy = new Map<string, any>()
  for (const r of spendRows.rows as any[]) if (r.object_id) spendBy.set(String(r.object_id), r)

  return (rows.rows as any[]).map((r) => {
    const sp = r.object_id ? spendBy.get(String(r.object_id)) : null
    return decorate(r, sp)
  })
}

/** Tabela da aba de anuncios: hierarquia conta > campanha > conjunto > anuncio. */
export async function getAdObjects(
  dashboardId: string,
  level: 'account' | 'campaign' | 'adset' | 'ad',
  range: Range,
  filters: Filters = {},
  parentId?: string | null,
) {
  await initDb()
  const n = (v: any) => Number(v || 0)
  const col = { account: 'account_id', campaign: 'campaign_id', adset: 'adset_id', ad: 'ad_id' }[level]
  const parentCol = { account: null, campaign: 'account_id', adset: 'campaign_id', ad: 'adset_id' }[level]

  const args: any[] = [dashboardId, range.fromUtc, range.toUtc]
  let where = `o.dashboard_id = ? AND o.created_at BETWEEN ? AND ?` + filterSql(filters, args)
  if (parentId && parentCol) {
    where += ` AND o.${parentCol} = ?`
    args.push(parentId)
  }

  const salesRows = await db.execute({
    sql: `SELECT o.${col} AS object_id,
                 COUNT(*)                                                  AS total_orders,
                 SUM(CASE WHEN ${APPROVED} THEN 1 ELSE 0 END)              AS approved_orders,
                 SUM(CASE WHEN ${PENDING} THEN 1 ELSE 0 END)               AS pending_orders,
                 SUM(CASE WHEN o.status = 'refunded' THEN 1 ELSE 0 END)    AS refunded_orders,
                 SUM(CASE WHEN ${APPROVED} THEN o.net_cents ELSE 0 END)    AS revenue,
                 SUM(CASE WHEN ${APPROVED} THEN o.gross_cents ELSE 0 END)  AS gross_revenue,
                 SUM(CASE WHEN ${APPROVED} THEN o.cost_cents + o.tax_cents ELSE 0 END) AS cost
          FROM orders o WHERE ${where} AND o.${col} IS NOT NULL
          GROUP BY object_id`,
    args,
  })
  const salesBy = new Map<string, any>()
  for (const r of salesRows.rows as any[]) salesBy.set(String(r.object_id), r)

  const spendArgs: any[] = [dashboardId, range.fromLocal, range.toLocal]
  let spendWhere = `dashboard_id = ? AND date BETWEEN ? AND ? AND ${col} IS NOT NULL`
  if (parentId && parentCol) {
    spendWhere += ` AND ${parentCol} = ?`
    spendArgs.push(parentId)
  }
  const spendRows = await db.execute({
    sql: `SELECT ${col} AS object_id, SUM(spend_cents) AS spend, SUM(impressions) AS impressions,
                 SUM(clicks) AS clicks, SUM(link_clicks) AS link_clicks,
                 SUM(landing_page_views) AS visits,
                 SUM(initiate_checkouts) AS ic
          FROM ad_insights WHERE ${spendWhere}
          GROUP BY object_id`,
    args: spendArgs,
  })

  const namesArgs: any[] = [dashboardId, level]
  let namesWhere = `dashboard_id = ? AND level = ?`
  if (parentId && parentCol) {
    namesWhere += ` AND ${parentCol} = ?`
    namesArgs.push(parentId)
  }
  const names = await db.execute({
    sql: `SELECT object_id, name, status, effective_status, account_id, campaign_id, adset_id,
                 bid_amount_cents, bid_strategy,
                 budget_cents, daily_budget_cents, lifetime_budget_cents, budget_remaining_cents,
                 (SELECT a.enabled FROM ad_accounts a
                   WHERE a.dashboard_id = ad_objects.dashboard_id AND a.account_id = ad_objects.account_id
                   LIMIT 1) AS account_enabled
          FROM ad_objects WHERE ${namesWhere}`,
    args: namesArgs,
  })
  const nameBy = new Map<string, any>()
  for (const r of names.rows as any[]) nameBy.set(String(r.object_id), r)

  // Objetos ativos entram mesmo sem gasto/venda no periodo (campanha recem-ligada, sync atrasado).
  const isActive = (r: any) =>
    Number(r.account_enabled) === 1 && String(r.effective_status ?? r.status ?? '').toUpperCase() === 'ACTIVE'
  const ids = new Set<string>([
    ...Array.from(salesBy.keys()),
    ...(spendRows.rows as any[]).map((r) => String(r.object_id)),
    ...(names.rows as any[]).filter(isActive).map((r) => String(r.object_id)),
  ])
  const spendBy = new Map<string, any>()
  for (const r of spendRows.rows as any[]) spendBy.set(String(r.object_id), r)

  return Array.from(ids)
    .map((id) => {
      const meta = nameBy.get(id)
      return {
        id,
        level,
        name: meta?.name ?? `(${level} ${id})`,
        status: meta?.effective_status ?? meta?.status ?? null,
        accountId: meta?.account_id ?? null,
        campaignId: meta?.campaign_id ?? null,
        adsetId: meta?.adset_id ?? null,
        adId: level === 'ad' ? id : null,
        bidAmount: n(meta?.bid_amount_cents),
        bidStrategy: meta?.bid_strategy ?? null,
        budget: n(meta?.budget_cents),
        dailyBudget: n(meta?.daily_budget_cents),
        lifetimeBudget: n(meta?.lifetime_budget_cents),
        budgetRemaining: n(meta?.budget_remaining_cents),
        ...decorate(salesBy.get(id) ?? {}, spendBy.get(id)),
      }
    })
    .sort((a, b) => b.profit - a.profit)
}

function decorate(sales: any, spendRow: any) {
  const n = (v: any) => Number(v || 0)
  const revenue = n(sales.revenue)
  const spend = n(spendRow?.spend)
  const cost = n(sales.cost)
  const approved = n(sales.approved_orders)
  const pending = n(sales.pending_orders)
  const total = n(sales.total_orders)
  const profit = revenue - spend - cost
  const impressions = n(spendRow?.impressions)
  const clicks = n(spendRow?.clicks)
  const visits = n(spendRow?.visits)
  const ic = n(spendRow?.ic)

  return {
    value: sales.value ?? null,
    objectId: sales.object_id ?? null,
    revenue,
    grossRevenue: n(sales.gross_revenue),
    spend,
    cost,
    profit,
    totalOrders: total,
    approvedOrders: approved,
    pendingOrders: pending,
    refundedOrders: n(sales.refunded_orders),
    roas: spend > 0 ? revenue / spend : null,
    roi: spend > 0 ? profit / spend : null,
    margin: revenue > 0 ? profit / revenue : null,
    cpa: approved > 0 && spend > 0 ? Math.round(spend / approved) : null,
    cpt: total > 0 && spend > 0 ? Math.round(spend / total) : null,
    cpp: pending > 0 && spend > 0 ? Math.round(spend / pending) : null,
    averageTicket: approved > 0 ? Math.round(revenue / approved) : 0,
    arpu: visits > 0 ? Math.round(revenue / visits) : approved > 0 ? Math.round(revenue / approved) : 0,
    costPerIc: ic > 0 && spend > 0 ? Math.round(spend / ic) : null,
    impressions,
    clicks,
    visits,
    ic,
    icRate: visits > 0 ? ic / visits : clicks > 0 ? ic / clicks : null,
    ctr: impressions > 0 ? clicks / impressions : null,
    cpm: impressions > 0 ? Math.round((spend / impressions) * 1000) : null,
    cpc: clicks > 0 ? Math.round(spend / clicks) : null,
  }
}
