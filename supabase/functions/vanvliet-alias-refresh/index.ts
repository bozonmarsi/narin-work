// Раз в полмесяца (см. миграцию с pg_cron) обновляет соответствия
// "наш цветок" -> "как называется у Van Vliet".
//
// Простой перебор по первой букве/подстроке (как раньше пробовали)
// не работает: у нас разговорные чешские названия ("Pivoňka",
// "Karafiát", "Růže", "Tulipán", "Hortenzie"), а у поставщика —
// латинские/торговые ("Peony"/"Paeonia", "Dianthus", "Rosa", "Tulipa",
// "Hydrangea") — это не пересекающиеся по буквам слова, нужен
// настоящий перевод. Этим занимается Claude, один раз за прогон.
//
// Каждый прогон ПОЛНОСТЬЮ заменяет алиасы Van Vliet для каждого цветка,
// который попал в ответ модели, свежим набором (0–4 штуки, сколько
// реально нашлось) — так устаревшие соответствия не копятся, а
// естественно обновляются вместе с каталогом поставщика.
//
// Вызывается по расписанию через pg_cron (см. миграцию), не пользователем
// напрямую — поэтому проверяем свой отдельный секрет (CRON_SECRET), а не
// полагаемся только на платформенный JWT.
//
// Секреты: VANVLIET_USERNAME, VANVLIET_PASSWORD (те же, что у
// vanvliet-search), ANTHROPIC_API_KEY, CRON_SECRET.

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
const DB_SERVER_ID = '47' // Sklad v Praze
const WS_BASE = 'https://wsngshop.orderyourflowers.nl/servoy-service/rest_ws/ws_ngshop'
const CATEGORY = { key: '4_1', sourceListType: '2' } // Kvetiny (flowers)

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

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]
  const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=')
  return JSON.parse(atob(padded))
}

async function getAuth(username: string, password: string): Promise<string> {
  const body = `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(
    password
  )}&client_id=${CLIENT_ID}`
  const data = await fetchJson('token', 'https://vvwebapicore.jvanvliet.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...BROWSER_HEADERS },
    body,
  })
  const claims = decodeJwtPayload(data.access_token)
  return 'Basic ' + btoa(`${username}:${String(claims.servoygrant)}`)
}

type Product = { key: number; product: string; color: string }

