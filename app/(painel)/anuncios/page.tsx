'use client'

import { useEffect, useMemo, useState } from 'react'
import { money, num, ratio, usePanel, useQuery } from '../../components/ui'

const LEVELS = [
  { id: 'account', label: 'Contas', title: 'Contas' },
  { id: 'campaign', label: 'Campanhas', title: 'Campanhas' },
  { id: 'adset', label: 'Conjuntos', title: 'Conjuntos' },
  { id: 'ad', label: 'Anuncios', title: 'Anuncios' },
]

const STATUS_OPTIONS = [
  { id: '', label: 'Qualquer' },
  { id: 'ACTIVE', label: 'Ativos' },
  { id: 'PAUSED', label: 'Pausados' },
  { id: 'red', label: 'No vermelho' },
  { id: 'sales', label: 'Com venda' },
]

function pct(v: number | null | undefined) {
  if (v == null) return '-'
  return `${(v * 100).toFixed(2)}%`
}

function verdict(r: any) {
  if (r.approvedOrders > 0 && r.profit > 0) return { label: 'Escalar', cls: 'text-good' }
  if (r.spend > 0 && r.approvedOrders === 0) return { label: 'Matar', cls: 'text-bad' }
  if (r.profit < 0) return { label: 'No vermelho', cls: 'text-bad' }
  return { label: 'Segurar', cls: 'text-muted' }
}

