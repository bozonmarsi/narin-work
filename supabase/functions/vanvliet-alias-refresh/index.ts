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
// Вызывается либо по расписанию через pg_cron (свой секрет CRON_SECRET,
// см. миграцию), либо вручную кнопкой из интерфейса менеджером (тогда
// приходит его настоящая сессия) — платформенная проверка JWT для этой
// функции отключена в Dashboard, поэтому оба случая проверяем сами ниже.
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

// Страховка от ошибки ИИ, а не только просьба в промпте — 12.09.2026
// один прогон перепутал род у доброго десятка цветов (пионы -> розы,
// тюльпаны -> розы/гербера, аллиум -> ирис и т.д.), и это тихо жило в
// базе неделями, пока не нашли руками. Модель иногда всё равно путает
// род, несмотря на явный запрет в промпте — значит нужна отдельная,
// не-ИИ проверка поверх её ответа: если ни одно ожидаемое латинское/
// английское слово рода не встречается в предложенном товаре, ответ
// отбрасывается (для этого цветка — как будто модель ничего не нашла),
// а не сохраняется как есть. Смысл ключей — начало НАШЕГО названия без
// диакритики и в нижнем регистре, значения — что обязано быть в
// названии поставщика (частичное совпадение по подстроке).
const GENUS_KEYWORDS: Record<string, string[]> = {
  allium: ['allium'],
  anturium: ['anthurium'],
  calla: ['calla'],
  kala: ['calla'],
  eukalyptus: ['euc'],
  eustoma: ['eust'],
  gerbera: ['gerbera'],
  hermanek: ['chamomile', 'matricaria'],
  hortenezie: ['hydra', 'hortensia'],
  hortenzie: ['hydra', 'hortensia'],
  hyacint: ['hyacin'],
  karafiat: ['dia ', 'dia.', 'dianthus', 'carnation'],
  leucadendron: ['leucadendron'],
  leucospermum: ['leucospermum'],
  lilie: ['lil'],
  magnolie: ['magnolia'],
  matthiola: ['matthiola'],
  mimosa: ['mimosa'],
  narcis: ['narcis', 'daffodil'],
  peony: ['peony', 'paeonia'],
  pivonka: ['peony', 'paeonia'],
  protea: ['protea'],
  ranunculus: ['ranuncul'],
  ruze: ['rosa', 'rose'],
  slunecnice: ['helianthus'],
  tulipan: ['tulip'],
}

const COMBINING_MARKS_START = 0x0300
const COMBINING_MARKS_END = 0x036f

function stripDiacritics(s: string): string {
  return Array.from(s.normalize('NFD'))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code < COMBINING_MARKS_START || code > COMBINING_MARKS_END
    })
    .join('')
}

