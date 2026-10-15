'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePanel } from './ui'

export default function MetaRefresh() {
  const { dashboardId, from, to } = usePanel()
  const [minutes, setMinutes] = useState(5)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const running = useRef(false)
  const generation = useRef(0)

  useEffect(() => {
    generation.current += 1
    setMessage('')
  }, [dashboardId])

  const refresh = useCallback(async () => {
    if (!dashboardId || running.current) return
    running.current = true
    setBusy(true)
    setMessage('')
    const current = generation.current
    try {
      const today = Date.now()
      const start = Math.min(Date.parse(from) || today, Date.parse(to) || today)
      const days = Math.min(90, Math.max(3, Math.ceil((today - start) / 864e5) + 1))
      const res = await fetch('/api/integrations/sync-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardId, days }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao sincronizar. Tente novamente.')
      if (current !== generation.current) return
      window.dispatchEvent(new Event('scaletrack:meta-sync'))
      const failures = (data.results || []).filter((r: any) => r.error || r.balanceError)
      const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      setMessage(!data.accounts
        ? 'Nenhuma conta ativa. Ative as contas em Integrações.'
        : failures.length
          ? `${failures.length} conta(s) com falha: ${failures.map((r: any) => `${r.account}: ${r.error || r.balanceError}`).join(' • ')}`
          : `Atualizado às ${time}.`)
    } catch (error) {
      if (current === generation.current) setMessage(error instanceof Error ? error.message : 'Falha ao sincronizar. Tente novamente.')
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [dashboardId, from, to])

  useEffect(() => {
    if (!minutes) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, minutes * 60000)
    return () => window.clearInterval(timer)
  }, [minutes, refresh])

  return (
    <div className="flex max-w-full flex-wrap items-center gap-2">
      <button onClick={() => void refresh()} disabled={busy || !dashboardId}
        className="rounded-lg border border-line bg-panel px-3 py-2 text-xs font-medium hover:border-brand disabled:opacity-50">
        {busy ? 'Sincronizando Meta...' : 'Atualizar contas'}
      </button>
      <label className="flex items-center gap-2 text-xs text-muted">
        Automático
        <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}
          className="rounded-lg border border-line bg-panel px-2 py-2 text-white">
          <option value={0}>Desativado</option>
          <option value={5}>A cada 5 min</option>
          <option value={15}>A cada 15 min</option>
          <option value={30}>A cada 30 min</option>
        </select>
      </label>
      <p role="status" className="w-full break-words text-xs text-muted">{message || 'Sincroniza as contas ativas com a Meta enquanto esta aba estiver visível.'}</p>
    </div>
  )
}
