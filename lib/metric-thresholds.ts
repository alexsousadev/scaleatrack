export type MetricKey = 'ctr' | 'cpc' | 'connect' | 'icRate' | 'conversion' | 'roas'
export type MetricBand = 'ideal' | 'attention' | 'bad'
export type MetricFilter = { metric: MetricKey | ''; band: MetricBand | '' }
export const BAND_LABELS = { ideal: 'Ideal', attention: 'Atenção', bad: 'Ruim' }
export const BAND_CLASSES = { ideal: 'text-good', attention: 'text-warn', bad: 'text-bad' }
export const METRIC_RULES: { key: MetricKey; label: string; ideal: number; bad: number; lower?: boolean; ranges: string[]; formula: string }[] = [
  { key: 'ctr', label: 'CTR', ideal: .015, bad: .008, ranges: ['≥ 1,5%', '≥ 0,8% e < 1,5%', '< 0,8%'], formula: 'Cliques ÷ impressões' },
  { key: 'cpc', label: 'CPC', ideal: 80, bad: 150, lower: true, ranges: ['< 0,80', '0,80 a 1,50', '> 1,50'], formula: 'Gasto ÷ cliques, na moeda do painel' },
  { key: 'connect', label: 'Connect', ideal: .8, bad: .7, ranges: ['≥ 80%', '≥ 70% e < 80%', '< 70%'], formula: 'Visitas ÷ cliques' },
  { key: 'icRate', label: 'IC.Check', ideal: .15, bad: .1, ranges: ['≥ 15%', '≥ 10% e < 15%', '< 10%'], formula: 'Checkouts iniciados ÷ visitas' },
  { key: 'conversion', label: 'Conv.', ideal: .3, bad: .2, ranges: ['≥ 30%', '≥ 20% e < 30%', '< 20%'], formula: 'Vendas aprovadas ÷ checkouts iniciados' },
  { key: 'roas', label: 'ROAS', ideal: 1.5, bad: 1, ranges: ['≥ 1,5×', '≥ 1× e < 1,5×', '< 1×'], formula: 'Receita ÷ gasto em anúncios' },
]
export function metricBand(key: MetricKey, value: number | null | undefined): MetricBand | null {
  if (value == null || !Number.isFinite(value)) return null
  const rule = METRIC_RULES.find((r) => r.key === key)!
  return rule.lower
    ? value < rule.ideal ? 'ideal' : value <= rule.bad ? 'attention' : 'bad'
    : value >= rule.ideal ? 'ideal' : value >= rule.bad ? 'attention' : 'bad'
}
export function metricClass(key: MetricKey, value: number | null | undefined) {
  const band = metricBand(key, value)
  return band ? BAND_CLASSES[band] : 'text-muted'
}
export function metricValue(row: any, key: MetricKey): number | null {
  const divide = (a: unknown, b: unknown) => Number(b) > 0 && a != null ? Number(a) / Number(b) : null
  switch (key) {
    case 'connect': return divide(row.visits, row.clicks)
    case 'icRate': return divide(row.ic, row.visits)
    case 'conversion': return divide(row.approvedOrders, row.ic)
    default: return row[key] == null ? null : Number(row[key])
  }
}
export function matchesMetricFilter(row: any, filter: MetricFilter) {
  if (!filter.band) return true
  const rules = filter.metric ? METRIC_RULES.filter((r) => r.key === filter.metric) : METRIC_RULES
  return rules.some((r) => metricBand(r.key, metricValue(row, r.key)) === filter.band)
}
