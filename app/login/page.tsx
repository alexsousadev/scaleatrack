'use client'

import { useState } from 'react'
import Logo from '../components/logo'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const next = new URLSearchParams(window.location.search).get('next') || '/dashboard'
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    setLoading(false)
    if (!res.ok) {
      setError('Senha incorreta.')
      return
    }

    window.location.href = next.startsWith('/') ? next : '/dashboard'
  }

  return (
    <main className="min-h-screen grid place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-panel border border-line rounded-xl p-5 space-y-4">
        <Logo />
        <div>
          <label htmlFor="password" className="block text-sm text-muted mb-2">
            Senha do painel
          </label>
          <input
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            autoFocus
            className="w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
        <button
          disabled={loading || !password}
          className="w-full bg-brand disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium text-white"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
