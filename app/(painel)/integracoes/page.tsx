'use client'

import { useEffect, useState } from 'react'
import { usePanel } from '../../components/ui'

const URL_TEMPLATE =
  'utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}'

const TABS = [
  ['facebook', 'Facebook Ads'],
  ['pixels', 'Pixel de Rastreio'],
  ['utms', 'UTMs'],
  ['webhook-api', 'Webhook API'],
  ['app', 'Baixe nosso App'],
  ['duvidas', 'Duvidas'],
] as const

type TabId = (typeof TABS)[number][0]

export default function IntegracoesPage() {
  const { dashboardId } = usePanel()
  const [tab, setTab] = useState<TabId>('facebook')

  if (!dashboardId) return <p className="text-muted">Carregando...</p>

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">Integracoes</h1>
        <p className="text-muted text-sm mt-2">Conecte suas contas de anuncios e configure o rastreamento</p>
      </div>

      <div className="border-b border-line flex gap-8 overflow-x-auto">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`shrink-0 px-5 py-4 text-sm border-b-2 ${tab === id ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'facebook' && <FacebookTab dashboardId={dashboardId} />}
      {tab === 'pixels' && <PixelsTab dashboardId={dashboardId} />}
      {tab === 'utms' && <UtmsTab />}
      {tab === 'webhook-api' && <WebhookApiTab dashboardId={dashboardId} />}
      {tab === 'app' && <AppTab />}
      {tab === 'duvidas' && <FaqTab />}
    </div>
  )
}

function Panel({ title, actions, children, footer }: { title: string; actions?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-[#151244] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-line">
        <h2 className="font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
      {footer && <div className="border-t border-line px-6 py-4 text-xs text-muted">{footer}</div>}
    </section>
  )
}

function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1400)
      }}
      className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold hover:border-brand"
    >
      {done ? 'Copiado' : label}
    </button>
  )
}

function Badge({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${muted ? 'bg-ink text-muted border border-line' : 'bg-brand text-white'}`}>{children}</span>
}