function genusKeywordsFor(ourName: string): string[] | null {
  const normalized = stripDiacritics(ourName).toLowerCase()
  for (const [prefix, keywords] of Object.entries(GENUS_KEYWORDS)) {
    if (normalized.startsWith(prefix)) return keywords
  }
  return null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Проверка по ГРАНИЦЕ слова ПЕРЕД ключом, не по любому вхождению
// подстроки — просто includes() однажды чуть не подвёл прямо здесь:
// ключ "euc" (для Eukalyptus) сам является подстрокой
// "Leuc-adendron"/"Leuc-ospermum" — оба этих рода тоже есть в нашем
// каталоге, и без проверки границы "Leucadendron" сошёл бы за
// эвкалипт. Граница нужна именно ПЕРЕД ключом (не после) — иначе
// сломались бы законные совпадения вроде "Lillium" (двойная L, после
// "lil" сразу ещё одна "l", там границы нет).
function containsGenusWord(text: string, keyword: string): boolean {
  const re = new RegExp('\\b' + escapeRegExp(keyword), 'i')
  return re.test(text)
}

// Возвращает только те предложенные моделью названия, что реально
// содержат ожидаемое слово рода — остальные тихо роняем, не доверяя
// модели вслепую там, где можем проверить сами. Если для нашего цветка
// нет записи в GENUS_KEYWORDS (новый вид, ещё не добавили) — проверка
// пропускается целиком, как и раньше, до этой правки.
function filterByGenus(ourName: string, candidates: string[]): string[] {
  const keywords = genusKeywordsFor(ourName)
  if (!keywords) return candidates
  return candidates.filter((c) => keywords.some((k) => containsGenusWord(c, k)))
}

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

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const cronSecret = Deno.env.get('CRON_SECRET')
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')

    let authorized = Boolean(cronSecret) && token === cronSecret
    if (!authorized && token) {
      // Ручной вызов кнопкой из интерфейса — приходит настоящая сессия
      // менеджера (supabase.functions.invoke подставляет её сама).
      const { data: userData } = await supabase.auth.getUser(token)
      if (userData?.user) {
        const { data: profile } = await supabase.from('users').select('role').eq('id', userData.user.id).maybeSingle()
        authorized = profile?.role === 'manager'
      }
    }
    if (!authorized) return json({ error: 'unauthorized' }, 401)

    const username = Deno.env.get('VANVLIET_USERNAME')!
    const password = Deno.env.get('VANVLIET_PASSWORD')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!username || !password) return json({ error: 'missing_vanvliet_credentials' }, 500)
    if (!anthropicKey) return json({ error: 'missing_anthropic_key' }, 500)

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

    // Подтверждённые человеком соответствия (вписаны вручную или
    // "Запомнить соответствие" в поиске) — единственная форма "обучения"
    // на этой архитектуре: тонкой настройки модели тут нет, но реальные
    // проверенные примеры в промпте задают ей верную планку для похожих
    // неочевидных случаев (как с Heřmánek → Chamomile).
    const { data: manualAliases } = await supabase
      .from('product_name_aliases')
      .select('product_sticker_id, alias')
      .eq('supplier_id', supplier.id)
      .eq('is_manual', true)
    const materialNameByIdForExamples = new Map((materials ?? []).map((m) => [m.id, m.product_name]))
    const manualExampleLines = (manualAliases ?? [])
      .map((a) => {
        const name = materialNameByIdForExamples.get(a.product_sticker_id)
        return name ? `${name} = ${a.alias}` : null
      })
      .filter((l): l is string => Boolean(l))
      .slice(0, 40)
    const examplesBlock =
      manualExampleLines.length > 0
        ? `\n\nУже подтверждённые человеком примеры сопоставления (реальные, проверенные — ориентируйся на них при похожих неочевидных случаях):\n${manualExampleLines.join('\n')}\n`
        : ''

    const prompt = `Ты работаешь в цветочном интернет-магазине и сверяешь прайс-лист поставщика с нашим ассортиментом, чтобы найти, под каким торговым названием у поставщика продаётся тот же товар, что и у нас.${examplesBlock}

Наш ассортимент (разговорные чешские названия товаров, формат "id: название"):
${materialLines}

Прайс-лист поставщика Van Vliet на сегодня (формат "торговое название | цвет"):
${catalogLines}

Для каждой нашей позиции найди подходящие товары в прайс-листе поставщика — тот же цветок И тот же цвет упаковки (если цвет вообще указан в нашем названии). Одни и те же цветы в разных странах продают под разными торговыми названиями: например у нас "Pivoňka" — у поставщика это "Peony" или "Paeonia"; "Karafiát" — "Dianthus"/"Carnation"; "Růže" — "Rosa"/"Rose"; "Tulipán" — "Tulipa"/"Tulip"; "Hortenzie" — "Hydrangea"/"Hortensia"; "Kala" — "Calla"/"Zantedeschia"; "Slunečnice" — "Helianthus"/"Sunflower"; "Heřmánek" — "Chamomile"/"Matricaria"; "Anturium" — "Anthurium"; "Eukalyptus" — "Eucalyptus". Сопоставляй по смыслу (это тот же самый товар под местным названием), а не по случайному совпадению букв.

Цвет "N.A." или "Misc" у поставщика — это не "другой цвет", это просто "поставщик не указал цвет в этом поле". Такую позицию нельзя отбрасывать только из-за этого — раз товар (тот же цветок) подходит, а цвет поставщик не уточнил, считай это допустимым совпадением, как если бы цвет не был указан вовсе.

Если у поставщика для нужного цветка вообще нет варианта точно нужного цвета (даже среди "N.A."/"Misc"), но сам цветок (то же название, тот же вид) есть — предложи то, что есть, ближайшее по цвету, а не пропускай позицию совсем. Не предложить ничего клиенту хуже, чем предложить не идеальный оттенок того же самого цветка — менеджер сам решит на месте. Правило "не подходит другой цветок с тем же цветом" (см. выше про Allium/Iris) при этом не отменяется — оно про РОД/ВИД, а не про цвет, и остаётся железным всегда.

Совпадение ТОЛЬКО по цвету упаковки, когда сам товар другой — грубая ошибка витрины, так делать нельзя (покупатель получит не тот цветок). Например если у нас позиция "Allium" (декоративный лук), товар с другим названием, но тем же цветом (Iris, Gerbera, Ornithogalum, Antirrhinum и т.п.) НЕ подходит, даже если цвет совпал в точности. Сверяй сначала сам товар, цвет — только дополнительный фильтр внутри уже правильно найденного товара.

Верни СТРОГО валидный JSON, без markdown-разметки и пояснений: объект вида {"id_нашей_позиции": ["точное торговое название из прайс-листа", ...]}. Названия копируй один в один из прайс-листа поставщика, БЕЗ части " | Цвет" — это в прайс-листе просто разделитель для тебя, в ответе его быть не должно. От 0 до 4 названий на позицию — только те, в которых ты действительно уверена. Если для позиции нет ни одного уверенного совпадения — не включай её в ответ вообще.`

    // Раньше здесь был повтор до 3 раз (на случай ложного отказа
    // классификатора Anthropic на плотный список ботанических
    // названий) — но настоящую причину отказа починили самой
    // формулировкой промпта (торговая рамка вместо таксономической),
    // и повтор больше не воспроизводится. Три подряд тяжёлых вызова
    // (adaptive thinking + effort:high) сами по себе упирались в лимит
    // памяти/CPU этого проекта (Nano) — "not enough compute resources".
    // Один вызов — и дешевле, и укладывается в лимит.
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 24000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const aiData = await aiRes.json()

    if (!aiRes.ok) return json({ ok: false, step: 'anthropic', status: aiRes.status, body: aiData }, 502)
    if (aiData?.stop_reason === 'refusal') {
      return json({ ok: false, step: 'anthropic_refusal', body: aiData }, 502)
    }

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

    const materialNameById = new Map((materials ?? []).map((m) => [m.id, m.product_name]))

    let updatedMaterials = 0
    let totalAliases = 0
    let prunedMaterials = 0
    // Читаемый отчёт "наше название -> что сохранили" — по имени, не по id,
    // чтобы результат можно было проверить глазами.
    const report: { name: string; aliases: string[] }[] = []
    // ВСЕ цветы, что отправляли модели — не только те, что попали в её
    // ответ. Если модель сегодня не нашла уверенного совпадения (цветок,
    // например, не сезонный прямо сейчас), старые алиасы для него надо
    // УДАЛИТЬ, а не молча оставить — иначе ошибка одного неудачного
    // прогона (например, от подбора не по тому роду) остаётся в базе
    // навсегда, пока модель случайно не найдёт для этого же цветка что-то
    // новое. Пустой список соответствий — честное "не знаем", а не старое
    // неверное значение.
    const materialsWithManualAlias = new Set((manualAliases ?? []).map((a) => a.product_sticker_id))

    let genusRejected = 0
    for (const m of materials ?? []) {
      const rawNames = Array.isArray(mapping[m.id]) ? mapping[m.id] : []
      const genusChecked = filterByGenus(m.product_name, rawNames)
      genusRejected += rawNames.length - genusChecked.length
      const cores = Array.from(new Set(genusChecked.map((p) => coreName(p.split(' | ')[0])).filter(Boolean)))

      // Стираем и переписываем только то, что сама модель когда-то
      // предложила (is_manual = false) — подтверждённое человеком
      // никогда не трогаем здесь, иначе ручная правка держалась бы
      // ровно до следующего прогона.
      await supabase
        .from('product_name_aliases')
        .delete()
        .eq('supplier_id', supplier.id)
        .eq('product_sticker_id', m.id)
        .eq('is_manual', false)

      if (cores.length === 0) {
        prunedMaterials++
        // Сбрасываем "есть/нет у поставщика" в "не проверено" только
        // если для цветка вообще не осталось НИ ОДНОГО алиаса (ни
        // ИИ-шного, ни ручного) — если человек уже подтвердил своё
        // соответствие, сканеру по-прежнему есть что проверять, статус
        // трогать не нужно.
        if (!materialsWithManualAlias.has(m.id)) {
          await supabase
            .from('product_stickers')
            .update({ vanvliet_in_stock: null, vanvliet_stock_checked_at: null })
            .eq('id', m.id)
        }
        continue
      }
      const rows = cores.map((alias) => ({ supplier_id: supplier.id, alias, product_sticker_id: m.id, is_manual: false }))
      const { error } = await supabase.from('product_name_aliases').insert(rows)
      if (!error) {
        updatedMaterials++
        totalAliases += rows.length
        report.push({ name: materialNameById.get(m.id) ?? m.id, aliases: cores })
      }
    }

    return json({
      ok: true,
      catalogSize: catalog.length,
      report,
      materialsConsidered: (materials ?? []).length,
      updatedMaterials,
      totalAliases,
      prunedMaterials,
      genusRejected,
    })
  } catch (e) {
    if (e instanceof UpstreamError) {
      return json({ ok: false, step: e.step, status: e.status, body: e.body }, 502)
    }
    return json({ ok: false, error: String(e) }, 500)
  }
})
