// Добавление товара в корзину у Van Vliet (склад Praha, dbserverid=47).
//
// ⚠️ На этом сайте это НЕ черновик. Добавление в корзину — необратимое
// обязательство купить и забрать товар (подтверждено на практике: тестовый
// вызов оставил реальный долг 170 Kč за 10 шт. Agapanthus). Поэтому:
//   - этот эндпоинт всегда вызывается только по явному действию человека
//     (тап по конкретному товару в Telegram) — никогда автоматически и
//     никогда "для теста";
//   - никакого отката/удаления после вызова нет.
//
// cartProductKey и cartAmount — это ровно то, что отдаёт vanvliet-search
// в каждом кандидате (уже готовые, ничего пересчитывать не надо).
//
// Секреты: VANVLIET_USERNAME, VANVLIET_PASSWORD (те же, что у vanvliet-search).

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
const DB_SERVER_ID = '47'
const WS_BASE = 'https://wsngshop.orderyourflowers.nl/servoy-service/rest_ws/ws_ngshop'

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  Origin: 'https://shop.orderyourflowers.nl',
  Referer: 'https://shop.orderyourflowers.nl/',
}

function makeSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

async function fetchJson(url: string, init: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(url, init)
  const text = await res.text()
  let parsed: unknown = text
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    // leave as raw text
  }
  return { status: res.status, body: parsed }
}

// Every real wsngshop call carries `Authorization: Basic base64(username:servoygrant)`
// — servoygrant is a per-login claim baked into the JWT payload, not the
// account password. Found by capturing a live browser session directly.
function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]
  const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=')
  return JSON.parse(atob(padded))
}

async function getAuth(username: string, password: string): Promise<string> {
  const body = `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(
    password
  )}&client_id=${CLIENT_ID}`
  const { status, body: data } = await fetchJson('https://vvwebapicore.jvanvliet.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...BROWSER_HEADERS },
    body,
  })
  if (status >= 400) throw new Error(`token failed: ${JSON.stringify(data)}`)
  const claims = decodeJwtPayload(data.access_token)
  const servoyGrant = String(claims.servoygrant)
  return 'Basic ' + btoa(`${username}:${servoyGrant}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { cartProductKey, cartAmount, targetDate, confirm } = body

    if (cartProductKey == null || cartAmount == null) {
      return json({ error: 'cartProductKey and cartAmount required' }, 400)
    }
    // Explicit safety latch — a caller must pass confirm:true. This is not
    // meant to be a security boundary, just a guard against this endpoint
    // ever being hit by a stray/automated call that isn't a deliberate
    // human purchase decision.
    if (confirm !== true) {
      return json({ error: 'confirm:true required — this call is a real, irreversible purchase' }, 400)
    }

    const username = Deno.env.get('VANVLIET_USERNAME')!
    const password = Deno.env.get('VANVLIET_PASSWORD')!
    if (!username || !password) {
      return json({ error: 'missing_credentials' }, 500)
    }

    const date: string = targetDate || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' })

    const basicAuth = await getAuth(username, password)

    const sessionId = makeSessionId()
    const baseHeaders = { Accept: 'application/json, text/plain, */*', Authorization: basicAuth, ...BROWSER_HEADERS }
    const withSession = { ...baseHeaders, 'Content-Type': 'application/json', 'x-sessionid': sessionId, 'x-context-clientid': CLIENT_ID }
    const fullContext = {
      ...withSession,
      'x-context-markname': username,
      'x-context-dbserverid': DB_SERVER_ID,
      'x-context-date': date,
    }

    await fetchJson(`${WS_BASE}/v2/authentication/authorize?clientId=${CLIENT_ID}&databaseServerId=${DB_SERVER_ID}`, {
      method: 'GET',
      headers: baseHeaders,
    })
    await fetchJson(`${WS_BASE}/v1/user/settings`, { method: 'GET', headers: withSession })

    const headers = fullContext
    const url =
      `${WS_BASE}/v1/cart/item?productKey=${encodeURIComponent(cartProductKey)}` +
      `&amount=${encodeURIComponent(cartAmount)}&salesPrice=-1&retailPrice=-1`

    const { status, body: result } = await fetchJson(url, { method: 'POST', headers })

    if (status >= 400) {
      return json({ ok: false, status, body: result }, 502)
    }

    return json({ ok: true, result })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
