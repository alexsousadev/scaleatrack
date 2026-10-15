import { db, initDb } from './db'
import { syncMetaInsights, syncMetaStatuses } from './meta'

export async function syncEnabledMetaAccounts(daysInput = 3, dashboardId?: string) {
  await initDb()
  const days = Math.min(Math.max(Number(daysInput) || 3, 1), 90)
  const accounts = await db.execute({
    sql: `SELECT a.*, d.tz_offset FROM ad_accounts a JOIN dashboards d ON d.id = a.dashboard_id
          WHERE a.enabled = 1 AND a.platform = 'meta'${dashboardId ? ' AND a.dashboard_id = ?' : ''}`,
    args: dashboardId ? [dashboardId] : [],
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
      // Sincroniza saldo disponível da conta e informações de cobrança
      let balanceError: string | undefined
      try {
        const accInfo = await fetch(
          `https://graph.facebook.com/${process.env.META_API_VERSION || 'v21.0'}/act_${a.account_id}?fields=amount_spent,spend_cap,balance,is_prepay_account,funding_source_details&access_token=${encodeURIComponent(token)}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) }
        ).then((res) => res.json())
        if (accInfo.error) throw new Error(accInfo.error.message || 'Falha ao atualizar saldo na Meta')
        if (accInfo && !accInfo.error) {
          const isPrepay = Boolean(accInfo.is_prepay_account)
          let balanceCents = 0
          const fs = accInfo.funding_source_details
          const display = fs?.display_string ? fs.display_string.replace(/\u00A0/g, ' ') : null
          const spendCap = Number(accInfo.spend_cap) || 0
          const amountSpent = Number(accInfo.amount_spent) || 0

          if (isPrepay) {
            // Em conta pré-paga, saldo disponível vem em display_string ou spend_cap - amount_spent
            if (display) {
              const m = display.match(/R\$\s*([\d.,]+)/i)
              if (m) {
                const numStr = m[1].replace(/\./g, '').replace(',', '.')
                const val = parseFloat(numStr)
                if (!isNaN(val)) balanceCents = Math.round(val * 100)
              }
            }
            if (balanceCents === 0 && spendCap > 0 && spendCap > amountSpent) {
              balanceCents = spendCap - amountSpent
            }
          } else {
            // Em conta pós-paga, accInfo.balance representa o valor já gasto a ser debitado na fatura atual
            balanceCents = Number(accInfo.balance) || 0
          }

          await db.execute({
            sql: `UPDATE ad_accounts 
                  SET balance_cents = ?, funding_source_label = ?, is_prepay = ?, spend_cap_cents = ?, amount_spent_cents = ? 
                  WHERE id = ?`,
            args: [balanceCents, display, isPrepay ? 1 : 0, spendCap, amountSpent, a.id],
          })
        }
      } catch (e: any) {
        balanceError = e?.message || 'Falha ao atualizar saldo'
      }

      // Status primeiro: e rapido e e o que marca as campanhas como ativas na tela.
      const statuses = await syncMetaStatuses({ dashboardId: a.dashboard_id, accountId: a.account_id, accessToken: token })
      const r = await syncMetaInsights({ dashboardId: a.dashboard_id, accountId: a.account_id, accessToken: token, since, until })

      results.push({ account: a.account_id, ...r, statuses, balanceError })
    } catch (e: any) {
      results.push({ account: a.account_id, error: e?.message || 'falha' })
    }
  }

  return { ok: !results.some((r) => r.error || r.balanceError), accounts: accounts.rows.length, results }
}
