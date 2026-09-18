import { db, initDb } from './db'
import { syncMetaInsights, syncMetaStatuses } from './meta'

export async function syncEnabledMetaAccounts(daysInput = 3) {
  await initDb()
  const days = Math.min(Math.max(Number(daysInput) || 3, 1), 90)
  const accounts = await db.execute({
    sql: `SELECT a.*, d.tz_offset FROM ad_accounts a JOIN dashboards d ON d.id = a.dashboard_id
          WHERE a.enabled = 1 AND a.platform = 'meta'`,
    args: [],
  })

  const results: any[] = []
  for (const a of accounts.rows as any[]) {
    const tz = Number(a.tz_offset ?? -3)
    const now = new Date(Date.now() + tz * 3600 * 1000)
    const until = now.toISOString().slice(0, 10)
    const since = new Date(now.getTime() - (days - 1) * 864e5).toISOString().slice(0, 10)

    try {
      const token = a.access_token || process.env.META_ACCESS_TOKEN
      if (!token) throw new Error('sem token')
      const r = await syncMetaInsights({ dashboardId: a.dashboard_id, accountId: a.account_id, accessToken: token, since, until })
      const statuses = await syncMetaStatuses({ dashboardId: a.dashboard_id, accountId: a.account_id, accessToken: token })
      results.push({ account: a.account_id, ...r, statuses })
    } catch (e: any) {
      results.push({ account: a.account_id, error: e?.message || 'falha' })
    }
  }

  return { ok: true, accounts: accounts.rows.length, results }
}
