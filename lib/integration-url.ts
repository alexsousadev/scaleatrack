import type { NextRequest } from 'next/server'

function parseBase(value: string | undefined): URL | null {
  if (!value?.trim()) return null
  let base = value.trim()
  // Corrige configurações copiadas como https//dominio ou https:/dominio.
  base = base.replace(/^(https?)\s*:\/*/i, '$1://').replace(/^(https?)\/{1,2}/i, '$1://')
  if (!/^[a-z][a-z\d+.-]*:/i.test(base)) base = `https://${base}`
  try {
    const url = new URL(base)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null
  } catch {
    return null
  }
}

export function integrationUrl(req: NextRequest, platform: string, id: string) {
  const base = parseBase(process.env.APP_URL) || parseBase(req.nextUrl.origin)
  if (!base) throw new Error('URL pública do painel inválida. Configure APP_URL com https://seu-dominio.')
  const url = new URL(`/api/webhooks/${encodeURIComponent(platform)}/${encodeURIComponent(id)}`, base.origin)
  return url.href
}
