// Поиск и подбор товаров у поставщика Van Vliet (склад Praha, dbserverid=47).
//
// Читает те же данные, что видит сама страница shop.orderyourflowers.nl —
// это не отдельный "экспорт", а те же запросы supply/minimal + supply/full,
// которые дёргает сам сайт при отрисовке карточек товаров (подтверждено
// сверкой с HAR реальной сессии в браузере).
//
// Это ТОЛЬКО чтение. Здесь нет вызова /v1/cart/item — на сайте поставщика
// добавление в корзину необратимо создаёт обязательство купить (см.
// vanvliet-order), поэтому purchase-эндпоинт держим отдельно и вызываем
// только по явному действию человека (тап по карточке в Telegram).
//
// Секреты: VANVLIET_USERNAME, VANVLIET_PASSWORD (Project Settings →
// Edge Functions → Secrets).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const CLIENT_ID = 'be38bc54e6c04589b5fc3c9e11f1f3a2'
const DB_SERVER_ID = '47' // Sklad v Praze
const WS_BASE = 'https://wsngshop.orderyourflowers.nl/servoy-service/rest_ws/ws_ngshop'
const CATEGORY = { key: '4_1', sourceListType: '2' } // Kvetiny (flowers)

// Реальный браузер шлёт эти заголовки — без них были 401/400 от базовой
// анти-бот защиты, даже с верными логином/паролем.
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  Origin: 'https://shop.orderyourflowers.nl',
  Referer: 'https://shop.orderyourflowers.nl/',
}

function decode(s: unknown): string {
  try {
    return decodeURIComponent(String(s || '').replace(/\+/g, ' '))
  } catch {
    return String(s || '')
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function makeSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

class UpstreamError extends Error {
  constructor(public step: string, public status: number, public body: unknown) {
    super(`REQUEST_FAILED ${step} status=${status} body=${JSON.stringify(body)}`)
  }
}

async function fetchJson(step: string, url: string, init: RequestInit): Promise<any> {
  const res = await fetch(url, init)
  const text = await res.text()
  let parsed: unknown = text
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    // leave as raw text
  }
  if (!res.ok) throw new UpstreamError(step, res.status, parsed)
  return parsed
}

async function getToken(username: string, password: string): Promise<string> {
  const body = `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(
    password
  )}&client_id=${CLIENT_ID}`
  const data = await fetchJson('token', 'https://vvwebapicore.jvanvliet.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...BROWSER_HEADERS },
    body,
  })
  return data.access_token
}

type Product = {
  key: number
  product: string
  color: string
  colorKey: number
  price: number
  orderPer: number
  stock: number
  quality: string
  grower: string
  photo: string
}

async function loadCatalog(username: string, password: string, targetDate: string): Promise<Product[]> {
  await getToken(username, password)

  const sessionId = makeSessionId()
  const wsHeaders = () => ({
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'x-sessionid': sessionId,
    'x-context-clientid': CLIENT_ID,
    'x-context-markname': username,
    'x-context-dbserverid': DB_SERVER_ID,
    'x-context-date': targetDate,
    ...BROWSER_HEADERS,
  })

  const wsGet = (step: string, path: string) =>
    fetchJson(step, `${WS_BASE}${path}`, { method: 'GET', headers: wsHeaders() })
  const wsPost = (step: string, path: string, body: unknown) =>
    fetchJson(step, `${WS_BASE}${path}`, {
      method: 'POST',
      headers: wsHeaders(),
      body: JSON.stringify(body),
    })

  await wsGet('authorize', `/v2/authentication/authorize?clientId=${CLIENT_ID}&databaseServerId=${DB_SERVER_ID}`)
  await wsGet('user-settings', `/v1/user/settings`)
  await wsGet(
    'autoselect',
    `/v2/autoselect?firstDate=true&databaseServerId=${DB_SERVER_ID}&pricelistKey=${CATEGORY.key}`
  )

  const minimalResp = await wsGet('supply-minimal', `/v1/supply/minimal/${CATEGORY.key}/3/${DB_SERVER_ID}/false`)
  const minimalItems: any[] = minimalResp?.content?.list || []
  const keys = minimalItems.map((i) => i.k)

  const catalog: Product[] = []
  for (const batch of chunk(keys, 20)) {
    const fullResp = await wsPost('supply-full', `/v1/supply/full/${CATEGORY.sourceListType}/false`, {
      keysArray: batch,
    })
    const list: any[] = fullResp?.content?.list || []
    for (const p of list) {
      catalog.push({
        key: p.key,
        product: decode(p.product),
        color: p.color || 'N.A.',
        colorKey: p.colorkey,
        price: p.price,
        orderPer: p.orderper,
        stock: p.stock,
        quality: p.quality,
        grower: decode(p.grower),
        photo: decode(p.pic || p.lotpic || ''),
      })
    }
  }
  return catalog
}

