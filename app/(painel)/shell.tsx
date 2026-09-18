'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import Logo from '../components/logo'
import { PanelProvider, RangePicker, usePanel } from '../components/ui'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/utms', label: 'UTMs' },
  { href: '/anuncios', label: 'Anuncios' },
  { href: '/pedidos', label: 'Pedidos' },
  { href: '/integracoes', label: 'Integracoes' },
]

function Header({ comPeriodo }: { comPeriodo: boolean }) {
  const { dashboards, dashboardId, dashboardError, setDashboardId } = usePanel()
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  async function syncMeta() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/integrations/sync-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 7 }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Falha ao sincronizar.')

      const errors = (data.results || []).filter((r: any) => r.error)
      const rows = (data.results || []).reduce((sum: number, r: any) => sum + Number(r.insightRows || 0), 0)
      setSyncMsg(errors.length ? `${errors.length} conta(s) com erro` : `${rows} linha(s) importadas`)
      window.dispatchEvent(new Event('scaletrack:meta-sync'))
    } catch (e: any) {
      setSyncMsg(e?.message || 'Falha ao sincronizar.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      {dashboardError && (
        <div className="w-full border border-bad/40 bg-bad/10 text-bad rounded-lg px-3 py-2 text-sm">
          {dashboardError}
        </div>
      )}
      {dashboards.length > 1 && (
        <select value={dashboardId} onChange={(e) => setDashboardId(e.target.value)}
                className="bg-panel border border-line rounded-lg px-3 py-1.5 text-sm">
          {dashboards.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      )}
      {comPeriodo && <RangePicker />}
      <button
        onClick={syncMeta}
        disabled={syncing}
        className="text-xs px-3 py-1.5 rounded-lg border border-line text-muted hover:text-white hover:border-brand disabled:opacity-50"
      >
        {syncing ? 'Sincronizando...' : 'Sincronizar Meta'}
      </button>
      {syncMsg && <span className="text-xs text-muted">{syncMsg}</span>}
      <button onClick={logout} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-line text-muted hover:text-white hover:border-brand">
        Sair
      </button>
    </div>
  )
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <PanelProvider>
      <div className="flex min-h-screen">
        <aside className="w-52 shrink-0 border-r border-line p-4 hidden md:block">
          <div className="mb-8">
            <Logo />
          </div>
          <nav className="space-y-1">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href}
                    className={`block px-3 py-2 rounded-lg text-sm ${pathname === n.href ? 'bg-brand/15 text-white' : 'text-muted hover:text-white hover:bg-panel'}`}>
                {n.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-4 md:p-6 min-w-0">
          <Header comPeriodo={pathname !== '/integracoes'} />
          {children}
        </main>
      </div>
    </PanelProvider>
  )
}
