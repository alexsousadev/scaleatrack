export const INTEGRATION_PLATFORMS = ['lowify', 'wiapy', 'hotmart', 'generic'] as const

export function integrationPlatform(platform: unknown, name?: unknown): string {
  const value = String(platform || '').trim().toLowerCase()
  if (['lowify', 'wiapy', 'hotmart', 'kirvano', 'cakto'].includes(value)) return value
  // Compatibilidade com integrações antigas cadastradas como API/Genérico.
  const legacyName = String(name || '').trim().toLowerCase()
  if (['lowify', 'wiapy', 'hotmart'].includes(legacyName)) return legacyName
  return 'generic'
}
