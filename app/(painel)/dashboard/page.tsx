'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { money, num, pct, ratio, usePanel } from '../../components/ui'

const DONUT_COLORS = ['#2f80ff', '#47d18c', '#a855f7', '#f59e0b', '#ec4899', '#06b6d4']

export default function DashboardPage() {
  const { dashboardId, from, to, setRange, currency } = usePanel()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedAccount, setSelectedAccount] = useState<string>('all')
  const [activePreset, setActivePreset] = useState<string>('Hoje')
  const [showCustomDate, setShowCustomDate] = useState(false)
  const [editingThresholdId, setEditingThresholdId] = useState<string | null>(null)
  const [thresholdInput, setThresholdInput] = useState<string>('')
  const dataRef = useRef<any>(null)

  useEffect(() => {
    dataRef.current = data
  }, [data])

  const saveThreshold = async (accId: string) => {
    const cleanStr = thresholdInput.replace(/\./g, '').replace(',', '.')
    const numVal = parseFloat(cleanStr)
    const cents = isNaN(numVal) ? 0 : Math.round(numVal * 100)
    try {
      await fetch('/api/integrations/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accId, billingThresholdCents: cents }),
      })
      setEditingThresholdId(null)
      fetchSummary()
    } catch {}
  }

  const fetchSummary = () => {
    if (!dashboardId) return
    const hasData = Boolean(dataRef.current)
    if (!hasData) setLoading(true)

    let url = `/api/metrics/summary?dashboardId=${dashboardId}&from=${from}&to=${to}`
    if (selectedAccount && selectedAccount !== 'all') {
      url += `&accounts=${encodeURIComponent(selectedAccount)}`
    }

    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        setData(j)
      })
      .catch((e) => {
        setData({ error: e?.message || 'Falha ao carregar dashboard.' })
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchSummary()
    const refresh = () => { if (document.visibilityState === 'visible') fetchSummary() }
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    window.addEventListener('scaletrack:meta-sync', fetchSummary)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('scaletrack:meta-sync', fetchSummary)
    }
  }, [dashboardId, from, to, selectedAccount])

  const handlePreset = (label: string, days?: number) => {
    setActivePreset(label)
    if (label === 'Personalizado') {
      setShowCustomDate(true)
      return
    }
    setShowCustomDate(false)
    const end = new Date()
    if (label === 'Hoje') {
      const todayStr = end.toISOString().slice(0, 10)
      setRange(todayStr, todayStr)
    } else if (label === 'Ontem') {
      const yesterday = new Date(end.getTime() - 864e5).toISOString().slice(0, 10)
      setRange(yesterday, yesterday)
    } else if (days) {
      const start = new Date(end.getTime() - (days - 1) * 864e5).toISOString().slice(0, 10)
      setRange(start, end.toISOString().slice(0, 10))
    }
  }

  const exportSummaryCsv = () => {
    if (!data) return
    const rows = [
      ['Métrica', 'Valor'],
      ['Faturamento Líquido', money(data.revenue, currency)],
      ['Faturamento Bruto', money(data.grossRevenue, currency)],
      ['Gasto em Ads', money(data.spend, currency)],
      ['Lucro', money(data.profit, currency)],
      ['ROAS', ratio(data.roas)],
      ['CPA', data.cpa == null ? '—' : money(data.cpa, currency)],
      ['Vendas Aprovadas', String(data.ordersCount?.approved || 0)],
      ['Vendas Pendentes', String(data.ordersCount?.pending || 0)],
      ['Período', `${from} até ${to}`],
    ]
    const csvContent =
      'data:text/csv;charset=utf-8,' + rows.map((e) => e.map((c) => `"${c}"`).join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `dashboard_${from}_${to}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Prepara dados de donut chart
  const donutData = useMemo(() => {
    if (!data?.byPaymentMethod) return []
    return (data.byPaymentMethod as any[])
      .filter((m) => Number(m.sales || 0) > 0)
      .map((m) => ({
        name: formatMethodName(m.method),
        value: Number(m.sales || 0),
        revenue: Number(m.revenue || 0),
      }))
  }, [data?.byPaymentMethod])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-muted space-x-3">
        <svg className="animate-spin h-5 w-5 text-brand" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span>Carregando dados do dashboard...</span>
      </div>
    )
  }

  if (data?.error) {
    return (
      <div className="p-4 rounded-xl border border-bad/30 bg-bad/10 text-bad">
        Erro ao carregar métricas: {data.error}
      </div>
    )
  }

  const o = data.ordersCount || {}
  const totalApprovedSales = Number(o.approved || 0)
  const empty = o.total === 0 && Number(data.spend || 0) === 0
  const arpu = totalApprovedSales > 0 ? Math.round(Number(data.revenue || 0) / totalApprovedSales) : 0
  const totalAccountsBalance = (data.byAdAccount || []).reduce(
    (sum: number, a: any) => sum + (Number(a.balanceCents) || 0),
    0
  )

  return (
    <div className="space-y-6">
      {/* BARRA DE FILTROS SUPERIOR */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-panel/70 border border-line rounded-xl p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: 'Hoje' },
            { label: 'Ontem' },
            { label: '7 dias', days: 7 },
            { label: '15 dias', days: 15 },
            { label: '30 dias', days: 30 },
            { label: 'Personalizado' },
          ].map((preset) => {
            const active = activePreset === preset.label
            return (
              <button
                key={preset.label}
                onClick={() => handlePreset(preset.label, preset.days)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  active
                    ? 'bg-brand text-white shadow-sm'
                    : 'bg-[#0d1c3a] text-muted hover:text-white hover:bg-line/40'
                }`}
              >
                {preset.label}
              </button>
            )
          })}

          {showCustomDate && (
            <div className="flex items-center gap-1.5 ml-2">
              <input
                type="date"
                value={from}
                onChange={(e) => setRange(e.target.value, to)}
                className="bg-[#0c1830] border border-line rounded-lg px-2 py-1 text-xs text-white"
              />
              <span className="text-muted text-xs">até</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setRange(from, e.target.value)}
                className="bg-[#0c1830] border border-line rounded-lg px-2 py-1 text-xs text-white"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Contas */}
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="bg-[#0c1830] border border-line rounded-lg px-3 py-1.5 text-xs text-white shadow-sm focus:outline-none focus:border-brand"
          >
            <option value="all">Todas as contas</option>
            {(data.byAdAccount || []).map((acc: any) => (
              <option key={acc.accountId} value={acc.accountId}>
                {acc.name || acc.accountId}
              </option>
            ))}
          </select>

          {/* Botão Exportar */}
          <button
            onClick={exportSummaryCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-[#0d1c3a] hover:bg-line/40 text-xs font-medium text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Exportar</span>
          </button>
        </div>
      </div>

      {empty && <PrimeiroUso />}

      {/* CARDS SUPERIORES - LINHA 1 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Faturamento */}
        <StatCard
          title="Faturamento"
          value={money(data.revenue, currency)}
          sub={`Bruto ${money(data.grossRevenue, currency)}`}
        />

        {/* Lucro */}
        <StatCard
          title="Lucro"
          value={money(data.profit, currency)}
          valueTone={data.profit >= 0 ? 'good' : 'bad'}
          tag={{
            label: data.profit >= 0 ? '+ Positivo' : '- Negativo',
            tone: data.profit >= 0 ? 'good' : 'bad',
          }}
        />

        {/* Gasto em Ads */}
        <StatCard
          title="Gasto em Ads"
          value={money(data.spend, currency)}
          sub="Meta Ads"
        />

        {/* CPA */}
        <StatCard
          title="CPA"
          value={data.cpa == null ? '—' : money(data.cpa, currency)}
          sub="Custo por venda"
        />

        {/* ARPU */}
        <StatCard
          title="ARPU"
          value={money(arpu, currency)}
          sub="Receita média"
        />

        {/* ROAS */}
        <StatCard
          title="ROAS"
          value={ratio(data.roas)}
          tag={{
            label: Number(data.roas || 0) >= 2 ? 'Escalar' : Number(data.roas || 0) >= 1 ? '↑ OK' : 'Alerta',
            tone: Number(data.roas || 0) >= 1 ? 'good' : 'bad',
          }}
        />
      </div>

      {/* CARDS SECUNDÁRIOS - LINHA 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Vendas Aprovadas */}
        <StatCard
          title="Vendas Aprovadas"
          value={num(o.approved)}
          sub={money(data.revenue, currency)}
        />

        {/* Vendas Pendentes */}
        <StatCard
          title="Vendas Pendentes"
          value={money(data.pendingRevenue, currency)}
          sub={`${num(o.pending)} vendas`}
        />

        {/* Chargeback */}
        <StatCard
          title="Chargeback"
          value={pct(totalApprovedSales > 0 ? Number(o.chargedback || 0) / totalApprovedSales : 0)}
          sub={`${num(o.chargedback)} vendas`}
        />

        {/* Margem */}
        <StatCard
          title="Margem"
          value={pct(data.margin)}
          tag={{
            label: Number(data.margin || 0) >= 0 ? 'Positivo' : 'Negativo',
            tone: Number(data.margin || 0) >= 0 ? 'good' : 'bad',
          }}
        />
      </div>

      {/* CARD SALDO DAS CONTAS */}
      <div className="bg-panel border border-line rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">💰</span>
            <div>
              <h3 className="text-sm font-semibold text-white">Saldo das Contas</h3>
              <p className="text-xs text-muted">Fundos pré-pagos disponíveis e forma de cobrança</p>
            </div>
          </div>
          {totalAccountsBalance > 0 && (
            <div className="text-right">
              <span className="text-xs text-muted">Saldo Pré-pago Total: </span>
              <span className="text-sm font-bold text-good">{money(totalAccountsBalance, currency)}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(data.byAdAccount || []).map((acc: any) => {
            const isPrepaid = Boolean(acc.isPrepay) || (acc.fundingSourceLabel && acc.fundingSourceLabel.includes('Saldo'))
            const bal = Number(acc.balanceCents) || 0
            const isLowBalance = isPrepaid && bal <= 2000 // R$ 20,00 ou menos
            const spendCap = Number(acc.spendCapCents) || 0
            const amountSpent = Number(acc.amountSpentCents) || 0

            return (
              <div
                key={acc.accountId}
                className={`border transition-colors rounded-xl p-4 flex flex-col justify-between ${
                  isLowBalance
                    ? 'bg-[#180d19] border-bad/50 shadow-[0_0_12px_rgba(255,77,61,0.15)]'
                    : 'bg-[#0b172e] border-line/70 hover:border-brand/40'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="truncate">
                      <div className="text-sm font-semibold text-white truncate" title={acc.name}>
                        {acc.name || acc.accountId}
                      </div>
                      <div className="text-[11px] text-muted">ID: {acc.accountId}</div>
                    </div>
                    {isPrepaid ? (
                      <span
                        className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isLowBalance
                            ? 'bg-bad/20 text-bad border border-bad/40 animate-pulse'
                            : 'bg-good/15 text-good border border-good/30'
                        }`}
                      >
                        {isLowBalance ? '⚠️ Saldo Baixo' : 'Pré-pago'}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand/15 text-brand border border-brand/30">
                        Pós-pago (Cartão)
                      </span>
                    )}
                  </div>

                  {isPrepaid ? (
                    /* CONTA PRÉ-PAGA */
                    <div className="mt-3 pt-3 border-t border-line/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted">Saldo Disponível</span>
                        <span className={`text-lg font-bold ${isLowBalance ? 'text-bad' : 'text-good'}`}>
                          {money(bal, acc.currency || currency)}
                        </span>
                      </div>
                      {isLowBalance && (
                        <div className="text-[11px] text-bad bg-bad/10 border border-bad/20 rounded px-2 py-1 font-medium">
                          ⚠️ Saldo em R$ 20 ou menos: recarregue para evitar pausa dos anúncios!
                        </div>
                      )}
                    </div>
                  ) : (
                    /* CONTA PÓS-PAGA (CARTÃO) */
                    <div className="mt-3 pt-3 border-t border-line/40 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted">Saldo a Pagar</span>
                        <span className="text-lg font-bold text-white">
                          {money(bal, acc.currency || currency)}
                        </span>
                      </div>

                      {/* LIMITE DE COBRANÇA (THRESHOLD / QUANDO O SALDO CHEGAR A) */}
                      <div className="bg-[#122347]/60 border border-line/60 rounded-lg p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted">Cobrar quando chegar a:</span>
                          {editingThresholdId === acc.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted">R$</span>
                              <input
                                type="text"
                                autoFocus
                                value={thresholdInput}
                                onChange={(e) => setThresholdInput(e.target.value)}
                                placeholder="415,00"
                                className="w-16 bg-[#0c1830] border border-brand text-xs text-white px-1 py-0.5 rounded focus:outline-none"
                              />
                              <button
                                onClick={() => saveThreshold(acc.id)}
                                className="text-[10px] bg-brand text-white px-1.5 py-0.5 rounded font-medium hover:bg-brand/80"
                              >
                                Salvar
                              </button>
                              <button
                                onClick={() => setEditingThresholdId(null)}
                                className="text-[10px] text-muted hover:text-white px-0.5"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingThresholdId(acc.id)
                                setThresholdInput(
                                  acc.billingThresholdCents > 0
                                    ? (acc.billingThresholdCents / 100).toFixed(2).replace('.', ',')
                                    : ''
                                )
                              }}
                              className="flex items-center gap-1 font-semibold text-good hover:underline transition-colors"
                              title="Clique para editar o limite de cobrança"
                            >
                              <span>
                                {acc.billingThresholdCents > 0
                                  ? money(acc.billingThresholdCents, acc.currency || currency)
                                  : 'Definir (ex: R$ 415)'}
                              </span>
                              <span className="text-muted text-[11px]">✏️</span>
                            </button>
                          )}
                        </div>

                        {acc.billingThresholdCents > 0 && (
                          <div className="space-y-1 pt-0.5">
                            <div className="h-1.5 rounded-full bg-[#0c1830] overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  (bal / acc.billingThresholdCents) >= 0.9
                                    ? 'bg-bad'
                                    : (bal / acc.billingThresholdCents) >= 0.7
                                    ? 'bg-warn'
                                    : 'bg-brand'
                                }`}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.max(4, Math.round((bal / acc.billingThresholdCents) * 100))
                                  )}%`,
                                }}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] text-muted">
                              <span>
                                {((bal / acc.billingThresholdCents) * 100).toFixed(1)}% atingido
                              </span>
                              <span>
                                restam{' '}
                                {money(
                                  Math.max(0, acc.billingThresholdCents - bal),
                                  acc.currency || currency
                                )}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {acc.fundingSourceLabel && (
                  <div className="text-[11px] text-muted mt-3 pt-2 border-t border-line/20 truncate" title={acc.fundingSourceLabel}>
                    💳 {acc.fundingSourceLabel}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* FUNIL DE CONVERSÃO (META ADS) */}
      <div className="bg-panel border border-line rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Funil de Conversão (Meta Ads)</h3>
            <p className="text-xs text-muted">Passo a passo desde o clique até a aprovação da venda</p>
          </div>
        </div>

        {data.funnel ? (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {/* 1. Cliques */}
            <FunnelStep
              stepNumber="1"
              title="Cliques"
              rate={100}
              count={data.funnel.clicks?.count || 0}
              unit="cliques"
              isFirst
            />

            {/* 2. Visitas */}
            <FunnelStep
              stepNumber="2"
              title="Vis. Página"
              rate={data.funnel.pageViews?.rate || 0}
              count={data.funnel.pageViews?.count || 0}
              unit="visitas"
              drop={data.funnel.pageViews?.drop || 0}
            />

            {/* 3. ICs */}
            <FunnelStep
              stepNumber="3"
              title="ICs"
              rate={data.funnel.ics?.rate || 0}
              count={data.funnel.ics?.count || 0}
              unit="checkouts"
              drop={data.funnel.ics?.drop || 0}
            />

            {/* 4. Vendas Iniciadas */}
            <FunnelStep
              stepNumber="4"
              title="Vendas Inic."
              rate={data.funnel.initiatedSales?.rate || 0}
              count={data.funnel.initiatedSales?.count || 0}
              unit="iniciadas"
              drop={data.funnel.initiatedSales?.drop || 0}
            />

            {/* 5. Vendas Aprovadas */}
            <FunnelStep
              stepNumber="5"
              title="Vendas Apr."
              rate={data.funnel.approvedSales?.rate || 0}
              count={data.funnel.approvedSales?.count || 0}
              unit="aprovadas"
              drop={data.funnel.approvedSales?.drop || 0}
              isLast
            />
          </div>
        ) : (
          <p className="text-xs text-muted">Sem dados suficientes para o funil.</p>
        )}
      </div>

      {/* LINHA INFERIOR COM 3 CARDS LADO A LADO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* CARD 1: TAXA DE APROVAÇÃO */}
        <div className="bg-panel border border-line rounded-xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Taxa de Aprovação</h3>
            <p className="text-xs text-muted mb-4">Eficiência de conversão por método de pagamento</p>
            <div className="space-y-3">
              {(data.approvalByMethod || []).map((m: any) => {
                const rate = Number(m.rate || 0)
                const formattedName = formatMethodName(m.method)
                return (
                  <div key={m.method} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-white">{formattedName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted">
                          {m.sales}/{m.total} vendas
                        </span>
                        <span className={`font-semibold ${rate >= 70 ? 'text-good' : rate >= 40 ? 'text-warn' : 'text-bad'}`}>
                          {rate.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-[#0c1830] overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          rate >= 70 ? 'bg-good' : rate >= 40 ? 'bg-warn' : 'bg-bad'
                        }`}
                        style={{ width: `${Math.max(rate, m.total > 0 ? 5 : 0)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* CARD 2: VENDAS POR PAGAMENTO (DONUT CHART) */}
        <div className="bg-panel border border-line rounded-xl p-5 shadow-sm flex flex-col">
          <h3 className="text-sm font-semibold text-white mb-1">Vendas por Pagamento</h3>
          <p className="text-xs text-muted mb-3">Distribuição das compras aprovadas</p>

          <div className="flex-1 flex flex-col items-center justify-center min-h-[220px]">
            {donutData.length > 0 ? (
              <div className="w-full grid grid-cols-1 md:grid-cols-2 items-center gap-2">
                <div className="relative h-44 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={3}
                      >
                        {donutData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: 'var(--panel)',
                          border: '1px solid var(--line)',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(val: any, name: any) => [`${val} vendas`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Total no centro */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-bold text-white">{totalApprovedSales}</span>
                    <span className="text-[10px] text-muted uppercase">Vendas</span>
                  </div>
                </div>

                {/* Legenda com cores e contagem */}
                <div className="space-y-2 text-xs">
                  {donutData.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                        />
                        <span className="text-white truncate">{d.name}</span>
                      </div>
                      <span className="font-semibold text-muted shrink-0">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted py-10 text-center">Nenhuma venda aprovada no período.</p>
            )}
          </div>
        </div>

        {/* CARD 3: VENDAS POR POSICIONAMENTO */}
        <div className="bg-panel border border-line rounded-xl p-5 shadow-sm flex flex-col">
          <h3 className="text-sm font-semibold text-white mb-1">Vendas por Posicionamento</h3>
          <p className="text-xs text-muted mb-4">Performance nos canais e formatos de anúncio</p>

          <div className="space-y-3 flex-1">
            {(data.byPlacement || []).length > 0 ? (
              (data.byPlacement as any[]).map((p: any) => {
                const percent = Number(p.pct || 0)
                return (
                  <div key={p.placement} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-white truncate max-w-[180px]">{p.placement}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-semibold text-white">{p.sales} vendas</span>
                        <span className="text-muted">({percent.toFixed(1)}%)</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-[#0c1830] overflow-hidden">
                      <div
                        className="h-full bg-brand transition-all duration-300"
                        style={{ width: `${Math.max(percent, p.sales > 0 ? 6 : 0)}%` }}
                      />
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-muted py-10 text-center">Nenhum dado de posicionamento no período.</p>
            )}
          </div>
        </div>
      </div>

      {/* GRÁFICOS DE FATURAMENTO POR DIA E POR HORA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Chart title="Faturamento por dia" rows={data.byDay || []} xKey="day" currency={currency} />
        <Chart title="Faturamento por hora" rows={data.byHour || []} xKey="hour" currency={currency} />
      </div>
    </div>
  )
}

/* ---------------- COMPONENTES AUXILIARES ---------------- */

function StatCard({
  title,
  value,
  sub,
  valueTone,
  tag,
}: {
  title: string
  value: string
  sub?: string
  valueTone?: 'good' | 'bad'
  tag?: { label: string; tone: 'good' | 'bad' }
}) {
  const valueColor =
    valueTone === 'good' ? 'text-good' : valueTone === 'bad' ? 'text-bad' : 'text-white'

  return (
    <div className="bg-panel border border-line rounded-xl p-4 flex flex-col justify-between shadow-sm">
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-xs text-muted truncate">{title}</span>
        {tag && (
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
              tag.tone === 'good' ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'
            }`}
          >
            {tag.label}
          </span>
        )}
      </div>
      <div>
        <div className={`text-xl font-bold tracking-tight ${valueColor}`}>{value}</div>
        {sub && <div className="text-[11px] text-muted mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  )
}

function FunnelStep({
  stepNumber,
  title,
  rate,
  count,
  unit,
  drop,
  isFirst,
  isLast,
}: {
  stepNumber: string
  title: string
  rate: number
  count: number
  unit: string
  drop?: number
  isFirst?: boolean
  isLast?: boolean
}) {
  return (
    <div className="bg-[#0b172e] border border-line rounded-xl p-3 flex flex-col justify-between relative overflow-hidden">
      <div>
        <div className="flex items-center justify-between gap-1 mb-2">
          <span className="text-xs font-semibold text-white">{title}</span>
          <span className="text-[10px] text-muted font-mono">#{stepNumber}</span>
        </div>

        {/* Anel ou valor de porcentagem */}
        <div className="text-2xl font-black text-brand tracking-tight">
          {rate.toFixed(1)}%
        </div>

        <div className="text-xs text-muted mt-1">
          {num(count)} {unit}
        </div>
      </div>

      {!isFirst && drop !== undefined && (
        <div className="mt-3 pt-2 border-t border-line/40 flex items-center justify-between text-[11px]">
          <span className="text-muted">Drop da etapa:</span>
          <span className="text-bad font-semibold">-{drop.toFixed(1)}%</span>
        </div>
      )}
    </div>
  )
}

function Chart({
  title,
  rows,
  xKey,
  currency,
}: {
  title: string
  rows: any[]
  xKey: string
  currency: string
}) {
  return (
    <div className="bg-panel border border-line rounded-xl p-4 shadow-sm">
      <div className="text-sm font-semibold text-white mb-3">{title}</div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid stroke="var(--line)" vertical={false} strokeOpacity={0.6} />
            <XAxis dataKey={xKey} stroke="var(--muted)" fontSize={11} />
            <YAxis
              stroke="var(--muted)"
              fontSize={11}
              tickFormatter={(v) => String(Math.round(v / 100))}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: 8,
              }}
              formatter={(v: any) => money(v, currency)}
            />
            <Bar dataKey="revenue" fill="var(--brand)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function PrimeiroUso() {
  return (
    <div className="border border-brand/40 bg-brand/5 rounded-xl p-5">
      <div className="font-medium mb-2">Nenhum dado ainda — faltam passos simples</div>
      <ol className="text-sm text-muted space-y-1.5 list-decimal list-inside">
        <li>Cole o script do pixel na sua página de vendas</li>
        <li>Configure as UTMs no anúncio da Meta</li>
        <li>Aponte o webhook do gateway de pagamento</li>
      </ol>
      <Link href="/integracoes" className="inline-block mt-3 text-sm text-brand hover:underline">
        Ir para Integrações
      </Link>
    </div>
  )
}

function formatMethodName(method: string) {
  if (!method) return 'Outro'
  const m = method.toLowerCase()
  if (m === 'cartão' || m === 'credit_card') return 'Cartão'
  if (m === 'mercado_pago') return 'Mercado Pago'
  if (m === 'paypal') return 'PayPal'
  if (m === 'bank_transfer') return 'Bank Transfer / Boleto'
  if (m === 'pix' || m === 'cashpayment') return 'Pix'
  return method.charAt(0).toUpperCase() + method.slice(1)
}