type SearchRequest = {
  label: string
  keywords: string[]
  colors?: string[]
  maxPrice?: number | null
  quantity?: number | null
}

const AMBIGUOUS = new Set(['misc', 'n.a.', 'unknown', ''])

function rank(catalog: Product[], req: SearchRequest) {
  const kw = req.keywords.map((k) => k.toLowerCase())
  const wantColors = (req.colors || []).map((c) => c.toLowerCase())

  let candidates = catalog.filter((it) => {
    const name = it.product.toLowerCase()
    if (!kw.some((k) => name.includes(k))) return false
    if (it.stock <= 0) return false
    if (req.maxPrice != null && it.price > req.maxPrice) return false
    if (wantColors.length === 0) return true
    const color = String(it.color).toLowerCase()
    return wantColors.includes(color) || AMBIGUOUS.has(color)
  })

  candidates.sort((a, b) => {
    const aExact = wantColors.includes(String(a.color).toLowerCase()) ? 0 : 1
    const bExact = wantColors.includes(String(b.color).toLowerCase()) ? 0 : 1
    if (aExact !== bExact) return aExact - bExact
    const aQual = a.quality === 'A1' ? 0 : 1
    const bQual = b.quality === 'A1' ? 0 : 1
    if (aQual !== bQual) return aQual - bQual
    return a.price - b.price
  })

  return candidates.slice(0, 4).map((c) => {
    const step = c.orderPer || 1
    const need = req.quantity != null ? req.quantity : step
    const cartAmount = Math.max(step, Math.ceil(need / step) * step)
    return {
      product: c.product,
      color: c.color,
      quality: c.quality,
      price: c.price,
      stock: c.stock,
      grower: c.grower,
      photo: c.photo,
      orderPer: c.orderPer,
      // готово для vanvliet-order: знак минус — так этот сайт адресует
      // товар в корзине (см. комментарий там).
      cartProductKey: -c.key,
      cartAmount,
    }
  })
}

const DEFAULT_REQUESTS: SearchRequest[] = [
  { label: 'Гортензия белая', keywords: ['hortenz', 'hortensia', 'hydrang'], colors: ['White'], maxPrice: null, quantity: 5 },
  { label: 'Гвоздика розовая', keywords: ['dianthus', 'anjer', ' dia ', 'carnation'], colors: ['Pink'], maxPrice: null, quantity: 25 },
  { label: 'Гвоздика белая', keywords: ['dianthus', 'anjer', ' dia ', 'carnation'], colors: ['White'], maxPrice: null, quantity: 25 },
  { label: 'Дахлия оранжевая', keywords: ['dahlia', 'dahl'], colors: ['Orange'], maxPrice: null, quantity: null },
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const requests: SearchRequest[] = Array.isArray(body.requests) && body.requests.length ? body.requests : DEFAULT_REQUESTS
    const targetDate: string =
      body.targetDate || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' })

    const username = Deno.env.get('VANVLIET_USERNAME')!
    const password = Deno.env.get('VANVLIET_PASSWORD')!
    if (!username || !password) {
      return json({ error: 'missing_credentials', detail: 'Set VANVLIET_USERNAME / VANVLIET_PASSWORD secrets' }, 500)
    }

    const catalog = await loadCatalog(username, password, targetDate)

    const results = requests.map((r) => ({
      request: r.label,
      requestedQuantity: r.quantity ?? null,
      quantityWasUnspecified: r.quantity == null,
      candidates: rank(catalog, r),
      date: targetDate,
    }))

    return json({ ok: true, catalogSize: catalog.length, results })
  } catch (e) {
    if (e instanceof UpstreamError) {
      return json({ ok: false, step: e.step, status: e.status, body: e.body }, 502)
    }
    return json({ ok: false, error: String(e) }, 500)
  }
})
