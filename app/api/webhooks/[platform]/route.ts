import { NextRequest, NextResponse } from 'next/server'
import { handleWebhookHead, handleWebhookPost, validateWebhookEndpoint } from '@/lib/webhook-receiver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Endpoint que o gateway chama:
 *   POST /api/webhooks/kirvano?id=<id-do-webhook>
 *
 * Responde 200 sempre que o payload for aceito, mesmo se o evento for ignorado
 * (senao o gateway fica reenviando pra sempre).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params
  const webhookId = req.nextUrl.searchParams.get('id')
  return handleWebhookPost(req, platform, webhookId || '')
}

/** GET so pra validacao de endpoint que alguns gateways fazem. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params
  return validateWebhookEndpoint(platform, req.nextUrl.searchParams.get('id') || '')
}

export async function HEAD(req: NextRequest, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params
  return handleWebhookHead(platform, req.nextUrl.searchParams.get('id') || '')
}
