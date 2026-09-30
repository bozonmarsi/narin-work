// Дважды в день (см. миграцию с pg_cron) проверяет, что из наших
// товаров-охапок есть в каталоге Van Vliet НА ЗАВТРА (не на сегодня —
// заказ сегодня всё равно не успеет повлиять на сегодняшнюю доставку),
// и проставляет product_stickers.vanvliet_in_stock — дальше это уже
// подхватывает существующий триггер tg_sync_ohapka_availability и сам
// решает, показывать товар клиенту на сайте или нет (правило: наш
// остаток > 0 ИЛИ у поставщика есть на завтра — прячем только то, чего
// нет нигде).
//
// ТОЛЬКО ЧТЕНИЕ каталога поставщика — вызывает уже существующую
// vanvliet-search с fullCatalog:true (та же функция, что использует
// панель менеджера для живого поиска), никогда не трогает /v1/cart —
// добавление в корзину у Van Vliet необратимо создаёт обязательство
// купить, это делает только явный клик "Купить" в интерфейсе.
//
// Вызывается либо по расписанию через pg_cron (свой секрет CRON_SECRET,
// см. миграцию), либо вручную (тогда приходит настоящая сессия
// менеджера) — платформенная проверка JWT для этой функции отключена в
// Dashboard, поэтому оба случая проверяем сами ниже (тот же паттерн,
// что и у vanvliet-alias-refresh).
//
// Секреты: SUPABASE_SERVICE_ROLE_KEY (для вызова vanvliet-search),
// CRON_SECRET.

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

// Тот же хвост, что и в панели/алиас-рефреше — размер, граммовка,
// штучность и партия меняются у поставщика день ото дня, сам цветок при
// этом тот же. Алиасы в product_name_aliases уже сохранены в этом виде,
// так что каталог поставщика нужно нормализовать так же, чтобы сравнение
// вообще имело смысл.
function coreName(name: string): string {
  return name
    .replace(/\(\s*imp\s*\)/gi, ' ')
    .replace(/\(\s*\d+\s*\)/g, ' ')
    .replace(/\b\d+([.,]\d+)?\s*cm\b/gi, ' ')
    .replace(/\b\d+([.,]\d+)?\s*gram\b/gi, ' ')
    .replace(/\b\d+\s*st\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

type CatalogItem = { product: string; color: string; key: number; stock: number; price: number }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const cronSecret = Deno.env.get('CRON_SECRET')
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')

    let authorized = Boolean(cronSecret) && token === cronSecret
    if (!authorized && token) {
      const { data: userData } = await supabase.auth.getUser(token)
      if (userData?.user) {
        const { data: profile } = await supabase.from('users').select('role').eq('id', userData.user.id).maybeSingle()
        authorized = profile?.role === 'manager'
      }
    }
    if (!authorized) return json({ error: 'unauthorized' }, 401)

    const { data: supplier } = await supabase.from('suppliers').select('id').eq('name', 'Van Vliet').maybeSingle()
    if (!supplier) return json({ error: 'van_vliet_supplier_not_found' }, 500)

    // Архивные позиции больше не продаются — незачем тратить проверку на
    // то, есть ли они у поставщика.
    const [{ data: materials }, { data: aliases }] = await Promise.all([
      supabase.from('product_stickers').select('id, product_name').eq('category', 'ohapka').eq('archived', false),
      supabase.from('product_name_aliases').select('alias, product_sticker_id').eq('supplier_id', supplier.id),
    ])

    // Только сырьё, у которого вообще есть сохранённое соответствие с
    // Van Vliet — без алиаса нечего сравнивать, столбец у него остаётся
    // NULL (не трогаем), и триггер тогда смотрит только на наш остаток,
    // как и раньше.
    const aliasesByMaterial = new Map<string, string[]>()
    for (const a of aliases ?? []) {
      const list = aliasesByMaterial.get(a.product_sticker_id) ?? []
      list.push(a.alias.toLowerCase())
      aliasesByMaterial.set(a.product_sticker_id, list)
    }
    const materialsWithAlias = (materials ?? []).filter((m) => aliasesByMaterial.has(m.id))
    if (materialsWithAlias.length === 0) {
      return json({ ok: true, checked: 0, note: 'no materials with vanvliet aliases yet' })
    }

    // Завтра, не сегодня — на сегодняшний остаток заказ уже не повлияет
    // (доставка +1 день), проверять имеет смысл дату, на которую реально
    // можно успеть довезти. Полдень как опорная точка — подальше от
    // границ перехода на летнее/зимнее время при прибавлении дня.
    const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' })
    const tomorrow = new Date(`${todayStr}T12:00:00`)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const targetDate = tomorrow.toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' })
    const searchRes = await fetch(`${supabaseUrl}/functions/v1/vanvliet-search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fullCatalog: true, targetDate }),
    })
    const searchData = await searchRes.json()
    if (!searchRes.ok || searchData?.ok === false) {
      return json({ ok: false, step: 'vanvliet-search', status: searchRes.status, body: searchData }, 502)
    }

    const catalog: CatalogItem[] = searchData.catalog ?? []
    const inStockItems = catalog.filter((c) => c.stock > 0)
    // Множество нормализованных названий, у которых реально есть остаток
    // (stock > 0) — сравниваем алиасы именно с ним.
    const inStockNames = new Set(inStockItems.map((c) => coreName(c.product)))
    // Самая низкая цена среди позиций в наличии с этим нормализованным
    // названием — для подсказки по цене (см. миграцию
    // vanvliet_price_recommendation) нужна именно самая дешёвая, а не
    // любая случайная партия/сорт под тем же алиасом.
    const minPriceByName = new Map<string, number>()
    for (const c of inStockItems) {
      const name = coreName(c.product)
      const prev = minPriceByName.get(name)
      if (prev === undefined || c.price < prev) minPriceByName.set(name, c.price)
    }

    let updated = 0
    const report: { name: string; inStock: boolean; cheapestPrice: number | null }[] = []
    const checkedAt = new Date().toISOString()
    for (const m of materialsWithAlias) {
      const materialAliases = aliasesByMaterial.get(m.id) ?? []
      const inStock = materialAliases.some((alias) => inStockNames.has(alias))
      // Самое дешёвое среди ВСЕХ алиасов этого цветка, не только первого
      // совпавшего — сорта/расфасовки одного и того же цветка у
      // поставщика стоят по-разному.
      let cheapestPrice: number | null = null
      for (const alias of materialAliases) {
        const price = minPriceByName.get(alias)
        if (price !== undefined && (cheapestPrice === null || price < cheapestPrice)) cheapestPrice = price
      }
      const { error } = await supabase
        .from('product_stickers')
        .update({ vanvliet_in_stock: inStock, vanvliet_stock_checked_at: checkedAt, vanvliet_cheapest_price: cheapestPrice })
        .eq('id', m.id)
      if (!error) {
        updated++
        report.push({ name: m.product_name, inStock, cheapestPrice })
      }
    }

    return json({ ok: true, catalogSize: catalog.length, materialsChecked: materialsWithAlias.length, updated, report })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
