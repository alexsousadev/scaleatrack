import { NextRequest } from 'next/server'
import { handleWebhookHead, handleWebhookPost, validateWebhookEndpoint } from '@/lib/webhook-receiver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ platform: string; id: string }> }) {
  const { platform, id } = await ctx.params
  return handleWebhookPost(req, platform, id)
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ platform: string; id: string }> }) {
  const { platform, id } = await ctx.params
  return validateWebhookEndpoint(platform, id)
}

export async function HEAD(_req: NextRequest, ctx: { params: Promise<{ platform: string; id: string }> }) {
  const { platform, id } = await ctx.params
  return handleWebhookHead(platform, id)
}
