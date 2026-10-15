// Pedidos antigos não guardavam a integração. Só recuperamos a origem quando
// o formato identifica o provedor e existe exatamente uma integração compatível.
export const ORDER_INTEGRATION_BACKFILL = `
WITH legacy AS (
  SELECT id, dashboard_id, platform,
    CASE
      WHEN json_extract(raw, '$.payment.id') IS NOT NULL THEN 'wiapy'
      WHEN json_extract(raw, '$.sale_amount') IS NOT NULL
        AND json_extract(raw, '$.event') LIKE 'sale.%' THEN 'lowify'
      WHEN json_extract(raw, '$.data.purchase.transaction') IS NOT NULL THEN 'hotmart'
    END AS provider
  FROM orders WHERE integration_name IS NULL AND json_valid(raw)
), candidates AS (
  SELECT o.id AS order_id, 'token:' || t.id AS integration_id, t.name
    FROM legacy o JOIN api_tokens t ON t.dashboard_id = o.dashboard_id
   WHERE o.platform = 'generic' AND o.provider IS NOT NULL
     AND (lower(trim(t.name)) = o.provider OR lower(t.platform) = o.provider)
  UNION ALL
  SELECT o.id, 'webhook:' || w.id, w.name
    FROM legacy o JOIN webhooks w ON w.dashboard_id = o.dashboard_id AND w.platform = o.platform
   WHERE o.provider IS NOT NULL
     AND (lower(trim(w.name)) = o.provider OR w.platform = o.provider)
), unique_origins AS (
  SELECT order_id, min(integration_id) AS integration_id, min(name) AS name
  FROM candidates GROUP BY order_id HAVING count(*) = 1
)
UPDATE orders
   SET integration_id = (SELECT integration_id FROM unique_origins WHERE order_id = orders.id),
       integration_name = (SELECT name FROM unique_origins WHERE order_id = orders.id)
 WHERE id IN (SELECT order_id FROM unique_origins)
`
