import type { NormalizedOrder } from './base'
import { normalizeKirvano } from './kirvano'
import { normalizeCakto } from './cakto'
import { normalizeHotmart } from './hotmart'
import { normalizeWiapy } from './wiapy'
import { normalizeLowify } from './lowify'
import { normalizeGeneric } from './generic'

export type Platform = 'kirvano' | 'cakto' | 'hotmart' | 'lowify' | 'wiapy' | 'generic'

export const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'lowify', label: 'Lowify' },
  { id: 'wiapy', label: 'Wiapy' },
  { id: 'hotmart', label: 'Hotmart' },
  { id: 'generic', label: 'Genérico (outra plataforma)' },
]

const MAP: Record<Platform, (p: any) => NormalizedOrder | null> = {
  kirvano: normalizeKirvano,
  cakto: normalizeCakto,
  hotmart: normalizeHotmart,
  lowify: normalizeLowify,
  wiapy: normalizeWiapy,
  generic: normalizeGeneric,
}

export function normalize(platform: string, payload: any): NormalizedOrder | null {
  const fn = MAP[platform as Platform]
  if (!fn) return null
  return fn(payload)
}

export * from './base'
