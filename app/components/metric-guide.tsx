'use client'

import Link from 'next/link'
import { useState } from 'react'
import { money, pct } from './ui'
import { metricClass, metricValue, BAND_CLASSES, BAND_LABELS, METRIC_RULES, type MetricFilter } from '../../lib/metric-thresholds'

export default function MetricGuide({ onApply, current, currency = 'BRL' }: { onApply?: (filter: MetricFilter) => void; current?: any; currency?: string }) {
  const [metric, setMetric] = useState<MetricFilter['metric']>('')
  const [band, setBand] = useState<MetricFilter['band']>('')
  const [applied, setApplied] = useState(false)
  return (
    <details className="rounded-xl border border-line bg-panel">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">Métricas: ideal x ruim{applied ? ' · Filtro aplicado' : ''}</summary>
      <div className="space-y-4 px-4 pb-4">
        <p className="text-xs text-muted">Limites fixos para o período selecionado. Sem dados suficientes, a métrica fica neutra.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] text-left text-xs">
            <thead><tr className="border-b border-line"><th className="py-2">Métrica</th>{current && <th className="py-2">Atual</th>}{(['ideal', 'attention', 'bad'] as const).map((b) => <th key={b} className={`py-2 ${BAND_CLASSES[b]}`}>{BAND_LABELS[b]}</th>)}</tr></thead>
            <tbody>{METRIC_RULES.map((r) => <tr key={r.key} className="border-b border-line"><th className="py-2 pr-3 font-medium" title={r.formula}>{r.label}<span className="mt-1 block font-normal text-muted">{r.formula}</span></th>{current && <td className={`py-2 pr-3 font-semibold ${metricClass(r.key, metricValue(current, r.key))}`}>{metricValue(current, r.key) == null ? 'Sem dados' : r.key === 'cpc' ? money(metricValue(current, r.key), currency) : r.key === 'roas' ? `${metricValue(current, r.key)!.toFixed(2)}×` : pct(metricValue(current, r.key))}</td>}{r.ranges.map((v, i) => <td key={v} className={`py-2 pr-3 ${BAND_CLASSES[(['ideal', 'attention', 'bad'] as const)[i]]}`}>{v}</td>)}</tr>)}</tbody>
          </table>
        </div>
        {onApply ? <form onSubmit={(e) => { e.preventDefault(); onApply({ metric, band }); setApplied(Boolean(band)) }} className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs"><span className="block text-muted">Métrica</span><select value={metric} onChange={(e) => setMetric(e.target.value as MetricFilter['metric'])} className="rounded-lg border border-line bg-ink px-3 py-2"><option value="">Qualquer métrica</option>{METRIC_RULES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></label>
          <label className="space-y-1 text-xs"><span className="block text-muted">Faixa</span><select value={band} onChange={(e) => setBand(e.target.value as MetricFilter['band'])} className="rounded-lg border border-line bg-ink px-3 py-2"><option value="">Todas as faixas</option>{Object.entries(BAND_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <button className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white">Aplicar filtros</button>
          <button type="button" onClick={() => { setMetric(''); setBand(''); setApplied(false); onApply({ metric: '', band: '' }) }} className="rounded-lg border border-line px-4 py-2 text-xs">Limpar filtro de métricas</button>
          <p className="w-full text-xs text-muted">“Qualquer métrica” inclui a linha se ao menos uma métrica estiver na faixa escolhida. Os outros filtros continuam ativos.</p>
        </form> : <Link href="/anuncios" className="inline-block rounded-lg border border-line px-4 py-2 text-xs hover:border-brand">Filtrar campanhas por estas métricas</Link>}
      </div>
    </details>
  )
}
