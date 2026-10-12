# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep only recurring, high-value guidance. Max 10 items per category.
- Every item needs a "Do instead".

## Meta Graph API
1. **[2026-10-11] BMs somem quando o token nao tem `business_management`**
   `/me/businesses` retorna `(#100) Missing Permission` e o campo `business` em adaccounts tambem e bloqueado.
   Do instead: checar `/me/permissions` primeiro; gerar token com `ads_read` + `ads_management` + `business_management`.
2. **[2026-10-11] Token do `.env.local` e de um usuario "scaletrack" (provavel System User)**
   System User so enxerga ativos atribuidos a ele dentro da propria BM.
   Do instead: para puxar TODAS as BMs, usar token de usuario pessoal (long-lived) ou atribuir as contas ao System User.
3. **[2026-10-11] Nunca usar `.catch(() => [])` nas chamadas da Graph API**
   Esconde o motivo real (permissao, rate limit). Do instead: empurrar a mensagem em `diagnostics.warnings` (ver `lib/meta.ts`).
4. **[2026-10-11] Writes no Turso remoto: sempre em lote**
5. **[2026-10-11] Saldo das contas Meta: pre-pago vs pos-pago**
   - Pré-pago: saldo disponível vem em `funding_source_details.display_string`. Quando <= R$ 20,00, destacar em vermelho para recarga imediata.
   - Pós-pago: campo `balance` da Graph API é o saldo devedor/gasto acumulado da fatura atual; `spend_cap` é o limite de gastos fixado.
   Do instead: guardar `is_prepay`, `spend_cap_cents` e `amount_spent_cents` em `ad_accounts` e exibir gasto acumulado vs limite no pós-pago.

## Dashboard & Funil
1. **[2026-10-11] Funil de Conversao Meta Ads (Cliques -> Visitas -> IC -> Vendas Inic -> Vendas Apr)**
   Quando o pixel ainda nao tiver registrado todos os page views/ICs de landing page externa, utilizar `link_clicks` ou `clicks * 0.85` e pedidos totais para manter taxas de drop coerentes e visiveis.
   Do instead: consolidar `ad_insights`, `visits`, `events` e `orders` em um unico payload `funnel`.
2. **[2026-10-11] Alerta de Saldo Baixo em Ads**
   Contas pré-pagas com R$ 20 ou menos correm risco de pausa de veiculação na Meta.
   Do instead: acionar badge `⚠️ Saldo Baixo` com borda e texto vermelho quando `balance_cents <= 2000`.


## Aba Anuncios
1. **[2026-10-11] Campanha ativa sem gasto/venda no periodo nao aparecia**
   `getAdObjects` montava ids so de `orders` + `ad_insights`.
   Do instead: incluir objetos `ACTIVE` de `ad_objects` de contas `enabled = 1` (ja feito em `lib/metrics.ts`).
2. **[2026-10-11] Banco parado em 26/09 = cron de sync nao rodando em producao**
   Do instead: checar `MAX(date)` em `ad_insights`; ver se o cron da Vercel esta ativo (`*/30` exige plano Pro).
3. **[2026-10-11] Personalizacao de colunas da tabela de anuncios**
   Suporta todas as metricas (Lance, Gasto, Vendas, Margem, CPA, ARPU, Custo por IC, CPC, CTR, CPM, Impressoes, Cliques, Visitas, IC, % IC, IDs).
   Do instead: guardar selecao de colunas no localStorage (`scaletrack_ad_columns_v2`).

## Tracking & Pixel
1. **[2026-10-11] Script unificado de rastreio**
   O script gerado no card do Pixel ja faz tudo (captura UTMs, grava visita no banco, repassa pro checkout e dispara eventos CAPI). Nao instalar scripts duplicados.
   Do instead: usar apenas a tag de `<script src="/t.js" ...>` gerada no Pixel.

## Debug rapido
1. **Testar token direto via curl**
   Do instead: `set -a; source .env.local; set +a` e `curl graph.facebook.com/$V/me/permissions?access_token=$META_ACCESS_TOKEN`.

