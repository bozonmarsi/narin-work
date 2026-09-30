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

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', shy: '',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sbquo: '‚',
  times: '×', deg: '°', middot: '·', bull: '•', euro: '€', copy: '©', reg: '®', trade: '™',
  aacute: 'á', Aacute: 'Á', eacute: 'é', Eacute: 'É', iacute: 'í', Iacute: 'Í', oacute: 'ó', Oacute: 'Ó',
  uacute: 'ú', Uacute: 'Ú', yacute: 'ý', Yacute: 'Ý', ecaron: 'ě', Ecaron: 'Ě', scaron: 'š', Scaron: 'Š',
  ccaron: 'č', Ccaron: 'Č', rcaron: 'ř', Rcaron: 'Ř', zcaron: 'ž', Zcaron: 'Ž', ncaron: 'ň', Ncaron: 'Ň',
  dcaron: 'ď', Dcaron: 'Ď', tcaron: 'ť', Tcaron: 'Ť', uring: 'ů', Uring: 'Ů',
  auml: 'ä', Auml: 'Ä', ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü', szlig: 'ß', agrave: 'à', egrave: 'è', ccedil: 'ç',
}

function decodeEntities(v: unknown): string {
  let s = String(v ?? '')
  // dvakrát kvůli dvojitě zakódovaným názvům typu "&amp;#345;"
  for (let i = 0; i < 2; i++) {
    s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === '#') {
        const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
      }
      return NAMED_ENTITIES[code] ?? NAMED_ENTITIES[code.toLowerCase()] ?? m
    })
  }
  return s
}

const strictKey = (v: unknown) =>
  decodeEntities(v).normalize('NFC').replace(/[\u00a0\s]+/g, ' ').trim().toLowerCase()
const looseKey = (v: unknown) =>
  strictKey(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

function buildStickerIndex(rows: { product_name: string | null; image_url: string | null }[]) {
  const strict = new Map<string, string>()
  const loose = new Map<string, string>()
  let fallback: string | null = null
  for (const r of rows) {
    if (!r.image_url || !r.product_name) continue
    if (r.product_name === '__default__') { fallback = r.image_url; continue }
    const sk = strictKey(r.product_name), lk = looseKey(r.product_name)
    if (sk && !strict.has(sk)) strict.set(sk, r.image_url)
    if (lk && !loose.has(lk)) loose.set(lk, r.image_url)
  }
  // nejdelší názvy první, aby "Růže Pink Express" vyhrála nad "Růže"
  const prefixes = [...loose.entries()].filter(([k]) => k.length >= 4).sort((a, b) => b[0].length - a[0].length)
  const cache = new Map<string, string | null>()
  return (name: unknown): string | null => {
    const sk = strictKey(name)
    if (!sk) return fallback
    if (cache.has(sk)) return cache.get(sk)!
    let url = strict.get(sk) ?? null
    const lk = looseKey(name)
    if (!url) url = loose.get(lk) ?? null
    if (!url) {
      const hit = prefixes.find(([k]) => lk.startsWith(k + ' ') || k.startsWith(lk + ' '))
      url = hit ? hit[1] : null
    }
    if (!url) url = fallback
    cache.set(sk, url)
    return url
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

    // Samolepky se párují podle názvu produktu, stejně jako v manažerském katalogu.
    // Tilda ale ukládá názvy s HTML entitami všeho druhu (&amp;, &#345; = ř, &scaron; = š...),
    // v katalogu i v objednávce různě. Manažerský web je dekóduje přes prohlížeč, tady
    // to děláme ručně: číselné entity + pojmenované (včetně českých), pak porovnání
    // bez ohledu na velikost písmen a mezery; když to nesedí, i bez diakritiky
    // a nakonec podle začátku názvu (produkt přejmenovaný nebo s dovětkem, např. "… 60 cm").
    const stickerIndex = buildStickerIndex(stickers ?? [])

    for (const order of orders ?? []) {
      const products = order.raw_payload?.payment?.products
      if (!Array.isArray(products)) continue
      for (const p of products) {
        const imageUrl = stickerIndex(p.name)
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
