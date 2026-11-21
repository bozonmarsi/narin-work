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

type CatalogItem = {
  product: string; color: string; key: number; stock: number; price: number
  quality?: string; grower?: string; photo?: string; orderPer?: number
}

// One row per variety in vv_catalog: same name from another grower or of
// another quality is a separate variant the owner can reject on its own.
function sigOf(c: CatalogItem): string {
  return [c.product, c.color, c.grower ?? '', c.quality ?? ''].map((x) => String(x ?? '').trim().toLowerCase()).join('|')
}

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
    const [{ data: materials }, { data: aliases }, { data: blocks }] = await Promise.all([
      supabase.from('product_stickers').select('id, product_name').eq('category', 'ohapka').eq('archived', false),
      // Only links the owner approved count. Suggestions and rejected links
      // never change what the site shows.
      supabase.from('product_name_aliases').select('alias, product_sticker_id, is_primary')
        .eq('supplier_id', supplier.id).eq('status', 'approved'),
      supabase.from('vv_variant_blocks').select('sig, product_sticker_id'),
    ])
    const aliasesByMaterial = new Map<string, string[]>()
    const primaryByMaterial = new Map<string, string>()
    for (const a of aliases ?? []) {
      const core = coreName(a.alias)
      const list = aliasesByMaterial.get(a.product_sticker_id) ?? []
      list.push(core)
      aliasesByMaterial.set(a.product_sticker_id, list)
      if (a.is_primary) primaryByMaterial.set(a.product_sticker_id, core)
    }
    const blocked = new Set((blocks ?? []).map((b) => `${b.product_sticker_id}#${b.sig}`))
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
    const nowIso = new Date().toISOString()

    // 1. Memory of the Van Vliet catalogue: every variety with photo, price
    //    per stem (without DPH), quality, grower, pack size and stock.
    //    The price is kept when the variety is gone, so it is never lost.
    const bySig = new Map<string, CatalogItem>()
    for (const c of catalog) {
      const sig = sigOf(c)
      const prev = bySig.get(sig)
      if (!prev || (c.stock > 0 && (prev.stock <= 0 || c.price < prev.price))) bySig.set(sig, c)
    }
    const rows = Array.from(bySig.entries()).map(([sig, c]) => {
      const r: Record<string, unknown> = {
        sig, vv_key: c.key, product: c.product, core: coreName(c.product), color: c.color,
        quality: c.quality ?? null, grower: c.grower ?? null, photo: c.photo || null,
        order_per: c.orderPer ?? null, stock: c.stock, last_seen: nowIso,
      }
      if (c.price > 0) r.price = c.price
      if (c.stock > 0) r.last_in_stock_at = nowIso
      return r
    })
    let catalogSaved = 0
    for (let i = 0; i < rows.length; i += 400) {
      const part = rows.slice(i, i + 400)
      const { error } = await supabase.from('vv_catalog').upsert(part, { onConflict: 'sig' })
      if (!error) catalogSaved += part.length
    }
    const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' })
    const hist = rows.filter((r) => r.price != null).map((r) => ({ sig: r.sig, day, price: r.price, stock: r.stock }))
    for (let i = 0; i < hist.length; i += 400) {
      await supabase.from('vv_price_history').upsert(hist.slice(i, i + 400), { onConflict: 'sig,day' })
    }

    // 2. Per flower: in stock tomorrow (approved links, minus rejected
    //    variants) and the price of the primary variety (or the cheapest).
    const inStockItems = Array.from(bySig.entries()).filter(([, c]) => c.stock > 0)
    let updated = 0
    const report: { name: string; inStock: boolean; cheapestPrice: number | null }[] = []
    const checkedAt = nowIso
    for (const m of materialsWithAlias) {
      const cores = new Set(aliasesByMaterial.get(m.id) ?? [])
      const eligible = inStockItems.filter(([sig, c]) => cores.has(coreName(c.product)) && !blocked.has(`${m.id}#${sig}`))
      const inStock = eligible.length > 0
      const primary = primaryByMaterial.get(m.id)
      const pool = primary ? eligible.filter(([, c]) => coreName(c.product) === primary) : []
      const prices = (pool.length ? pool : eligible).map(([, c]) => c.price).filter((p) => p > 0)
      const cheapestPrice = prices.length ? Math.min(...prices) : null
      // The last known price stays when nothing is offered today.
      const patch: Record<string, unknown> = { vanvliet_in_stock: inStock, vanvliet_stock_checked_at: checkedAt }
      if (cheapestPrice !== null) patch.vanvliet_cheapest_price = cheapestPrice
      const { error } = await supabase.from('product_stickers').update(patch).eq('id', m.id)
      if (!error) {
        updated++
        report.push({ name: m.product_name, inStock, cheapestPrice })
      }
    }

    return json({ ok: true, catalogSize: catalog.length, catalogSaved, materialsChecked: materialsWithAlias.length, updated, report })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
