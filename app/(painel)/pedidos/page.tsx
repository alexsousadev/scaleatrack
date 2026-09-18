'use client'

import { useEffect, useMemo, useState } from 'react'
import { money, num, usePanel, useQuery } from '../../components/ui'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  paid: { label: 'Pago', color: 'text-good' },
  waiting_payment: { label: 'Pendente', color: 'text-warn' },
  refused: { label: 'Recusado', color: 'text-muted' },
  refunded: { label: 'Reembolso', color: 'text-bad' },
  chargedback: { label: 'Chargeback', color: 'text-bad' },
}

const SOURCE_LABEL: Record<string, string> = {
  meta: 'FB',
  facebook: 'FB',
  google: 'Google',
  tiktok: 'TikTok',
  kwai: 'Kwai',
  organic: 'Org',
}

function maskEmail(email?: string | null) {
  if (!email) return '-'
  const [name, domain] = email.split('@')
  if (!domain) return email
  return `${name.slice(0, 2)}***@${domain}`
}

function fmtDate(iso?: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function short(v?: string | null, n = 26) {
  if (!v) return '-'
  return v.length > n ? `${v.slice(0, n)}...` : v
}

export default function PedidosPage() {
  const query = useQuery()
  const { currency } = usePanel()
  const [status, setStatus] = useState('paid')
  const [origin, setOrigin] = useState('')
  const [product, setProduct] = useState('')
  const [platform, setPlatform] = useState('')
  const [campaign, setCampaign] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [rows, setRows] = useState<any[]>([])
  const [options, setOptions] = useState<any>({ products: [], platforms: [], campaigns: [], origins: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!query) return
    const params = new URLSearchParams(query)
    if (status) params.set('status', status)
    if (origin) params.set('origin', origin)
    if (product) params.set('product', product)
    if (platform) params.set('platform', platform)
    if (campaign) params.set('campaign', campaign)
    params.set('limit', '300')

    setLoading(true)
    fetch(`/api/orders?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        setRows(j.orders || [])
        setOptions(j.options || { products: [], platforms: [], campaigns: [], origins: [] })
      })
      .finally(() => setLoading(false))
  }, [query, status, origin, product, platform, campaign])

  const title = useMemo(() => {
    if (status === 'paid') return `${num(rows.length)} vendas no periodo`
    return `${num(rows.length)} pedidos no periodo`
  }, [rows.length, status])

  function exportCsv() {
    const headers = ['data', 'cliente', 'email', 'produto', 'valor', 'plataforma', 'origem', 'campanha', 'status']
    const body = rows.map((r) => [
      r.created_at,
      r.customer_name || '',
      r.customer_email || '',
      r.products || '',
      String((Number(r.net_cents || r.gross_cents || 0) / 100).toFixed(2)).replace('.', ','),
      r.platform || '',
      r.traffic_source || r.utm_source || '',
      r.utm_campaign || '',
      r.status || '',
    ])
    const csv = [headers, ...body].map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'vendas.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Vendas</h1>
          <p className="text-sm text-muted mt-1">{title}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Filter value={origin} onChange={setOrigin} label="Todas as origens" values={options.origins} />
          <Filter value={product} onChange={setProduct} label="Todos os produtos" values={options.products} wide />
          <Filter value={platform} onChange={setPlatform} label="Todas as plataformas" values={options.platforms} />
          <Filter value={campaign} onChange={setCampaign} label="Todas as campanhas" values={options.campaigns} wide />
          <button onClick={exportCsv} className="text-xs px-3 py-2 rounded-lg border border-line hover:border-brand">
            Exportar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ['paid', 'Pagas'],
          ['', 'Todas'],
          ['waiting_payment', 'Pendentes'],
          ['refunded', 'Reembolsos'],
          ['chargedback', 'Chargebacks'],
        ].map(([id, label]) => (
          <button key={label} onClick={() => setStatus(id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${status === id ? 'border-brand bg-brand/15' : 'border-line text-muted hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted">Carregando...</p>
      ) : rows.length === 0 ? (
        <div className="border border-line rounded-xl p-8 text-center text-muted">Nenhuma venda nesse periodo.</div>
      ) : (
        <div className="border border-line rounded-xl overflow-hidden bg-panel">
          <div className="hidden lg:grid grid-cols-[1.5fr_1.4fr_.7fr_.8fr_.7fr_1fr_.7fr_.8fr] gap-4 px-4 py-3 text-[11px] uppercase tracking-wide text-muted border-b border-line">
            <span>Cliente</span>
            <span>Produto</span>
            <span>Valor</span>
            <span>Plataforma</span>
            <span>Origem</span>
            <span>Campanha</span>
            <span>CAPI</span>
            <span>Data</span>
          </div>
          {rows.map((r) => {
            const isOpen = expanded === r.id
            return (
              <div key={r.id} className="border-b border-line last:border-0">
                <button
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="w-full grid lg:grid-cols-[1.5fr_1.4fr_.7fr_.8fr_.7fr_1fr_.7fr_.8fr] gap-3 lg:gap-4 px-4 py-4 text-left hover:bg-ink/35"
                >
                  <Cell label="Cliente">
                    <div className="font-medium truncate">{r.customer_name || maskEmail(r.customer_email)}</div>
                    <div className="text-xs text-muted truncate">{maskEmail(r.customer_email)}</div>
                    <div className="text-xs text-muted truncate">{r.customer_country || '-'}</div>
                  </Cell>
                  <Cell label="Produto">
                    <div className="font-medium truncate" title={r.products}>{r.products || '-'}</div>
                    <div className="text-xs text-muted">ID: {short(r.external_id)}</div>
                  </Cell>
                  <Cell label="Valor">
                    <div className="font-semibold">{money(r.net_cents || r.gross_cents, currency)}</div>
                    <div className={STATUS_LABEL[r.status]?.color || 'text-muted'}>{STATUS_LABEL[r.status]?.label || r.status}</div>
                  </Cell>
                  <Cell label="Plataforma">
                    <span className="inline-flex rounded-full border border-line bg-ink px-2 py-1 text-xs">{r.platform}</span>
                  </Cell>
                  <Cell label="Origem">
                    <span className="inline-flex rounded-full bg-brand/20 text-white px-2 py-1 text-xs">
                      {SOURCE_LABEL[r.traffic_source || r.utm_source] || r.traffic_source || r.utm_source || '-'}
                    </span>
                  </Cell>
                  <Cell label="Campanha">
                    <span className="truncate text-sm" title={r.utm_campaign}>{r.utm_campaign || '-'}</span>
                  </Cell>
                  <Cell label="CAPI">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs ${r.capi_status === 'sent' ? 'bg-brand text-white' : 'bg-ink text-muted border border-line'}`}>
                      {r.capi_status === 'sent' ? 'Enviado' : '-'}
                    </span>
                  </Cell>
                  <Cell label="Data">{fmtDate(r.created_at)}</Cell>
                </button>
                {isOpen && <SaleDetails row={r} currency={currency} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Filter({ value, onChange, label, values, wide }: { value: string; onChange: (v: string) => void; label: string; values: string[]; wide?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
            className={`bg-panel border border-line rounded-lg px-3 py-2 text-sm ${wide ? 'w-56' : 'w-44'}`}>
      <option value="">{label}</option>
      {values.map((v) => (
        <option key={v} value={v}>{v}</option>
      ))}
    </select>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 text-sm">
      <div className="lg:hidden text-[10px] uppercase tracking-wide text-muted mb-1">{label}</div>
      {children}
    </div>
  )
}

function SaleDetails({ row, currency }: { row: any; currency: string }) {
  return (
    <div className="grid md:grid-cols-3 gap-8 px-4 pb-5 pt-2 text-sm bg-ink/30">
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-muted">Cliente</div>
        <div className="font-medium">{row.customer_name || '-'}</div>
        <div className="text-muted">{row.customer_email || '-'}</div>
        <div className="text-muted">{row.customer_phone || '-'}</div>
        <div className="text-muted">{row.customer_country || '-'}</div>
      </div>
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-muted">Rastreamento</div>
        <Detail label="Origem" value={row.traffic_source || row.utm_source || '-'} />
        <Detail label="Campanha" value={row.utm_campaign || '-'} />
        <Detail label="Conjunto" value={row.utm_term || '-'} />
        <Detail label="Anuncio" value={row.utm_content || '-'} />
        <Detail label="SCK" value={row.sck || row.visitor_id || '-'} />
      </div>
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-muted">Detalhes tecnicos</div>
        <Detail label="IP" value={row.customer_ip || '-'} />
        <Detail label="Metodo" value={row.payment_method || '-'} />
        <Detail label="Bruto" value={money(row.gross_cents, currency)} />
        <Detail label="Taxa" value={money(row.gateway_fee_cents, currency)} />
        <Detail label="FBP" value={short(row.fbp, 34)} />
        <Detail label="FBC" value={short(row.fbc, 34)} />
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-muted">
      <span className="text-white">{label}:</span> {value}
    </div>
  )
}
