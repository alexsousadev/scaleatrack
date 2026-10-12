'use client'

import { useEffect, useMemo, useState } from 'react'
import { money, num, ratio, usePanel, useQuery } from '../../components/ui'

type LevelId = 'account' | 'campaign' | 'adset' | 'ad'

const LEVELS = [
  { id: 'account', label: 'Contas', title: 'Contas' },
  { id: 'campaign', label: 'Campanhas', title: 'Campanhas' },
  { id: 'adset', label: 'Conjuntos', title: 'Conjuntos' },
  { id: 'ad', label: 'Anuncios', title: 'Anuncios' },
] satisfies { id: LevelId; label: string; title: string }[]

const STATUS_OPTIONS = [
  { id: '', label: 'Qualquer' },
  { id: 'ACTIVE', label: 'Ativos' },
  { id: 'PAUSED', label: 'Pausados' },
  { id: 'red', label: 'No vermelho' },
  { id: 'sales', label: 'Com venda' },
]

type ColumnKey =
  | 'bid'
  | 'spend'
  | 'sales'
  | 'pendingSales'
  | 'revenue'
  | 'profit'
  | 'roas'
  | 'margin'
  | 'cpa'
  | 'arpu'
  | 'costPerIc'
  | 'cpc'
  | 'ctr'
  | 'cpm'
  | 'impressions'
  | 'clicks'
  | 'visits'
  | 'ic'
  | 'icRate'
  | 'id'
  | 'campaignId'
  | 'adsetId'
  | 'adId'
  | 'verdict'

interface ColumnDef {
  key: ColumnKey
  label: string
  defaultVisible: boolean
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'bid', label: 'Lance', defaultVisible: true },
  { key: 'spend', label: 'Gasto', defaultVisible: true },
  { key: 'sales', label: 'Vendas', defaultVisible: true },
  { key: 'pendingSales', label: 'Vendas Pendentes', defaultVisible: true },
  { key: 'revenue', label: 'Faturamento', defaultVisible: true },
  { key: 'profit', label: 'Lucro', defaultVisible: true },
  { key: 'roas', label: 'ROAS', defaultVisible: true },
  { key: 'margin', label: 'Margem', defaultVisible: false },
  { key: 'cpa', label: 'CPA', defaultVisible: true },
  { key: 'arpu', label: 'ARPU', defaultVisible: true },
  { key: 'costPerIc', label: 'Custo por IC', defaultVisible: false },
  { key: 'cpc', label: 'CPC', defaultVisible: true },
  { key: 'ctr', label: 'CTR', defaultVisible: false },
  { key: 'cpm', label: 'CPM', defaultVisible: true },
  { key: 'impressions', label: 'Impressões', defaultVisible: true },
  { key: 'clicks', label: 'Cliques', defaultVisible: true },
  { key: 'visits', label: 'Visitas', defaultVisible: true },
  { key: 'ic', label: 'IC', defaultVisible: false },
  { key: 'icRate', label: '% IC', defaultVisible: false },
  { key: 'id', label: 'ID', defaultVisible: false },
  { key: 'campaignId', label: 'ID Campanha', defaultVisible: false },
  { key: 'adsetId', label: 'ID Conjunto', defaultVisible: false },
  { key: 'adId', label: 'ID Anúncio', defaultVisible: false },
  { key: 'verdict', label: 'Veredito', defaultVisible: true },
]

const STORAGE_KEY = 'scaletrack_ad_columns_v2'

function getInitialColumns(): ColumnKey[] {
  if (typeof window === 'undefined') {
    return ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)
}

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

function childLevel(level: LevelId): LevelId | null {
  if (level === 'account') return 'campaign'
  if (level === 'campaign') return 'adset'
  if (level === 'adset') return 'ad'
  return null
}

function bidOrBudgetLabel(r: any, currency: string) {
  if (r.bidAmount && r.bidAmount > 0) {
    const strat = r.bidStrategy ? ` (${r.bidStrategy.replace(/_/g, ' ').toLowerCase()})` : ''
    return `${money(r.bidAmount, currency)}${strat}`
  }
  const budget = Number(r.budget || 0)
  if (budget <= 0) return '-'
  const kind = Number(r.lifetimeBudget || 0) > 0 ? 'total' : 'dia'
  return `${money(budget, currency)} / ${kind}`
}

