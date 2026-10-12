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
   1 `db.execute` por linha = 1 round-trip; sync de ~640 linhas levava ~3min (vs 17s com `db.batch`).
   Do instead: acumular `stmts` e usar `writeBatch()` em `lib/meta.ts`.

## Aba Anuncios
1. **[2026-10-11] Campanha ativa sem gasto/venda no periodo nao aparecia**
   `getAdObjects` montava ids so de `orders` + `ad_insights`.
   Do instead: incluir objetos `ACTIVE` de `ad_objects` de contas `enabled = 1` (ja feito em `lib/metrics.ts`).
2. **[2026-10-11] Banco parado em 26/09 = cron de sync nao rodando em producao**
   Do instead: checar `MAX(date)` em `ad_insights`; ver se o cron da Vercel esta ativo (`*/30` exige plano Pro).

## Debug rapido
1. **Testar token direto via curl**
   Do instead: `set -a; source .env.local; set +a` e `curl graph.facebook.com/$V/me/permissions?access_token=$META_ACCESS_TOKEN`.

