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
// После реального успеха у поставщика пишем строку в vanvliet_purchases —
// иначе нет способа посмотреть, что и когда мы заказали и чего ждать.
// productName/color/price/materialId — не обязательные для самой покупки,
// только для этой записи (фронт и так их уже знает из результатов поиска).
//
// ВАЖНО: HTTP-статус < 400 от /v1/cart/item НЕ означает, что товар
// реально попал в корзину — поймали живьём случай "200 OK" с телом
// {"error":"true","content":{"list":{"message":"Položka nenalezena.
// Obnovte seznam a zkuste znovu, prosím"}}} ("товар не найден, обновите
// список и попробуйте снова"). Причина: cartProductKey приходит с более
// раннего вызова vanvliet-search — а это ДРУГАЯ сессия у поставщика,
// которая никогда не видела каталог на эту дату. Сама покупка стартует
// с чистого листа (authorize → user-settings → autoselect → сразу
// cart/item), поэтому сервер поставщика этот ключ просто не узнаёт.
// Фикс — как и в реальном браузере/vanvliet-search, перед покупкой
// подгружаем каталог (supply/minimal + supply/full) на эту дату В ТОЙ ЖЕ
// сессии, чтобы сервер "увидел" нужный товар. И проверяем не только
// статус, но и текстовое поле error в самом теле ответа — поставщик
// сигналит ошибки именно так, а не HTTP-кодом.
//
// Секреты: VANVLIET_USERNAME, VANVLIET_PASSWORD (те же, что у
// vanvliet-search), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
const CATEGORY = { key: '4_1', sourceListType: '2' } // тот же прайслист, что и в vanvliet-search

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

// Кто нажал "Купить" — платформа уже проверила этот JWT (verify_jwt
// включён для этой функции), достаточно просто прочитать sub, отдельно
// перепроверять не нужно.
function callerUserId(req: Request): string | null {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try {
    return String(decodeJwtPayload(token).sub ?? '') || null
  } catch {
    return null
  }
}

// Ищем productKey где угодно в ответе /v1/cart/{date} — схему ответа мы
// не знаем точно (в HAR не сохранилось тело), поэтому вместо разбора
// конкретных полей просто рекурсивно проверяем, встречается ли число
// нашего товара (в любом знаке — на добавлении ключ шёл отрицательным)
// хоть где-то в структуре.
function containsValue(node: unknown, needle: number, depth = 0): boolean {
  if (depth > 8) return false
  if (typeof node === 'number') return node === needle || node === -needle
  if (Array.isArray(node)) return node.some((v) => containsValue(v, needle, depth + 1))
  if (node && typeof node === 'object') return Object.values(node as Record<string, unknown>).some((v) => containsValue(v, needle, depth + 1))
  return false
}

// Их текстовые сообщения об ошибках закодированы старым JS escape()
// (%uXXXX для не-ASCII, %XX для остального) — не то же самое, что
// decodeURIComponent сам по себе понимает.
function decodeVanVlietMessage(body: unknown): string | null {
  const raw = (body as any)?.content?.list?.message
  if (typeof raw !== 'string') return null
  try {
    const withUnicode = raw.replace(/%u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    return decodeURIComponent(withUnicode)
  } catch {
    return raw
  }
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
    const { cartProductKey, cartAmount, targetDate, confirm, productName, color, price, materialId } = body

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

    const withMarkname = { ...withSession, 'x-context-markname': username }

    await fetchJson(`${WS_BASE}/v2/authentication/authorize?clientId=${CLIENT_ID}&databaseServerId=${DB_SERVER_ID}`, {
      method: 'GET',
      headers: baseHeaders,
    })
    await fetchJson(`${WS_BASE}/v1/user/settings`, { method: 'GET', headers: withSession })
    // Тот же прогрев сессии, что и в vanvliet-search перед любым чтением
    // каталога — здесь его не было вообще, а без него, похоже, сессия не
    // успевала "открыть" нужный день на сервере поставщика.
    await fetchJson(
      `${WS_BASE}/v2/autoselect?firstDate=true&databaseServerId=${DB_SERVER_ID}&pricelistKey=${CATEGORY.key}`,
      { method: 'GET', headers: withMarkname }
    )

    // Подгружаем каталог на эту дату В ЭТОЙ ЖЕ сессии — cartProductKey
    // пришёл из vanvliet-search (другая сессия), и без этого шага сервер
    // поставщика отвечает "Položka nenalezena" (товар не найден), даже
    // если сам ключ на самом деле верный.
    await fetchJson(`${WS_BASE}/v1/supply/minimal/${CATEGORY.key}/3/${CATEGORY.sourceListType}/false`, {
      method: 'GET',
      headers: fullContext,
    })
    await fetchJson(`${WS_BASE}/v1/supply/full/${CATEGORY.sourceListType}/false`, {
      method: 'POST',
      headers: fullContext,
      body: JSON.stringify({ keysArray: [Math.abs(Number(cartProductKey))] }),
    })

    const headers = fullContext
    const url =
      `${WS_BASE}/v1/cart/item?productKey=${encodeURIComponent(cartProductKey)}` +
      `&amount=${encodeURIComponent(cartAmount)}&salesPrice=-1&retailPrice=-1`

    const { status, body: result } = await fetchJson(url, { method: 'POST', headers })

    // Поставщик сигналит ошибки текстовым полем error в теле ответа, а не
    // HTTP-статусом — тело может прийти с "200 OK" и всё равно означать
    // отказ (например "товар не найден").
    const apiError = result && typeof result === 'object' && String((result as any).error).toLowerCase() === 'true'
    if (status >= 400 || apiError) {
      const supplierMessage = decodeVanVlietMessage(result)
      return json(
        { ok: false, status, body: result, message: supplierMessage ? `Van Vliet: ${supplierMessage}` : undefined },
        502
      )
    }

    // HTTP-успех тут ничего не гарантирует (см. комментарий вверху файла) —
    // перечитываем саму корзину на эту дату и ищем там наш товар, точно
    // как это делает сайт поставщика сразу после добавления.
    const cartCheck = await fetchJson(`${WS_BASE}/v1/cart/${date}`, { method: 'GET', headers: fullContext })
    const verified = cartCheck.status < 400 && containsValue(cartCheck.body, Number(cartProductKey))
    if (!verified) {
      return json(
        {
          ok: false,
          error: 'cart_verification_failed',
          message: 'Van Vliet ответил успехом, но товара не оказалось в корзине на эту дату — заказ не подтверждён',
          orderStatus: status,
          orderBody: result,
          cartCheckStatus: cartCheck.status,
          cartCheckBody: cartCheck.body,
        },
        502
      )
    }

    // Заказ у поставщика реально подтверждён (найден в их корзине) — запись
    // в наш журнал делаем best-effort и не валим успешный ответ, если она
    // вдруг не удалась.
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (supabaseUrl && serviceKey) {
        const supabase = createClient(supabaseUrl, serviceKey)
        const unitPrice = typeof price === 'number' ? price : null
        await supabase.from('vanvliet_purchases').insert({
          product_sticker_id: materialId || null,
          product_name: productName || `#${cartProductKey}`,
          color: color || null,
          quantity: cartAmount,
          price_per_unit: unitPrice,
          total_price: unitPrice != null ? unitPrice * cartAmount : null,
          target_date: date,
          cart_product_key: cartProductKey,
          ordered_by: callerUserId(req),
        })
      }
    } catch {
      // не мешаем успешному ответу — покупка у поставщика уже состоялась
    }

    return json({ ok: true, result })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