export default function AnunciosPage() {
  const query = useQuery()
  const { currency } = usePanel()
  const [level, setLevel] = useState<LevelId>('campaign')
  const [trail, setTrail] = useState<{ level: LevelId; id: string; name: string }[]>([])
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('spend')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Personalizacao de colunas
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(getInitialColumns)
  const [modalOpen, setModalOpen] = useState(false)
  const [tempColumns, setTempColumns] = useState<ColumnKey[]>(visibleColumns)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleColumns))
    } catch {}
  }, [visibleColumns])

  useEffect(() => {
    if (!query) return
    const load = () => {
      setLoading(true)
      const parent = trail[trail.length - 1]
      const parentQuery = parent ? `&parentId=${encodeURIComponent(parent.id)}` : ''
      fetch(`/api/metrics/adobjects?${query}&level=${level}${parentQuery}`)
        .then((r) => r.json())
        .then((j) => setRows(j.results || []))
        .finally(() => setLoading(false))
    }
    load()
    window.addEventListener('scaletrack:meta-sync', load)
    return () => window.removeEventListener('scaletrack:meta-sync', load)
  }, [query, level, trail])

  const filtered = useMemo(() => {
    const list = rows.filter((r) => {
      if (status === 'red') return r.profit < 0 || (r.spend > 0 && r.approvedOrders === 0)
      if (status === 'sales') return r.approvedOrders > 0
      if (status) return String(r.status || '').toUpperCase().includes(status)
      return true
    })
    return [...list].sort((a, b) => Number(b[sort] || 0) - Number(a[sort] || 0))
  }, [rows, status, sort])

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => {
          acc.spend += Number(r.spend || 0)
          acc.revenue += Number(r.revenue || 0)
          acc.profit += Number(r.profit || 0)
          acc.sales += Number(r.approvedOrders || 0)
          acc.pending += Number(r.pendingOrders || 0)
          acc.impressions += Number(r.impressions || 0)
          acc.clicks += Number(r.clicks || 0)
          acc.visits += Number(r.visits || 0)
          acc.ic += Number(r.ic || 0)
          return acc
        },
        { spend: 0, revenue: 0, profit: 0, sales: 0, pending: 0, impressions: 0, clicks: 0, visits: 0, ic: 0 }
      ),
    [filtered]
  )

  const current = LEVELS.find((l) => l.id === level) || LEVELS[1]
  const parent = trail[trail.length - 1]

  function goToLevel(nextLevel: LevelId) {
    setLevel(nextLevel)
    setTrail([])
  }

  function drill(row: any) {
    const nextLevel = childLevel(level)
    if (!nextLevel) return
    setTrail([...trail, { level, id: row.id, name: row.name }])
    setLevel(nextLevel)
  }

  function backTo(index: number) {
    const nextTrail = trail.slice(0, index + 1)
    setTrail(nextTrail)
    setLevel(childLevel(nextTrail[nextTrail.length - 1].level) || 'campaign')
  }

  function resetToCampaigns() {
    setTrail([])
    setLevel('campaign')
  }

  function openCustomizeModal() {
    setTempColumns([...visibleColumns])
    setModalOpen(true)
  }

  function toggleColumnTemp(key: ColumnKey) {
    setTempColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  function saveCustomColumns() {
    setVisibleColumns(tempColumns)
    setModalOpen(false)
  }

  function exportCsv() {
    const headers = ['nome', 'status', ...visibleColumns]
    const body = filtered.map((r) => {
      const line: any[] = [r.name, r.status || '']
      visibleColumns.forEach((k) => {
        switch (k) {
          case 'bid':
            line.push(r.bidAmount ? (r.bidAmount / 100).toFixed(2) : (Number(r.budget || 0) / 100).toFixed(2))
            break
          case 'spend':
            line.push((Number(r.spend || 0) / 100).toFixed(2))
            break
          case 'sales':
            line.push(r.approvedOrders || 0)
            break
          case 'pendingSales':
            line.push(r.pendingOrders || 0)
            break
          case 'revenue':
            line.push((Number(r.revenue || 0) / 100).toFixed(2))
            break
          case 'profit':
            line.push((Number(r.profit || 0) / 100).toFixed(2))
            break
          case 'roas':
            line.push(r.roas == null ? '' : r.roas.toFixed(2))
            break
          case 'margin':
            line.push(r.margin == null ? '' : (r.margin * 100).toFixed(2))
            break
          case 'cpa':
            line.push(r.cpa == null ? '' : (Number(r.cpa) / 100).toFixed(2))
            break
          case 'arpu':
            line.push(r.arpu == null ? '' : (Number(r.arpu) / 100).toFixed(2))
            break
          case 'costPerIc':
            line.push(r.costPerIc == null ? '' : (Number(r.costPerIc) / 100).toFixed(2))
            break
          case 'cpc':
            line.push(r.cpc == null ? '' : (Number(r.cpc) / 100).toFixed(2))
            break
          case 'ctr':
            line.push(r.ctr == null ? '' : (r.ctr * 100).toFixed(2))
            break
          case 'cpm':
            line.push(r.cpm == null ? '' : (Number(r.cpm) / 100).toFixed(2))
            break
          case 'impressions':
            line.push(r.impressions || 0)
            break
          case 'clicks':
            line.push(r.clicks || 0)
            break
          case 'visits':
            line.push(r.visits || 0)
            break
          case 'ic':
            line.push(r.ic || 0)
            break
          case 'icRate':
            line.push(r.icRate == null ? '' : (r.icRate * 100).toFixed(2))
            break
          case 'id':
            line.push(r.id || '')
            break
          case 'campaignId':
            line.push(r.campaignId || '')
            break
          case 'adsetId':
            line.push(r.adsetId || '')
            break
          case 'adId':
            line.push(r.adId || '')
            break
          case 'verdict':
            line.push(verdict(r).label)
            break
          default:
            line.push('')
        }
      })
      return line
    })
    const csv = [headers, ...body].map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${level}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isCol = (key: ColumnKey) => visibleColumns.includes(key)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{current.title}</h1>
          <p className="text-sm text-muted mt-1">
            {num(filtered.length)} item(ns) no periodo{parent ? ` em ${parent.name}` : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-6 border-b border-line">
        {LEVELS.map((l) => (
          <button
            key={l.id}
            onClick={() => goToLevel(l.id)}
            className={`pb-3 text-sm border-b-2 ${
              level === l.id ? 'border-brand text-white' : 'border-transparent text-muted hover:text-white'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {(trail.length > 0 || level !== 'campaign') && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button onClick={resetToCampaigns} className="text-muted hover:text-white">
            Campanhas
          </button>
          {trail.map((item, index) => (
            <span key={`${item.level}:${item.id}`} className="flex items-center gap-2">
              <span className="text-muted">/</span>
              <button onClick={() => backTo(index)} className="text-muted hover:text-white max-w-[260px] truncate">
                {item.name}
              </button>
            </span>
          ))}
          <span className="text-muted">/</span>
          <span className="text-white">{current.title}</span>
        </div>
      )}

      <div className="bg-panel border border-line rounded-xl p-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs text-muted">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-ink border border-line rounded-lg px-3 py-2 text-sm w-36"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted">Ordenar por</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-ink border border-line rounded-lg px-3 py-2 text-sm w-40"
          >
            <option value="spend">Gasto</option>
            <option value="revenue">Faturamento</option>
            <option value="profit">Lucro</option>
            <option value="approvedOrders">Vendas</option>
            <option value="roas">ROAS</option>
            <option value="cpa">CPA</option>
            <option value="clicks">Cliques</option>
            <option value="visits">Visitas</option>
          </select>
        </label>

        <button
          onClick={openCustomizeModal}
          className="text-xs px-3 py-2 rounded-lg border border-brand bg-brand/15 text-white hover:bg-brand/25 flex items-center gap-1.5 font-medium transition"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          Personalizar colunas
        </button>

        <button
          onClick={() => window.dispatchEvent(new Event('scaletrack:meta-sync'))}
          className="text-xs px-3 py-2 rounded-lg border border-line hover:border-brand"
        >
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
                {isCol('bid') && <Th>Lance</Th>}
                {isCol('spend') && <Th>Gasto</Th>}
                {isCol('sales') && <Th>Vendas</Th>}
                {isCol('pendingSales') && <Th>Vendas Pend.</Th>}
                {isCol('revenue') && <Th>Faturamento</Th>}
                {isCol('profit') && <Th>Lucro</Th>}
                {isCol('roas') && <Th>ROAS</Th>}
                {isCol('margin') && <Th>Margem</Th>}
                {isCol('cpa') && <Th>CPA</Th>}
                {isCol('arpu') && <Th>ARPU</Th>}
                {isCol('costPerIc') && <Th>Custo por IC</Th>}
                {isCol('cpc') && <Th>CPC</Th>}
                {isCol('ctr') && <Th>CTR</Th>}
                {isCol('cpm') && <Th>CPM</Th>}
                {isCol('impressions') && <Th>Impressões</Th>}
                {isCol('clicks') && <Th>Cliques</Th>}
                {isCol('visits') && <Th>Visitas</Th>}
                {isCol('ic') && <Th>IC</Th>}
                {isCol('icRate') && <Th>% IC</Th>}
                {isCol('id') && <Th>ID</Th>}
                {isCol('campaignId') && <Th>ID Campanha</Th>}
                {isCol('adsetId') && <Th>ID Conjunto</Th>}
                {isCol('adId') && <Th>ID Anúncio</Th>}
                {isCol('verdict') && <Th>Veredito</Th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const v = verdict(r)
                return (
                  <tr
                    key={r.id}
                    onClick={() => drill(r)}
                    className={`border-b border-line hover:bg-ink/35 ${childLevel(level) ? 'cursor-pointer' : ''}`}
                  >
                    <td className="px-4 py-4">
                      <span
                        className={`block h-3 w-3 rounded-full ${
                          String(r.status).includes('ACTIVE') ? 'bg-good' : r.status ? 'bg-muted' : 'bg-line'
                        }`}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold truncate max-w-[260px]" title={r.name}>
                        {r.name}
                      </div>
                      <div className="text-xs text-muted">{r.status || 'N/A'}</div>
                    </td>
                    {isCol('bid') && <Td muted={Number(r.bidAmount || r.budget || 0) <= 0}>{bidOrBudgetLabel(r, currency)}</Td>}
                    {isCol('spend') && <Td>{money(r.spend, currency)}</Td>}
                    {isCol('sales') && <Td>{num(r.approvedOrders)}</Td>}
                    {isCol('pendingSales') && <Td>{num(r.pendingOrders)}</Td>}
                    {isCol('revenue') && <Td>{money(r.revenue, currency)}</Td>}
                    {isCol('profit') && <Td cls={r.profit >= 0 ? 'text-good' : 'text-bad'}>{money(r.profit, currency)}</Td>}
                    {isCol('roas') && <Td cls={r.roas != null && r.roas >= 1 ? 'text-good' : r.roas === 0 ? 'text-bad' : ''}>{ratio(r.roas)}</Td>}
                    {isCol('margin') && <Td cls={r.margin != null && r.margin >= 0 ? 'text-good' : 'text-bad'}>{pct(r.margin)}</Td>}
                    {isCol('cpa') && <Td>{r.cpa == null ? '-' : money(r.cpa, currency)}</Td>}
                    {isCol('arpu') && <Td>{r.arpu == null ? '-' : money(r.arpu, currency)}</Td>}
                    {isCol('costPerIc') && <Td>{r.costPerIc == null ? '-' : money(r.costPerIc, currency)}</Td>}
                    {isCol('cpc') && <Td>{r.cpc == null ? '-' : money(r.cpc, currency)}</Td>}
                    {isCol('ctr') && <Td>{pct(r.ctr)}</Td>}
                    {isCol('cpm') && <Td>{r.cpm == null ? '-' : money(r.cpm, currency)}</Td>}
                    {isCol('impressions') && <Td>{num(r.impressions)}</Td>}
                    {isCol('clicks') && <Td>{num(r.clicks)}</Td>}
                    {isCol('visits') && <Td>{num(r.visits)}</Td>}
                    {isCol('ic') && <Td>{num(r.ic)}</Td>}
                    {isCol('icRate') && <Td>{pct(r.icRate)}</Td>}
                    {isCol('id') && <Td muted><span className="font-mono text-xs">{r.id}</span></Td>}
                    {isCol('campaignId') && <Td muted><span className="font-mono text-xs">{r.campaignId || '-'}</span></Td>}
                    {isCol('adsetId') && <Td muted><span className="font-mono text-xs">{r.adsetId || '-'}</span></Td>}
                    {isCol('adId') && <Td muted><span className="font-mono text-xs">{r.adId || '-'}</span></Td>}
                    {isCol('verdict') && <Td cls={v.cls}>{v.label}</Td>}
                  </tr>
                )
              })}
              <tr className="font-semibold bg-ink/45">
                <td className="px-4 py-3" />
                <td className="px-4 py-3">
                  {num(filtered.length)} {current.title.toUpperCase()}
                </td>
                {isCol('bid') && <Td muted>-</Td>}
                {isCol('spend') && <Td>{money(totals.spend, currency)}</Td>}
                {isCol('sales') && <Td>{num(totals.sales)}</Td>}
                {isCol('pendingSales') && <Td>{num(totals.pending)}</Td>}
                {isCol('revenue') && <Td>{money(totals.revenue, currency)}</Td>}
                {isCol('profit') && <Td cls={totals.profit >= 0 ? 'text-good' : 'text-bad'}>{money(totals.profit, currency)}</Td>}
                {isCol('roas') && <Td>{totals.spend > 0 ? ratio(totals.revenue / totals.spend) : '-'}</Td>}
                {isCol('margin') && <Td>{totals.revenue > 0 ? pct(totals.profit / totals.revenue) : '-'}</Td>}
                {isCol('cpa') && <Td>{totals.sales > 0 ? money(Math.round(totals.spend / totals.sales), currency) : '-'}</Td>}
                {isCol('arpu') && <Td>{totals.visits > 0 ? money(Math.round(totals.revenue / totals.visits), currency) : totals.sales > 0 ? money(Math.round(totals.revenue / totals.sales), currency) : '-'}</Td>}
                {isCol('costPerIc') && <Td>{totals.ic > 0 ? money(Math.round(totals.spend / totals.ic), currency) : '-'}</Td>}
                {isCol('cpc') && <Td>{totals.clicks > 0 ? money(Math.round(totals.spend / totals.clicks), currency) : '-'}</Td>}
                {isCol('ctr') && <Td>{totals.impressions > 0 ? pct(totals.clicks / totals.impressions) : '-'}</Td>}
                {isCol('cpm') && <Td>{totals.impressions > 0 ? money(Math.round((totals.spend / totals.impressions) * 1000), currency) : '-'}</Td>}
                {isCol('impressions') && <Td>{num(totals.impressions)}</Td>}
                {isCol('clicks') && <Td>{num(totals.clicks)}</Td>}
                {isCol('visits') && <Td>{num(totals.visits)}</Td>}
                {isCol('ic') && <Td>{num(totals.ic)}</Td>}
                {isCol('icRate') && <Td>{totals.visits > 0 ? pct(totals.ic / totals.visits) : totals.clicks > 0 ? pct(totals.ic / totals.clicks) : '-'}</Td>}
                {isCol('id') && <Td muted>-</Td>}
                {isCol('campaignId') && <Td muted>-</Td>}
                {isCol('adsetId') && <Td muted>-</Td>}
                {isCol('adId') && <Td muted>-</Td>}
                {isCol('verdict') && <Td muted>-</Td>}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Personalizar Colunas */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false)
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-line bg-[#0d0d2b] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
            <div className="p-5 pb-3">
              <h2 className="text-base font-semibold text-white">Personalizar colunas</h2>
              <p className="text-xs text-muted mt-1">Escolha quais métricas exibir na tabela.</p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-2 divide-y divide-white/5">
              {ALL_COLUMNS.map((col) => {
                const checked = tempColumns.includes(col.key)
                return (
                  <label
                    key={col.key}
                    className="flex items-center gap-3 py-2.5 cursor-pointer select-none hover:bg-white/[0.02] px-1 rounded transition"
                  >
                    {/* Grip handle icon */}
                    <svg className="w-3.5 h-3.5 text-muted/60 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="9" cy="6" r="1.5" />
                      <circle cx="15" cy="6" r="1.5" />
                      <circle cx="9" cy="12" r="1.5" />
                      <circle cx="15" cy="12" r="1.5" />
                      <circle cx="9" cy="18" r="1.5" />
                      <circle cx="15" cy="18" r="1.5" />
                    </svg>

                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleColumnTemp(col.key)}
                      className="w-4 h-4 rounded border-line bg-ink accent-brand shrink-0 cursor-pointer"
                    />

                    <span className={`text-sm ${checked ? 'text-white' : 'text-muted'}`}>{col.label}</span>
                  </label>
                )
              })}
            </div>

            <div className="p-4 border-t border-line bg-ink/40 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-muted hover:text-white rounded-lg border border-line hover:border-brand transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveCustomColumns}
                className="px-5 py-2 text-xs font-semibold text-white bg-brand hover:opacity-90 rounded-lg shadow transition"
              >
                Salvar
              </button>
            </div>
          </div>
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