export default function AnunciosPage() {
  const query = useQuery()
  const { currency } = usePanel()
  const [level, setLevel] = useState<'account' | 'campaign' | 'adset' | 'ad'>('campaign')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('spend')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!query) return
    const load = () => {
      setLoading(true)
      fetch(`/api/metrics/adobjects?${query}&level=${level}`)
        .then((r) => r.json())
        .then((j) => setRows(j.results || []))
        .finally(() => setLoading(false))
    }
    load()
    window.addEventListener('scaletrack:meta-sync', load)
    return () => window.removeEventListener('scaletrack:meta-sync', load)
  }, [query, level])

  const filtered = useMemo(() => {
    const list = rows.filter((r) => {
      if (status === 'red') return r.profit < 0 || (r.spend > 0 && r.approvedOrders === 0)
      if (status === 'sales') return r.approvedOrders > 0
      if (status) return String(r.status || '').toUpperCase().includes(status)
      return true
    })
    return [...list].sort((a, b) => Number(b[sort] || 0) - Number(a[sort] || 0))
  }, [rows, status, sort])

  const totals = useMemo(() => filtered.reduce((acc, r) => {
    acc.spend += Number(r.spend || 0)
    acc.revenue += Number(r.revenue || 0)
    acc.profit += Number(r.profit || 0)
    acc.sales += Number(r.approvedOrders || 0)
    acc.pending += Number(r.pendingOrders || 0)
    acc.impressions += Number(r.impressions || 0)
    acc.clicks += Number(r.clicks || 0)
    return acc
  }, { spend: 0, revenue: 0, profit: 0, sales: 0, pending: 0, impressions: 0, clicks: 0 }), [filtered])

  const current = LEVELS.find((l) => l.id === level) || LEVELS[1]

  function exportCsv() {
    const headers = ['nome', 'status', 'gasto', 'vendas', 'pendentes', 'faturamento', 'lucro', 'roas', 'cpa', 'impressoes', 'cliques', 'ctr']
    const body = filtered.map((r) => [
      r.name,
      r.status || '',
      (Number(r.spend || 0) / 100).toFixed(2),
      r.approvedOrders || 0,
      r.pendingOrders || 0,
      (Number(r.revenue || 0) / 100).toFixed(2),
      (Number(r.profit || 0) / 100).toFixed(2),
      r.roas == null ? '' : r.roas.toFixed(2),
      r.cpa == null ? '' : (Number(r.cpa) / 100).toFixed(2),
      r.impressions || 0,
      r.clicks || 0,
      r.ctr == null ? '' : (r.ctr * 100).toFixed(2),
    ])
    const csv = [headers, ...body].map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${level}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{current.title}</h1>
          <p className="text-sm text-muted mt-1">{num(filtered.length)} item(ns) no periodo</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-6 border-b border-line">
        {LEVELS.map((l) => (
          <button key={l.id} onClick={() => setLevel(l.id as any)}
                  className={`pb-3 text-sm border-b-2 ${level === l.id ? 'border-brand text-white' : 'border-transparent text-muted hover:text-white'}`}>
            {l.label}
          </button>
        ))}
      </div>

      <div className="bg-panel border border-line rounded-xl p-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs text-muted">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-ink border border-line rounded-lg px-3 py-2 text-sm w-36">
            {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted">Ordenar por</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="bg-ink border border-line rounded-lg px-3 py-2 text-sm w-40">
            <option value="spend">Gasto</option>
            <option value="revenue">Faturamento</option>
            <option value="profit">Lucro</option>
            <option value="approvedOrders">Vendas</option>
            <option value="roas">ROAS</option>
            <option value="cpa">CPA</option>
            <option value="clicks">Cliques</option>
          </select>
        </label>
        <button onClick={() => window.dispatchEvent(new Event('scaletrack:meta-sync'))}
                className="text-xs px-3 py-2 rounded-lg border border-line hover:border-brand">
          Atualizar
        </button>
        <button onClick={exportCsv} className="text-xs px-3 py-2 rounded-lg border border-line hover:border-brand">
          Exportar
        </button>
      </div>

      {loading ? (
        <p className="text-muted">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="border border-line rounded-xl p-8 text-center text-muted">
          Sem dados. Conecte uma conta de anuncios, habilite a conta e clique em Sincronizar Meta.
        </div>
      ) : (
        <div className="border border-line rounded-xl overflow-x-auto bg-panel">
          <table className="w-full min-w-[1280px] text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted border-b border-line">
                <th className="text-left px-4 py-3 w-12">Status</th>
                <th className="text-left px-4 py-3">{current.title.slice(0, -1) || 'Nome'}</th>
                <Th>Orcamento</Th>
                <Th>Gasto</Th>
                <Th>Vendas</Th>
                <Th>Vendas Pend.</Th>
                <Th>Faturamento</Th>
                <Th>Lucro</Th>
                <Th>ROAS</Th>
                <Th>CPA</Th>
                <Th>Ticket</Th>
                <Th>Impressoes</Th>
                <Th>Cliques</Th>
                <Th>CTR</Th>
                <Th>Veredito</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const v = verdict(r)
                return (
                  <tr key={r.id} className="border-b border-line hover:bg-ink/35">
                    <td className="px-4 py-4">
                      <span className={`block h-3 w-3 rounded-full ${String(r.status).includes('ACTIVE') ? 'bg-good' : r.status ? 'bg-muted' : 'bg-line'}`} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold truncate max-w-[260px]" title={r.name}>{r.name}</div>
                      <div className="text-xs text-muted">{r.status || 'N/A'}</div>
                    </td>
                    <Td muted>{level === 'campaign' ? 'N/A' : 'Orc. no conjunto'}</Td>
                    <Td>{money(r.spend, currency)}</Td>
                    <Td>{num(r.approvedOrders)}</Td>
                    <Td>{num(r.pendingOrders)}</Td>
                    <Td>{money(r.revenue, currency)}</Td>
                    <Td cls={r.profit >= 0 ? 'text-good' : 'text-bad'}>{money(r.profit, currency)}</Td>
                    <Td cls={r.roas != null && r.roas >= 1 ? 'text-good' : r.roas === 0 ? 'text-bad' : ''}>{ratio(r.roas)}</Td>
                    <Td>{r.cpa == null ? '-' : money(r.cpa, currency)}</Td>
                    <Td>{money(r.averageTicket, currency)}</Td>
                    <Td>{num(r.impressions)}</Td>
                    <Td>{num(r.clicks)}</Td>
                    <Td>{pct(r.ctr)}</Td>
                    <Td cls={v.cls}>{v.label}</Td>
                  </tr>
                )
              })}
              <tr className="font-semibold bg-ink/45">
                <td className="px-4 py-3" />
                <td className="px-4 py-3">{num(filtered.length)} {current.title.toUpperCase()}</td>
                <Td muted>-</Td>
                <Td>{money(totals.spend, currency)}</Td>
                <Td>{num(totals.sales)}</Td>
                <Td>{num(totals.pending)}</Td>
                <Td>{money(totals.revenue, currency)}</Td>
                <Td cls={totals.profit >= 0 ? 'text-good' : 'text-bad'}>{money(totals.profit, currency)}</Td>
                <Td>{totals.spend > 0 ? ratio(totals.revenue / totals.spend) : '-'}</Td>
                <Td>{totals.sales > 0 ? money(Math.round(totals.spend / totals.sales), currency) : '-'}</Td>
                <Td>{totals.sales > 0 ? money(Math.round(totals.revenue / totals.sales), currency) : '-'}</Td>
                <Td>{num(totals.impressions)}</Td>
                <Td>{num(totals.clicks)}</Td>
                <Td>{totals.impressions > 0 ? pct(totals.clicks / totals.impressions) : '-'}</Td>
                <Td muted>-</Td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-right px-4 py-3 whitespace-nowrap">{children}</th>
}

function Td({ children, cls = '', muted }: { children: React.ReactNode; cls?: string; muted?: boolean }) {
  return <td className={`text-right px-4 py-4 tabular-nums whitespace-nowrap ${muted ? 'text-muted' : ''} ${cls}`}>{children}</td>
}