function FacebookTab({ dashboardId }: { dashboardId: string }) {
  const [accounts, setAccounts] = useState<any[]>([])
  const [token, setToken] = useState('')
  const [name, setName] = useState('')
  const [modal, setModal] = useState(false)
  const [msg, setMsg] = useState('')

  const load = () =>
    fetch(`/api/integrations/accounts?dashboardId=${dashboardId}`)
      .then((r) => r.json())
      .then((j) => setAccounts(j.accounts || []))

  useEffect(() => {
    load()
    window.addEventListener('scaletrack:meta-sync', load)
    return () => window.removeEventListener('scaletrack:meta-sync', load)
  }, [dashboardId])

  async function connect() {
    setMsg('Conectando...')
    const res = await fetch('/api/integrations/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardId, accessToken: token || undefined, profileName: name || undefined }),
    })
    const j = await res.json()
    if (j.error) {
      setMsg(j.error)
    } else {
      const d = j.diagnostics
      const businessText = d
        ? ` Meta retornou ${d.businesses?.length || 0} BM(s), ${d.directCount || 0} direta(s), ${d.ownedCount || 0} owned e ${d.clientCount || 0} client.`
        : ''
      const warnText = d?.warnings?.length ? ` Avisos: ${d.warnings.join(' | ')}` : ''
      setMsg(`${j.imported} conta(s) importada(s).${businessText}${warnText}`)
    }
    if (!j.error) {
      setToken('')
      setName('')
      load()
    }
  }

  async function toggle(id: string, enabled: boolean) {
    await fetch('/api/integrations/accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled }),
    })
    load()
  }

  const active = accounts.filter((a) => a.enabled).length
  const metaActive = (status: unknown) => Number(status) === 1 || status == null

  return (
    <div className="space-y-6">
      <Panel
        title="Perfil Conectado"
        actions={
          <div className="flex gap-2">
            <button className="rounded-md border border-[#ff2b62] bg-[#ff0044]/20 px-3 py-1.5 text-xs font-semibold text-white">Tutorial</button>
            <button onClick={() => setModal(true)} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold hover:border-brand">+ Adicionar Facebook</button>
            <button onClick={load} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold hover:border-brand">Reconectar</button>
          </div>
        }
      >
        <div className="flex items-center gap-4 px-6 py-8">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-brand font-bold">A</div>
          <div>
            <div className="font-semibold">Perfil Meta Ads</div>
            <div className="text-xs text-muted">
              {accounts.length} conta(s) de anuncio importada(s)
              {accounts.some((a) => a.business_name) ? ` - ${new Set(accounts.map((a) => a.business_id).filter(Boolean)).size} BM(s)` : ''}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Badge>{accounts.length ? 'Conectado' : 'Aguardando'}</Badge>
            <button onClick={() => setModal(true)} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-bad hover:border-bad">Desconectar</button>
          </div>
        </div>
      </Panel>

      <Panel title={`Contas de Anuncio (${accounts.length})`} footer={`${active} conta(s) ativa(s) neste dashboard de ${accounts.length} disponiveis`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase text-muted">
                <th className="px-5 py-4">Conta</th>
                <th className="px-5 py-4">ID</th>
                <th className="px-5 py-4">BM</th>
                <th className="px-5 py-4">Moeda</th>
                <th className="px-5 py-4">Status Meta</th>
                <th className="px-5 py-4">Sincronizacao</th>
                <th className="px-5 py-4">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted">Nenhuma conta importada.</td></tr>
              )}
              {accounts.map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="px-5 py-4 font-semibold">{a.name || a.account_id}</td>
                  <td className="px-5 py-4 font-mono text-xs">{a.account_id}</td>
                  <td className="px-5 py-4">{a.business_name || a.profile_name || '-'}</td>
                  <td className="px-5 py-4">{a.currency}</td>
                  <td className="px-5 py-4"><Badge muted={!metaActive(a.account_status)}>{metaActive(a.account_status) ? 'Ativa' : `Status ${a.account_status}`}</Badge></td>
                  <td className="px-5 py-4"><Badge muted={!a.enabled}>{a.enabled ? '• Ativa' : 'o Inativa'}</Badge></td>
                  <td className="px-5 py-4">
                    <button onClick={() => toggle(a.id, !a.enabled)} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold hover:border-brand">
                      {a.enabled ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {modal && (
        <Modal title="Conectar Facebook Ads" onClose={() => setModal(false)}>
          <Field label="NOME DO PERFIL">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Alexandre Sousa"
                   className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm" />
          </Field>
          <Field label="ACCESS TOKEN META">
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAxxxxxxxx..."
                   className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm" type="password" />
          </Field>
          {msg && <p className="text-xs text-muted">{msg}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setModal(false)} className="rounded-md border border-line px-5 py-2 text-sm">Cancelar</button>
            <button onClick={connect} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white">Importar contas</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function PixelsTab({ dashboardId }: { dashboardId: string }) {
  const [pixels, setPixels] = useState<any[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [msg, setMsg] = useState('')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const emptyForm = {
    name: 'Meta Pixel',
    platformPixelId: '',
    capiToken: '',
    testCode: '',
    sendPurchaseType: 'paid_sales_only',
    sendValueType: 'commission',
    sendIpRule: 'ipv6_fallback_ipv4',
    sendInitiateCheckout: true,
    icDetectionType: 'button_url_match',
    icDetectionValue: 'checkout',
    sendLead: false,
    leadDetectionValue: '',
    sendAddToCart: false,
    atcDetectionType: 'button_text_match',
    atcDetectionValue: '',
    allowedDomain: '',
  }
  const [form, setForm] = useState(emptyForm)

  const load = () =>
    fetch(`/api/integrations/pixels?dashboardId=${dashboardId}`)
      .then((r) => r.json())
      .then((j) => setPixels(j.pixels || []))

  useEffect(() => {
    load()
  }, [dashboardId])

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setMsg('')
    setModalOpen(true)
  }

  function openEdit(pixel: any) {
    const target = pixel.targets?.[0] || {}
    setEditing(pixel)
    setForm({
      ...emptyForm,
      name: pixel.name || 'Meta Pixel',
      platformPixelId: target.platform_pixel_id || '',
      testCode: target.test_code || '',
      sendPurchaseType: pixel.send_purchase_type || 'paid_sales_only',
      sendValueType: pixel.send_value_type || 'commission',
      sendIpRule: pixel.send_ip_rule || 'ipv6_fallback_ipv4',
      sendInitiateCheckout: !!pixel.send_initiate_checkout,
      icDetectionType: pixel.ic_detection_type || 'button_url_match',
      icDetectionValue: pixel.ic_detection_value || '',
      sendLead: !!pixel.send_lead,
      leadDetectionValue: pixel.lead_detection_value || '',
      sendAddToCart: !!pixel.send_add_to_cart,
      atcDetectionType: pixel.atc_detection_type || 'button_text_match',
      atcDetectionValue: pixel.atc_detection_value || '',
      allowedDomain: pixel.allowed_domain || '',
    })
    setMsg('')
    setModalOpen(true)
  }

  async function save() {
    if (!form.platformPixelId.trim()) return setMsg('Informe o ID do pixel.')
    const res = await fetch('/api/integrations/pixels', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editing?.id,
        dashboardId,
        name: form.name,
        sendPurchaseType: form.sendPurchaseType,
        sendValueType: form.sendValueType,
        sendIpRule: form.sendIpRule,
        sendInitiateCheckout: form.sendInitiateCheckout,
        icDetectionType: form.icDetectionType,
        icDetectionValue: form.icDetectionValue || null,
        sendLead: form.sendLead,
        leadDetectionValue: form.leadDetectionValue || null,
        sendAddToCart: form.sendAddToCart,
        atcDetectionType: form.atcDetectionType,
        atcDetectionValue: form.atcDetectionValue || null,
        allowedDomain: form.allowedDomain || null,
        targets: [{ id: editing?.targets?.[0]?.id, platformPixelId: form.platformPixelId, name: form.name, capiToken: form.capiToken || null, testCode: form.testCode || null }],
      }),
    })
    const j = await res.json()
    if (!res.ok || j.error) return setMsg(j.error || 'nao foi possivel salvar')
    setModalOpen(false)
    await load()
  }

  async function toggle(id: string, enabled: boolean) {
    await fetch('/api/integrations/pixels', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, enabled }) })
    load()
  }

  async function remove(id: string) {
    await fetch(`/api/integrations/pixels?id=${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div>
      <Panel
        title={`Pixels de Rastreio (${pixels.length}/5)`}
        actions={<div className="flex gap-2"><button className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold">Tutorial</button><button onClick={openNew} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">+ Novo Pixel</button></div>}
      >
        {pixels.length === 0 ? (
          <div className="px-6 py-12 text-center text-muted">Nenhum pixel cadastrado ainda.</div>
        ) : (
          <div className="divide-y divide-line">
            {pixels.map((p) => (
              <PixelCard
                key={p.id}
                pixel={p}
                dashboardId={dashboardId}
                snippet={`<script src="${origin}/t.js" data-id="${dashboardId}" defer></script>`}
                onToggle={(enabled) => toggle(p.id, enabled)}
                onEdit={() => openEdit(p)}
                onRemove={() => remove(p.id)}
              />
            ))}
          </div>
        )}
      </Panel>

      {modalOpen && (
        <Modal title={editing ? 'Editar Pixel de Rastreio' : 'Novo Pixel de Rastreio'} onClose={() => setModalOpen(false)}>
          <Field label="NOME DO PIXEL"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm" placeholder="Ex: Pixel Produto X" /></Field>
          <Field label="PIXEL ID *" hint="Gerenciador de Eventos -> Fontes de Dados -> ID do Pixel"><input value={form.platformPixelId} onChange={(e) => setForm({ ...form, platformPixelId: e.target.value })} className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm" placeholder="Ex: 123456789012345" /></Field>
          <Field label="TOKEN CAPI" hint="Gerenciador de Eventos -> Configuracoes -> Gerar Token de Acesso"><input value={form.capiToken} onChange={(e) => setForm({ ...form, capiToken: e.target.value })} className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm" placeholder={editing ? 'Deixe vazio para manter o token atual' : 'EAAxxxxxxxx...'} type="password" /></Field>
          <div className="grid grid-cols-[1fr_.95fr] gap-3">
            <Field label="REGRA DE DETECCAO IC">
              <select
                value={form.icDetectionType}
                onChange={(e) => setForm({ ...form, icDetectionType: e.target.value, sendInitiateCheckout: true })}
                className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm"
              >
                <option value="button_url_match">Contem URL</option>
                <option value="button_text_match">Contem texto</option>
                <option value="button_css_match">Seletor CSS</option>
              </select>
            </Field>

            <Field label="VALOR DA REGRA" hint="Selecione um gateway ou escolha Outro para digitar.">
              {form.icDetectionType === 'button_url_match' ? (
                <div className="space-y-2">
                  <select
                    value={
                      ['pay.hotmart.com', 'checkout.wiapay.com.br', 'checkout.lowify.com.br', 'checkout'].includes(
                        form.icDetectionValue || ''
                      )
                        ? form.icDetectionValue
                        : 'outro'
                    }
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === 'outro') {
                        setForm({ ...form, icDetectionValue: '', sendInitiateCheckout: true })
                      } else {
                        setForm({ ...form, icDetectionValue: val, sendInitiateCheckout: true })
                      }
                    }}
                    className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm"
                  >
                    <option value="pay.hotmart.com">Hotmart (pay.hotmart.com)</option>
                    <option value="checkout.wiapay.com.br">Wiapay (wiapay)</option>
                    <option value="checkout.lowify.com.br">Lowify (lowify)</option>
                    <option value="checkout">Genérico (checkout)</option>
                    <option value="outro">Outro (digitar manual)...</option>
                  </select>

                  {(!['pay.hotmart.com', 'checkout.wiapay.com.br', 'checkout.lowify.com.br', 'checkout'].includes(
                    form.icDetectionValue || ''
                  ) ||
                    form.icDetectionValue === '') && (
                    <input
                      value={form.icDetectionValue}
                      onChange={(e) => setForm({ ...form, icDetectionValue: e.target.value, sendInitiateCheckout: true })}
                      className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm"
                      placeholder="Ex: pay.seugateway.com"
                      autoFocus
                    />
                  )}
                </div>
              ) : (
                <input
                  value={form.icDetectionValue}
                  onChange={(e) => setForm({ ...form, icDetectionValue: e.target.value, sendInitiateCheckout: true })}
                  className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm"
                  placeholder="Ex: Comprar Agora ou #btn-checkout"
                />
              )}
            </Field>
          </div>
          <Field label="DOMINIOS AUTORIZADOS (OPCIONAL)" hint="1 por linha. Vazio aceita qualquer lugar. Use dominio ou URL completa."><textarea value={form.allowedDomain} onChange={(e) => setForm({ ...form, allowedDomain: e.target.value })} className="w-full min-h-[66px] rounded-md border border-line bg-ink px-3 py-2 text-sm" placeholder={'meusite.com.br\nmeusite.com.br/p/123/produto-x'} /></Field>
          <details className="rounded-md border border-line bg-ink/35 p-3"><summary className="cursor-pointer text-xs font-semibold text-muted">Opcoes avancadas</summary><div className="mt-3 grid gap-2"><select value={form.sendPurchaseType} onChange={(e) => setForm({ ...form, sendPurchaseType: e.target.value })} className="rounded-md border border-line bg-ink px-3 py-2 text-sm"><option value="paid_sales_only">Purchase so vendas pagas</option><option value="paid_and_pending_sales">Purchase pagas e pendentes</option></select><select value={form.sendValueType} onChange={(e) => setForm({ ...form, sendValueType: e.target.value })} className="rounded-md border border-line bg-ink px-3 py-2 text-sm"><option value="commission">Valor: comissao</option><option value="gross">Valor: bruto</option><option value="no_value">Sem valor</option></select><input value={form.testCode} onChange={(e) => setForm({ ...form, testCode: e.target.value })} className="rounded-md border border-line bg-ink px-3 py-2 text-sm" placeholder="Codigo de teste" /></div></details>
          {msg && <p className="text-xs text-bad">{msg}</p>}
          <div className="flex justify-end gap-2"><button onClick={() => setModalOpen(false)} className="rounded-md border border-line px-5 py-2 text-sm">Cancelar</button><button onClick={save} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white">{editing ? 'Salvar' : 'Criar Pixel'}</button></div>
        </Modal>
      )}
    </div>
  )
}

function PixelCard({ pixel, dashboardId, snippet, onToggle, onEdit, onRemove }: { pixel: any; dashboardId: string; snippet: string; onToggle: (enabled: boolean) => void; onEdit: () => void; onRemove: () => void }) {
  const target = pixel.targets?.[0] || {}
  const [testing, setTesting] = useState(false)
  const ruleLabel = pixel.ic_detection_type === 'button_text_match' ? 'Texto' : pixel.ic_detection_type === 'button_css_match' ? 'CSS' : 'URL'
  const createdAt = pixel.created_at ? new Intl.DateTimeFormat('pt-BR').format(new Date(pixel.created_at)) : '-'
  return (
    <div className="space-y-5 px-6 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge muted={!pixel.enabled}>{pixel.enabled ? 'Ativo' : 'Inativo'}</Badge>
        <h3 className="font-semibold">{pixel.name}</h3>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={async () => { setTesting(true); await fetch('/api/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dashboardId, type: 'initiate_checkout', eventId: `test-${Date.now()}`, url: window.location.href }) }).catch(() => {}); setTimeout(() => setTesting(false), 1200) }} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold">{testing ? 'Enviado' : 'Testar'}</button>
          <button onClick={onEdit} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold">Editar</button>
          <button onClick={() => onToggle(!pixel.enabled)} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold">{pixel.enabled ? 'Desativar' : 'Ativar'}</button>
          <button onClick={onRemove} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-bad">Excluir</button>
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Info label="Pixel ID" value={target.platform_pixel_id || '-'} />
        <Info label="Token CAPI" value={target.capi_token_suffix ? `••••••${target.capi_token_suffix}` : '-'} />
        <div><div className="mb-2 text-xs text-muted">Regra de IC</div><div className="flex items-center gap-2 text-sm"><Badge>{ruleLabel}</Badge><span>{pixel.ic_detection_value || '-'}</span></div></div>
        <Info label="Criado em" value={createdAt} />
      </div>
      <div><div className="mb-2 text-xs text-muted">Instale no &lt;head&gt; do seu site:</div><div className="relative rounded-md border border-[#111b3d] bg-[#030715] p-4 pr-20"><code className="block break-all text-xs text-white/90">{snippet}</code><span className="absolute right-3 top-3"><CopyButton text={snippet} /></span></div></div>
      <div className="rounded-md border border-brand/20 bg-blue-50 px-4 py-3 text-xs text-[#241287]"><b>Dica:</b> nosso pixel captura automaticamente os parametros da URL e repassa para todos os links da pagina, inclusive o checkout.</div>
    </div>
  )
}

function UtmsTab() {
  const rows = [
    ['utm_source', 'FB', 'Identifica que o trafego vem do Facebook'],
    ['utm_campaign', '{{campaign.name}}|{{campaign.id}}', 'Nome e ID da campanha'],
    ['utm_medium', '{{adset.name}}|{{adset.id}}', 'Nome e ID do conjunto de anuncios'],
    ['utm_content', '{{ad.name}}|{{ad.id}}', 'Nome e ID do anuncio'],
    ['utm_term', '{{placement}}', 'Posicionamento'],
  ]
  return (
    <Panel title="UTMs para Facebook Ads" actions={<button className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold">Tutorial</button>}>
      <div className="space-y-7 px-6 py-6">
        <div><h3 className="font-semibold">O que sao UTMs?</h3><p className="mt-3 text-sm text-muted">UTMs sao parametros adicionados a URL do anuncio que permitem identificar exatamente de qual campanha, conjunto e anuncio veio cada clique e venda.</p></div>
        <div><h3 className="font-semibold">Como configurar</h3><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted"><li>No Gerenciador de Anuncios, edite ou crie um anuncio</li><li>Role ate a secao Rastreamento</li><li>No campo Parametros de URL, cole o valor abaixo</li><li>Publique normalmente</li></ol></div>
        <div><h3 className="font-semibold">Parametros de URL</h3><div className="mt-3 flex items-center gap-2 rounded-md border border-line bg-[#100e35] p-3"><code className="flex-1 break-all text-xs">{URL_TEMPLATE}</code><CopyButton text={URL_TEMPLATE} /></div></div>
        <div className="rounded-md border border-line p-5"><h3 className="font-semibold">Entenda cada parametro</h3><table className="mt-5 w-full text-sm"><thead><tr className="text-left text-[11px] uppercase text-muted"><th className="py-3">Parametro</th><th>Valor</th><th>O que captura</th></tr></thead><tbody>{rows.map((r) => <tr key={r[0]} className="border-t border-line"><td className="py-4 font-mono">{r[0]}</td><td className="font-mono">{r[1]}</td><td>{r[2]}</td></tr>)}</tbody></table></div>
        <div className="border-l-2 border-brand bg-brand/15 px-4 py-3 text-sm"><b>Importante:</b> os valores entre {'{{ }}'} sao macros dinamicas do Facebook. Nao altere os nomes dentro das chaves.</div>
      </div>
    </Panel>
  )
}

function WebhookApiTab({ dashboardId }: { dashboardId: string }) {
  const [tokens, setTokens] = useState<any[]>([])
  const [webhooks, setWebhooks] = useState<any[]>([])
  const [tokenModal, setTokenModal] = useState(false)
  const [webhookModal, setWebhookModal] = useState(false)
  const [created, setCreated] = useState('')
  const [tokenError, setTokenError] = useState('')
  const [createdWebhook, setCreatedWebhook] = useState<any | null>(null)
  const [name, setName] = useState('')
  const [platform, setPlatform] = useState('API')
  const [webhookName, setWebhookName] = useState('')
  const [webhookPlatform, setWebhookPlatform] = useState('hotmart')
  const [webhookSecret, setWebhookSecret] = useState('')

  const load = () => {
    fetch(`/api/integrations/api-tokens?dashboardId=${dashboardId}`).then((r) => r.json()).then((j) => setTokens(j.tokens || []))
    fetch(`/api/integrations/webhooks?dashboardId=${dashboardId}`).then((r) => r.json()).then((j) => setWebhooks(j.webhooks || []))
  }
  useEffect(() => { load() }, [dashboardId])

  async function createToken() {
    setTokenError('')
    try {
    const res = await fetch('/api/integrations/api-tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dashboardId, name, platform }) })
    const j = await res.json()
    if (!res.ok) { setTokenError(j.error || 'Não foi possível gerar a URL.'); return }
    if (j.url) setCreated(j.url)
    setTokenModal(false)
    setName('')
    load()
    } catch {
      setTokenError('Não foi possível conectar ao servidor. Tente novamente.')
    }
  }

  async function createWebhook() {
    const res = await fetch('/api/integrations/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardId, name: webhookName, platform: webhookPlatform, secret: webhookSecret }),
    })
    const j = await res.json()
    if (j.integrationUrls) setCreatedWebhook(j)
    setWebhookModal(false)
    setWebhookName('')
    setWebhookSecret('')
    load()
  }

  async function deleteToken(id: string) {
    await fetch(`/api/integrations/api-tokens?id=${id}`, { method: 'DELETE' })
    load()
  }

  async function deleteWebhook(id: string) {
    await fetch(`/api/integrations/webhooks?id=${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-6">
      <Panel title="Webhook API" actions={<button className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold">Documentacao</button>}>
        <p className="px-6 py-6 text-sm text-muted">Gere uma URL e cole no campo “URL para enviar (POST)” da plataforma. O campo “Token para autenticação” pode ficar vazio. Para Hotmart, Kirvano e Cakto, use os webhooks específicos abaixo.</p>
      </Panel>
      <Panel title={`URLs de integração (${tokens.length}/5)`} actions={<button onClick={() => setTokenModal(true)} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold">+ Gerar URL</button>}>
        {created && <div className="bg-brand/20 px-6 py-4 text-xs"><b>Cole esta URL no campo “URL para enviar (POST)”. Deixe o token de autenticação vazio.</b><div className="mt-3 flex rounded-md bg-ink p-3"><code className="flex-1 break-all">{created}</code><CopyButton text={created} /></div></div>}
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr className="text-left text-[11px] uppercase text-muted"><th className="px-5 py-4">Nome</th><th>Plataforma</th><th>URL para enviar (POST)</th><th>Status</th><th>Ultimo uso</th><th>Criado em</th><th>Acoes</th></tr></thead><tbody>{tokens.map((t) => <tr key={t.id} className="border-t border-line"><td className="px-5 py-4 font-semibold">{t.name}</td><td>{t.platform}</td><td className="max-w-md py-3 pr-4"><code className="block break-all text-xs">{t.url}</code><div className="mt-2"><CopyButton text={t.url} label="Copiar URL" /></div></td><td><Badge>Ativo</Badge></td><td>{t.last_used_at || '-'}</td><td>{formatDate(t.created_at)}</td><td><button onClick={() => deleteToken(t.id)} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-bad">Excluir</button></td></tr>)}</tbody></table></div>
      </Panel>
      <Panel title={`Webhooks de plataforma (${webhooks.length})`} actions={<button onClick={() => setWebhookModal(true)} className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white">+ Novo Webhook</button>}>
        {createdWebhook && <WebhookUrlNotice webhook={createdWebhook} />}
        <div className="divide-y divide-line">{webhooks.length === 0 && <p className="px-6 py-8 text-center text-muted">Nenhum webhook criado.</p>}{webhooks.map((w) => <div key={w.id} className="px-6 py-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="font-semibold">{w.name} <span className="text-muted">- {platformLabel(w.platform)}</span></div><button onClick={() => deleteWebhook(w.id)} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-bad">Excluir</button></div>{w.integrationUrls?.map((u: any) => <div key={u.url} className="mt-3"><div className="mb-2 text-[11px] font-semibold uppercase text-muted">{u.title}</div><div className="flex rounded-md border border-line bg-ink p-3"><code className="flex-1 break-all text-xs">{u.url}</code><CopyButton text={u.url} /></div></div>)}</div>)}</div>
      </Panel>
      {tokenModal && <Modal title="Gerar URL de integração" onClose={() => setTokenModal(false)}>{tokenError && <p role="alert" className="text-sm text-bad">{tokenError}</p>}<Field label="NOME DA INTEGRAÇÃO"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm" placeholder="Ex: Hotmart" /></Field><Field label="PLATAFORMA"><input value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm" placeholder="Ex: Hotmart" /></Field><div className="flex justify-end gap-2"><button onClick={() => setTokenModal(false)} className="rounded-md border border-line px-5 py-2 text-sm">Cancelar</button><button onClick={createToken} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white">Gerar URL</button></div></Modal>}
      {webhookModal && <Modal title="Novo Webhook" onClose={() => setWebhookModal(false)}><Field label="NOME"><input value={webhookName} onChange={(e) => setWebhookName(e.target.value)} className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm" placeholder="Ex: Lowify principal" /></Field><Field label="PLATAFORMA"><select value={webhookPlatform} onChange={(e) => setWebhookPlatform(e.target.value)} className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm"><option value="generic">Generico / Lowify</option><option value="hotmart">Hotmart</option><option value="kirvano">Kirvano</option><option value="cakto">Cakto</option></select></Field><Field label="SEGREDO OPCIONAL" hint="Preencha somente se o gateway tambem enviar esse segredo no webhook."><input value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm" placeholder="Ex: minha-chave-secreta" /></Field><div className="flex justify-end gap-2"><button onClick={() => setWebhookModal(false)} className="rounded-md border border-line px-5 py-2 text-sm">Cancelar</button><button onClick={createWebhook} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white">Salvar Webhook</button></div></Modal>}
    </div>
  )
}

function WebhookUrlNotice({ webhook }: { webhook: any }) {
  const primary = webhook.integrationUrls?.[0]?.url || ''
  return (
    <div className="border-b border-line bg-brand/15 px-6 py-5">
      <div className="text-sm font-semibold text-white">Pronto. Copie a URL abaixo e cole no campo Endpoint URL da {platformLabel(webhook.platform)}.</div>
      <div className="mt-4 text-[11px] font-semibold uppercase text-muted">URL do webhook</div>
      <div className="mt-2 flex rounded-md border border-line bg-[#030715] p-3">
        <code className="flex-1 break-all text-xs text-white/90">{primary}</code>
        <CopyButton text={primary} />
      </div>
    </div>
  )
}

function platformLabel(platform: string) {
  const labels: Record<string, string> = {
    hotmart: 'Hotmart',
    kirvano: 'Kirvano',
    cakto: 'Cakto',
    generic: 'Generico',
  }
  return labels[platform] || platform
}

function AppTab() {
  return <Panel title="Baixe nosso App"><div className="px-6 py-10"><p className="text-muted">Use esta pagina para acessar o ScaleTrack em modo app pelo navegador.</p><div className="mt-5 rounded-md border border-line bg-ink p-4 text-sm">No Chrome: menu do navegador {'->'} Salvar e compartilhar {'->'} Instalar pagina como app.</div></div></Panel>
}

function FaqTab() {
  const items = [
    ['Como o rastreamento funciona?', 'O script captura UTMs e click ids, grava a visita e repassa os parametros para o checkout.'],
    ['Preciso instalar outro pixel?', 'Nao. O pixel de rastreio desta tela envia eventos server-side pela Conversions API.'],
    ['Quando o gasto atualiza?', 'A sincronizacao vem da API da Meta pelas contas habilitadas em Facebook Ads.'],
  ]
  return <Panel title="Duvidas"><div className="divide-y divide-line">{items.map(([q, a]) => <div key={q} className="px-6 py-5"><div className="font-semibold">{q}</div><p className="mt-2 text-sm text-muted">{a}</p></div>)}</div></Panel>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block space-y-2"><span className="block text-[11px] font-semibold text-white/85">{label}</span>{children}{hint && <span className="block text-[11px] text-muted">{hint}</span>}</label>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="mb-2 text-xs text-muted">{label}</div><div className="text-sm text-white">{value}</div></div>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[420px] rounded-lg border border-line bg-[#151244] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5"><h2 className="font-semibold">{title}</h2><button onClick={onClose} className="text-xl leading-none text-muted hover:text-white">x</button></div>
        <div className="space-y-4 px-6 pb-6">{children}</div>
      </div>
    </div>
  )
}

function formatDate(value: string) {
  return value ? new Intl.DateTimeFormat('pt-BR').format(new Date(value)) : '-'
}
