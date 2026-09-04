// Данные для карты лояльности/личного кабинета: баланс, tier, история
// заказов и транзакций.
//
// До 2026-09-04 эта функция принимала голый email в теле запроса и
// отдавала по нему ПОЛНУЮ историю заказов и баланс без всякой проверки
// владения — из браузера с публичным anon-ключом (он и должен быть
// публичным, это не секрет) можно было запросить чужой email и получить
// весь его заказ. Теперь, как и в personal-dates/support-chat, требуем
// HMAC-токен (lk_auth_token) и берём email из него, а не из тела запроса.
//
// Порядок раскатки важен: сначала обновляется вызывающий скрипт на
// /members/ (начинает слать token, старая версия функции его просто
// игнорирует — не ломается), и только потом эта функция начинает его
// требовать. Разворачивать в обратном порядке нельзя — карта лояльности
// перестанет грузиться у всех, кто ещё не подтвердил email.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const encoder = new TextEncoder()

const TIERS = [
  { name: 'Klient', threshold: 0 },
  { name: 'Silver', threshold: 300 },
  { name: 'Gold', threshold: 600 },
  { name: 'Platinum', threshold: 900 },
]

function getTier(totalEarned: number): string {
  let name = TIERS[0].name
  for (const t of TIERS) {
    if (totalEarned >= t.threshold) name = t.name
  }
  return name
}

async function verifyToken(token: string, secret: string): Promise<string | null> {
  const parts = String(token).split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sigB64] = parts
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64))
  const expectedSigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
  if (expectedSigB64 !== sigB64) return null
  try {
    const payload = JSON.parse(atob(payloadB64))
    if (!payload.exp || payload.exp < Date.now()) return null
    return payload.email
  } catch {
    return null
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token } = await req.json()

    if (!token) {
      return json({ error: 'token required' }, 400)
    }

    const normalizedEmail = await verifyToken(token, Deno.env.get('AUTH_TOKEN_SECRET')!)
    if (!normalizedEmail) {
      return json({ error: 'invalid_token' }, 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: pointsRow } = await supabase
      .from('Tilda points')
      .select('id, balance, ma_id')
      .ilike('email', normalizedEmail)
      .maybeSingle()

    const { data: allTransactions } = await supabase
      .from('points_transactions')
      .select('amount, type, order_id, description, created_at')
      .ilike('user_email', normalizedEmail)
      .order('created_at', { ascending: false })

    const totalEarned = (allTransactions ?? [])
      .filter((r) => r.amount > 0)
      .reduce((sum, r) => sum + r.amount, 0)

    const { data: orders } = await supabase
      .from('tilda_orders')
      .select('*')
      .ilike('customer_email', normalizedEmail)
      .order('created_at', { ascending: false })

    const { data: stickers } = await supabase
      .from('product_stickers')
      .select('product_name, image_url')

    const stickerByName = new Map((stickers ?? []).map((s) => [s.product_name, s.image_url]))

    for (const order of orders ?? []) {
      const products = order.raw_payload?.payment?.products
      if (!Array.isArray(products)) continue
      for (const p of products) {
        const imageUrl = stickerByName.get(p.name)
        if (imageUrl) p.image_url = imageUrl
      }
    }

    return json({
      balance: pointsRow?.balance ?? 0,
      totalEarned,
      tier: getTier(totalEarned),
      ma_id: pointsRow?.ma_id ?? null,
      id: pointsRow?.id ?? null,
      orders: orders ?? [],
      transactions: allTransactions ?? [],
    })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
