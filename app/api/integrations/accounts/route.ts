import { NextRequest, NextResponse } from 'next/server'
import { db, initDb, newId } from '@/lib/db'
import { errorResponse } from '@/lib/request'
import { listMetaAdAccountsWithDiagnostics } from '@/lib/meta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const dashboardId = req.nextUrl.searchParams.get('dashboardId') || ''
    await initDb()
    const r = await db.execute({
      sql: `SELECT id, platform, profile_name, business_id, business_name, account_id, name, currency, account_status, enabled
            FROM ad_accounts WHERE dashboard_id = ? ORDER BY platform, name`,
      args: [dashboardId],
    })
    return NextResponse.json({ accounts: r.rows })
  } catch (e) {
    return errorResponse(e)
  }
}

/** Conecta um token e importa as contas de anuncio dele. */
export async function POST(req: NextRequest) {
  try {
    const { dashboardId, accessToken, profileName } = await req.json()
    const token = accessToken || process.env.META_ACCESS_TOKEN
    if (!token) return NextResponse.json({ error: 'token da Meta ausente' }, { status: 400 })

    const { accounts, diagnostics } = await listMetaAdAccountsWithDiagnostics(token)
    await initDb()
    for (const a of accounts) {
      await db.execute({
        sql: `INSERT INTO ad_accounts (
                id, dashboard_id, platform, profile_name, business_id, business_name, account_id,
                name, currency, account_status, access_token, enabled
              )
              VALUES (?,?, 'meta', ?,?,?,?,?,?,?,?, 0)
              ON CONFLICT (dashboard_id, platform, account_id) DO UPDATE SET
                profile_name = COALESCE(excluded.profile_name, ad_accounts.profile_name),
                business_id = COALESCE(excluded.business_id, ad_accounts.business_id),
                business_name = COALESCE(excluded.business_name, ad_accounts.business_name),
                name = excluded.name,
                currency = excluded.currency,
                account_status = excluded.account_status,
                access_token = excluded.access_token`,
        args: [
          newId(), dashboardId, profileName ?? null, a.businessId, a.businessName,
          a.accountId, a.name, a.currency, a.accountStatus, token,
        ],
      })
    }
    return NextResponse.json({ imported: accounts.length, diagnostics })
  } catch (e) {
    return errorResponse(e)
  }
}

/** Liga/desliga a conta pra sincronizacao (igual ao "enabled" da Utmify). */
export async function PATCH(req: NextRequest) {
  try {
    const { id, enabled } = await req.json()
    await initDb()
    const r = await db.execute({ sql: `SELECT dashboard_id FROM ad_accounts WHERE id = ?`, args: [id] })
    if (!r.rows.length) return NextResponse.json({ error: 'conta nao encontrada' }, { status: 404 })
    await db.execute({ sql: `UPDATE ad_accounts SET enabled = ? WHERE id = ?`, args: [enabled ? 1 : 0, id] })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