async function loadCatalog(username: string, password: string, targetDate: string): Promise<Product[]> {
  const basicAuth = await getAuth(username, password)
  const sessionId = makeSessionId()

  const baseHeaders = { Accept: 'application/json, text/plain, */*', Authorization: basicAuth, ...BROWSER_HEADERS }
  const withSession = { ...baseHeaders, 'Content-Type': 'application/json', 'x-sessionid': sessionId, 'x-context-clientid': CLIENT_ID }
  const withMarkname = { ...withSession, 'x-context-markname': username }
  const fullContext = { ...withMarkname, 'x-context-dbserverid': DB_SERVER_ID, 'x-context-date': targetDate }

  const get = (step: string, path: string, headers: Record<string, string>) =>
    fetchJson(step, `${WS_BASE}${path}`, { method: 'GET', headers })
  const post = (step: string, path: string, headers: Record<string, string>, body: unknown) =>
    fetchJson(step, `${WS_BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })

  await get('authorize', `/v2/authentication/authorize?clientId=${CLIENT_ID}&databaseServerId=${DB_SERVER_ID}`, baseHeaders)
  await get('user-settings', `/v1/user/settings`, withSession)
  await get('autoselect', `/v2/autoselect?firstDate=true&databaseServerId=${DB_SERVER_ID}&pricelistKey=${CATEGORY.key}`, withMarkname)

  const wsGet = (step: string, path: string) => get(step, path, fullContext)
  const wsPost = (step: string, path: string, body: unknown) => post(step, path, fullContext, body)

  const minimalResp = await wsGet('supply-minimal', `/v1/supply/minimal/${CATEGORY.key}/3/${CATEGORY.sourceListType}/false`)
  const keys = ((minimalResp?.content?.list || []) as any[]).map((i) => i.k)

  const catalog: Product[] = []
  for (const batch of chunk(keys, 20)) {
    const fullResp = await wsPost('supply-full', `/v1/supply/full/${CATEGORY.sourceListType}/false`, { keysArray: batch })
    for (const p of (fullResp?.content?.list || []) as any[]) {
      catalog.push({ key: p.key, product: decode(p.product), color: p.color || 'N.A.' })
    }
  }
  return catalog
}

// Тот же хвост, что и в ручном/автосопоставлении на фронте — размер,
// граммовка, штучность и партия меняются у поставщика день ото дня,
// сам цветок при этом тот же.
function coreName(name: string): string {
  return name
    .replace(/\(\s*imp\s*\)/gi, ' ')
    .replace(/\(\s*\d+\s*\)/g, ' ')
    .replace(/\b\d+([.,]\d+)?\s*cm\b/gi, ' ')
    .replace(/\b\d+([.,]\d+)?\s*gram\b/gi, ' ')
    .replace(/\b\d+\s*st\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const cronSecret = Deno.env.get('CRON_SECRET')
  const authHeader = req.headers.get('authorization') || ''
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: 'unauthorized' }, 401)
  }

  try {
    const username = Deno.env.get('VANVLIET_USERNAME')!
    const password = Deno.env.get('VANVLIET_PASSWORD')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!username || !password) return json({ error: 'missing_vanvliet_credentials' }, 500)
    if (!anthropicKey) return json({ error: 'missing_anthropic_key' }, 500)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: supplier } = await supabase.from('suppliers').select('id').eq('name', 'Van Vliet').maybeSingle()
    if (!supplier) return json({ error: 'van_vliet_supplier_not_found' }, 500)

    const { data: materials } = await supabase
      .from('product_stickers')
      .select('id, product_name')
      .eq('category', 'ohapka')

    const targetDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' })
    const catalog = await loadCatalog(username, password, targetDate)

    const materialLines = (materials ?? []).map((m) => `${m.id}: ${m.product_name}`).join('\n')
    const catalogLines = catalog.map((c) => `${c.product} | ${c.color}`).join('\n')

    const prompt = `Ты сопоставляешь названия срезанных цветов между двумя списками.

Наши цветы (разговорные чешские названия, формат "id: название"):
${materialLines}

Каталог поставщика Van Vliet на сегодня (формат "название | цвет", цвет уже структурирован по-английски):
${catalogLines}

Для каждого нашего цветка найди подходящие товары поставщика — тот же вид/род цветка И тот же цвет (если цвет вообще указан в нашем названии). Чешские названия могут сильно отличаться по буквам от латинских/английских/торговых: например "Pivoňka"="Peony"/"Paeonia", "Karafiát"="Dianthus"/"Carnation", "Růže"="Rosa"/"Rose", "Tulipán"="Tulipa"/"Tulip", "Hortenzie"="Hydrangea"/"Hortensia", "Kala"="Calla"/"Zantedeschia", "Slunečnice"="Helianthus"/"Sunflower", "Heřmánek"="Chamomile"/"Matricaria", "Anturium"="Anthurium", "Eukalyptus"="Eucalyptus". Переводи по смыслу, не по совпадению букв.

Верни СТРОГО валидный JSON, без markdown-разметки и пояснений: объект вида {"id_нашего_цветка": ["точное название товара из каталога", ...]}. Названия товаров копируй один в один из каталога поставщика, БЕЗ части " | Цвет" — это в каталоге просто разделитель для тебя, в ответе его быть не должно. От 0 до 4 названий на цветок — только те, в которых ты действительно уверена. Если для цветка нет ни одного уверенного совпадения — не включай его в ответ вообще.`

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const aiData = await aiRes.json()
    if (!aiRes.ok) return json({ ok: false, step: 'anthropic', status: aiRes.status, body: aiData }, 502)

    // Модель думает перед ответом ("thinking"-блок первым) — реальный
    // текст надо искать по type, а не по первому индексу.
    const textBlock = (aiData?.content ?? []).find((b: any) => b?.type === 'text')
    const rawText: string = textBlock?.text ?? ''
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    let mapping: Record<string, string[]>
    try {
      mapping = JSON.parse(cleaned)
    } catch {
      // TEMP DEBUG — показать реальный ответ модели целиком, раз text
      // пришёл пустым/битым, чтобы понять почему, а не гадать.
      return json(
        {
          ok: false,
          step: 'parse',
          raw: rawText,
          stopReason: aiData?.stop_reason,
          usage: aiData?.usage,
          contentBlockCount: Array.isArray(aiData?.content) ? aiData.content.length : null,
          fullResponse: aiData,
        },
        502
      )
    }

    let updatedMaterials = 0
    let totalAliases = 0
    for (const [materialId, productNames] of Object.entries(mapping)) {
      if (!Array.isArray(productNames) || productNames.length === 0) continue
      // Полная замена — устаревшие соответствия для этого цветка не
      // накапливаются, а перезаписываются свежим ответом модели.
      await supabase.from('product_name_aliases').delete().eq('supplier_id', supplier.id).eq('product_sticker_id', materialId)
      // На всякий случай отрезаем " | Цвет", если модель всё же скопировала
      // его вместе с названием из формата каталога в промпте.
      const cores = Array.from(new Set(productNames.map((p) => coreName(p.split(' | ')[0])).filter(Boolean)))
      if (!cores.length) continue
      const rows = cores.map((alias) => ({ supplier_id: supplier.id, alias, product_sticker_id: materialId }))
      const { error } = await supabase.from('product_name_aliases').insert(rows)
      if (!error) {
        updatedMaterials++
        totalAliases += rows.length
      }
    }

    return json({
      ok: true,
      catalogSize: catalog.length,
      materialsConsidered: (materials ?? []).length,
      updatedMaterials,
      totalAliases,
    })
  } catch (e) {
    if (e instanceof UpstreamError) {
      return json({ ok: false, step: e.step, status: e.status, body: e.body }, 502)
    }
    return json({ ok: false, error: String(e) }, 500)
  }
})
