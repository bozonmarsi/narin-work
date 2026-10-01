// Важные даты + адресная книга получателей для клиентского кабинета.
//
// Доступ только по HMAC-токену (lk_auth_token, выдаётся auth-verify) — в
// отличие от дат и дня рождения, у которых есть ещё и email-RPC
// (миграция 20260824070000). Для получателей email-доступ сознательно не
// делаем: там лежат адреса и телефоны третьих лиц, которые сами даже не
// клиенты NARIN, и отдавать их по знанию одного лишь чужого email нельзя.
//
// Действия list/add/delete (даты) сохраняют прежний контракт — виджет на
// проде вызывает именно их, ломать нельзя.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const encoder = new TextEncoder()

const MAX_RECIPIENTS = 50
const MAX_HOLIDAYS = 20

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

function cleanText(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

// Den a měsíc (rok nepovinný) — narozeniny a ručně upravené jmeniny
function cleanDay(v: unknown): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null
}
function cleanMonth(v: unknown): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null
}
function cleanYear(v: unknown): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1900 && n <= new Date().getFullYear() ? n : null
}

const LEAD_OPTIONS = [1, 3, 7]
const DEFAULT_SETTINGS = { lead_days: 3, email_enabled: true, pack_basic: true, pack_cz: false, namedays: false, nameday_names: [] as string[] }
function cleanGiftPrefs(v: unknown, allowed: string[]): string[] {
  return Array.isArray(v) ? [...new Set(v.map(String).filter((x) => allowed.includes(x)))] : []
}
function pragueIso(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(d) // YYYY-MM-DD
}
function cleanBudget(v: unknown): number | null {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 && n <= 100000 ? n : null
}

function cleanHolidays(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((h) => typeof h === 'string')
    .map((h) => h.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, MAX_HOLIDAYS)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { action, token, id, label, date, recurrence, recipient_id } = body

    if (!token || !action) {
      return json({ error: 'token and action required' }, 400)
    }

    const normalizedEmail = await verifyToken(token, Deno.env.get('AUTH_TOKEN_SECRET')!)
    if (!normalizedEmail) {
      return json({ error: 'invalid_token' }, 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Получатель принадлежит этому клиенту? Без этой проверки можно было бы
    // привязать свою дату к чужому получателю и увидеть его имя в списке.
    async function ownsRecipient(recipientId: string, email: string): Promise<boolean> {
      const { data } = await supabase
        .from('recipients')
        .select('id')
        .eq('id', recipientId)
        .ilike('owner_email', email)
        .maybeSingle()
      return !!data
    }

    // Povolené typy dárků (tabulka occasion_gift_types, i ty "připravujeme")
    async function giftKeys(): Promise<string[]> {
      const { data } = await supabase.from('occasion_gift_types').select('key')
      return (data ?? []).map((g: { key: string }) => g.key)
    }

    // ---------- предложенные получатели из истории заказов ----------

    // Книга получателей не наполнится сама, если её нужно заполнять руками —
    // поэтому предлагаем сохранить того, кому реально отправляли цветы.
    // Источник — та же форма оформления заказа, что и всегда: галочка
    // "Příjemce je shodný se zákazníkem" пишет recipient-customer:"yes",
    // когда получатель — сам покупатель. Но галочка необязательна, поэтому
    // дополнительно отсеиваем случаи, где имя получателя совпадает с именем
    // покупателя (кто-то мог вписать свои же данные, не отметив её).
    if (action === 'suggestedRecipients') {
      const { data: orders, error } = await supabase
        .from('tilda_orders')
        .select('order_id, delivery_date, raw_payload')
        .ilike('customer_email', normalizedEmail)
        .eq('status', 'delivered')
        .order('delivery_date', { ascending: false })
        .limit(200)

      if (error) return json({ error: error.message }, 500)

      const { data: existing } = await supabase
        .from('recipients')
        .select('name')
        .ilike('owner_email', normalizedEmail)
      const existingNames = new Set((existing || []).map((r: { name: string }) => r.name.trim().toLowerCase()))

      const byKey = new Map<string, unknown>()
      for (const o of orders || []) {
        const p = (o.raw_payload || {}) as Record<string, unknown>
        if (p['recipient-customer'] === 'yes') continue

        const rFirst = String(p['recipients-name'] || '').trim()
        if (!rFirst) continue
        const rLast = String(p['recipients-lastname'] || '').trim()
        const fullName = [rFirst, rLast].filter(Boolean).join(' ')

        const buyerFirst = String(p['name'] || '').trim()
        const buyerLast = String(p['last-name'] || '').trim()
        const buyerFullName = [buyerFirst, buyerLast].filter(Boolean).join(' ')
        if (fullName.toLowerCase() === buyerFullName.toLowerCase()) continue

        if (existingNames.has(fullName.toLowerCase())) continue

        const key = fullName.toLowerCase()
        if (byKey.has(key)) continue // заказы уже отсортированы по дате — берём самый свежий

        const addressParts = [p['adres'], p['city'], p['psc']].filter(
          (v) => typeof v === 'string' && v.trim()
        )

        byKey.set(key, {
          name: fullName,
          phone: p['recipients-phone-number'] || null,
          address: addressParts.length ? addressParts.join(', ') : null,
          order_id: o.order_id,
          delivery_date: o.delivery_date,
        })
      }

      return json({ suggestions: Array.from(byKey.values()).slice(0, 10) })
    }

    // ---------- nastavení připomínek ----------

    if (action === 'getSettings') {
      // typ dárku je "active" jen když v něm teď něco máme skladem (occ_gift_types_live)
      const [{ data }, { data: gifts }] = await Promise.all([
        supabase.from('occasion_settings').select('*').eq('email', normalizedEmail.toLowerCase()).maybeSingle(),
        supabase.rpc('occ_gift_types_live'),
      ])
      const gift_types = (gifts ?? []).map((g: { key: string; label: string; emoji: string; catalog_url: string | null; available: boolean; in_stock: number }) =>
        ({ key: g.key, label: g.label, emoji: g.emoji, catalog_url: g.catalog_url, active: g.available, in_stock: g.in_stock }))
      return json({ settings: { ...DEFAULT_SETTINGS, ...(data ?? {}) }, saved: !!data, gift_types })
    }

    // ---------- NARIN Dárky: co je skladem + oblíbené u člověka ----------

    if (action === 'giftCatalog') {
      const { data, error } = await supabase.rpc('gift_products')
      if (error) return json({ error: error.message }, 500)
      const products = (data ?? [])
        .filter((g: { available: boolean; sub: string | null }) => g.available && g.sub)
        .map((g: { name: string; sub: string; price: number | null; photo_url: string | null; product_url: string | null }) =>
          ({ name: g.name, sub: g.sub, price: g.price, photo_url: g.photo_url, product_url: g.product_url }))
      return json({ products })
    }

    if (action === 'togglePick') {
      const rid = String(body.id ?? '')
      const productName = cleanText(body.product_name, 200)
      if (!rid || !productName) return json({ error: 'id and product_name required' }, 400)
      if (!(await ownsRecipient(rid, normalizedEmail))) return json({ error: 'recipient_not_found' }, 404)
      if (body.on) {
        const { data: prod } = await supabase.rpc('gift_products')
        if (!(prod ?? []).some((g: { name: string }) => g.name === productName)) return json({ error: 'unknown_product' }, 400)
        const { count } = await supabase.from('recipient_gift_picks').select('*', { count: 'exact', head: true }).eq('recipient_id', rid)
        if ((count ?? 0) >= 12) return json({ error: 'too_many' }, 400)
        const { error } = await supabase.from('recipient_gift_picks').upsert({ recipient_id: rid, product_name: productName })
        if (error) return json({ error: error.message }, 500)
      } else {
        const { error } = await supabase.from('recipient_gift_picks').delete().eq('recipient_id', rid).eq('product_name', productName)
        if (error) return json({ error: error.message }, 500)
      }
      const { data: picks } = await supabase.from('recipient_gift_picks').select('product_name').eq('recipient_id', rid).order('created_at')
      return json({ picks: (picks ?? []).map((x: { product_name: string }) => x.product_name) })
    }

    if (action === 'saveSettings') {
      const row: Record<string, unknown> = { email: normalizedEmail.toLowerCase(), updated_at: new Date().toISOString(), pack_basic: true }
      if ('lead_days' in body) row.lead_days = LEAD_OPTIONS.includes(Number(body.lead_days)) ? Number(body.lead_days) : 3
      for (const f of ['email_enabled', 'pack_cz', 'namedays']) {
        if (f in body) row[f] = !!body[f]
      }
      // jména na jmeniny: jen ta, která jsou v kalendáři (max. 40)
      if ('nameday_names' in body && Array.isArray(body.nameday_names)) {
        const wanted = [...new Set(body.nameday_names.map((n: unknown) => String(n).trim()).filter(Boolean))].slice(0, 40)
        const { data: known } = wanted.length ? await supabase.from('cz_namedays').select('name').in('name', wanted) : { data: [] }
        const ok = new Set((known ?? []).map((k: { name: string }) => k.name))
        row.nameday_names = wanted.filter((n) => ok.has(n))
      }
      const { data, error } = await supabase.from('occasion_settings').upsert(row).select('*').single()
      if (error) return json({ error: error.message }, 500)
      return json({ settings: data, saved: true })
    }

    // Hledání v kalendáři jmen (pro výběr jmenin) — podle začátku jména, i bez diakritiky
    if (action === 'namedaySearch') {
      const q = String(body.q ?? '').trim()
      if (q.length < 2) return json({ results: [] })
      const { data } = await supabase.from('cz_namedays').select('name, month, day').order('name').limit(1000)
      const key = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      const k = key(q)
      const results = (data ?? []).filter((r: { name: string }) => key(r.name).startsWith(k)).slice(0, 8)
      return json({ results })
    }

    // Jediný zdroj "co se kdy slaví" — stejná SQL funkce jako denní rozesílka,
    // takže stránka, widget v hlavičce i e-maily ukazují totéž.
    if (action === 'upcoming') {
      const days = Math.min(400, Math.max(1, Number(body.days) || 400))
      const { data, error } = await supabase.rpc('occasion_upcoming', { p_email: normalizedEmail, p_days: days })
      if (error) return json({ error: error.message }, 500)
      // kdo má dnes a zítra svátek (widget ukáže, jen když má klient jmeniny zapnuté)
      const [{ data: t0 }, { data: t1 }, { data: st }] = await Promise.all([
        supabase.rpc('cz_namedays_on', { p_date: pragueIso(0) }),
        supabase.rpc('cz_namedays_on', { p_date: pragueIso(1) }),
        supabase.from('occasion_settings').select('namedays').eq('email', normalizedEmail.toLowerCase()).maybeSingle(),
      ])
      return json({
        items: (data ?? []).slice(0, 80),
        namedays: { enabled: !!st?.namedays, today: t0 ?? [], tomorrow: t1 ?? [] },
      })
    }

    // ---------- даты ----------

    if (action === 'list') {
      const { data, error } = await supabase
        .from('personal_dates')
        .select('id, label, event_date, recurrence, recipient_id')
        .ilike('email', normalizedEmail)
        .order('event_date', { ascending: true })

      if (error) return json({ error: error.message }, 500)
      return json({ dates: data })
    }

    if (action === 'add') {
      if (!label || !date) {
        return json({ error: 'label and date required' }, 400)
      }

      if (recipient_id && !(await ownsRecipient(recipient_id, normalizedEmail))) {
        return json({ error: 'recipient_not_found' }, 404)
      }

      const validRecurrence = ['once', 'monthly', 'yearly'].includes(recurrence) ? recurrence : 'yearly'

      const { data, error } = await supabase
        .from('personal_dates')
        .insert({
          email: normalizedEmail,
          label,
          event_date: date,
          recurrence: validRecurrence,
          recipient_id: recipient_id || null,
        })
        .select()
        .single()

      if (error) return json({ error: error.message }, 500)
      return json({ date: data })
    }

    if (action === 'delete') {
      if (!id) return json({ error: 'id required' }, 400)

      const { error } = await supabase
        .from('personal_dates')
        .delete()
        .eq('id', id)
        .ilike('email', normalizedEmail)

      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    // ---------- получатели ----------

    if (action === 'listRecipients') {
      const { data, error } = await supabase
        .from('recipients')
        .select('id, name, relation, phone, address, address_lat, address_lng, note, holidays, created_at, birthday_day, birthday_month, birthday_year, budget, gift_prefs, autopilot')
        .ilike('owner_email', normalizedEmail)
        .order('created_at', { ascending: true })

      if (error) return json({ error: error.message }, 500)

      // Co už tomu člověku přišlo — podle jména příjemce v objednávkách klienta.
      // Pomáhá nevybrat podruhé totéž ("Minule: Pivoňky, 12. 3.").
      const { data: orders } = await supabase
        .from('tilda_orders')
        .select('delivery_date, created_at, recipient_name, order_total, status, raw_payload')
        .ilike('customer_email', normalizedEmail)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(300)
      const ids = (data ?? []).map((r) => r.id)
      const { data: pickRows } = ids.length
        ? await supabase.from('recipient_gift_picks').select('recipient_id, product_name').in('recipient_id', ids).order('created_at')
        : { data: [] }
      const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
      const enriched = (data ?? []).map((r) => {
        const target = norm(r.name)
        const single = !target.includes(' ')
        const last_orders = (orders ?? [])
          .filter((o) => {
            const p = (o.raw_payload ?? {}) as Record<string, unknown>
            const first = norm(p['recipients-name'])
            const full = norm([p['recipients-name'], p['recipients-lastname']].filter(Boolean).join(' ')) || norm(o.recipient_name)
            return !!target && (full === target || (single && first === target))
          })
          .slice(0, 3)
          .map((o) => {
            const products = ((o.raw_payload as { payment?: { products?: { name?: string }[] } })?.payment?.products ?? [])
              .map((x) => String(x.name ?? '').replace(/&amp;/g, '&'))
              .filter(Boolean)
            return { date: o.delivery_date ?? String(o.created_at).slice(0, 10), products, total: o.order_total }
          })
        const picks = (pickRows ?? []).filter((x: { recipient_id: string }) => x.recipient_id === r.id).map((x: { product_name: string }) => x.product_name)
        return { ...r, last_orders, picks }
      })
      return json({ recipients: enriched })
    }

    if (action === 'addRecipient') {
      const name = cleanText(body.name, 80)
      if (!name) return json({ error: 'name required' }, 400)

      const { count } = await supabase
        .from('recipients')
        .select('id', { count: 'exact', head: true })
        .ilike('owner_email', normalizedEmail)

      if ((count ?? 0) >= MAX_RECIPIENTS) {
        return json({ error: 'too_many_recipients' }, 400)
      }

      const { data, error } = await supabase
        .from('recipients')
        .insert({
          owner_email: normalizedEmail,
          name,
          relation: cleanText(body.relation, 40),
          phone: cleanText(body.phone, 40),
          address: cleanText(body.address, 300),
          address_lat: typeof body.address_lat === 'number' ? body.address_lat : null,
          address_lng: typeof body.address_lng === 'number' ? body.address_lng : null,
          note: cleanText(body.note, 300),
          holidays: cleanHolidays(body.holidays),
          birthday_day: cleanDay(body.birthday_day),
          birthday_month: cleanMonth(body.birthday_month),
          birthday_year: cleanYear(body.birthday_year),
          budget: cleanBudget(body.budget),
          gift_prefs: cleanGiftPrefs(body.gift_prefs, await giftKeys()),
          autopilot: !!body.autopilot,
        })
        .select()
        .single()

      if (error) return json({ error: error.message }, 500)
      return json({ recipient: data })
    }

    if (action === 'updateRecipient') {
      if (!id) return json({ error: 'id required' }, 400)

      // Обновляем только те поля, что реально пришли — иначе частичное
      // сохранение из формы затирало бы остальные данные получателя.
      const patch: Record<string, unknown> = {}
      if ('name' in body) {
        const name = cleanText(body.name, 80)
        if (!name) return json({ error: 'name required' }, 400)
        patch.name = name
      }
      if ('relation' in body) patch.relation = cleanText(body.relation, 40)
      if ('phone' in body) patch.phone = cleanText(body.phone, 40)
      if ('address' in body) patch.address = cleanText(body.address, 300)
      if ('address_lat' in body) patch.address_lat = typeof body.address_lat === 'number' ? body.address_lat : null
      if ('address_lng' in body) patch.address_lng = typeof body.address_lng === 'number' ? body.address_lng : null
      if ('note' in body) patch.note = cleanText(body.note, 300)
      if ('holidays' in body) patch.holidays = cleanHolidays(body.holidays)
      if ('budget' in body) patch.budget = cleanBudget(body.budget)
      if ('gift_prefs' in body) patch.gift_prefs = cleanGiftPrefs(body.gift_prefs, await giftKeys())
      if ('autopilot' in body) patch.autopilot = !!body.autopilot
      if ('birthday_day' in body || 'birthday_month' in body) {
        patch.birthday_day = cleanDay(body.birthday_day)
        patch.birthday_month = cleanMonth(body.birthday_month)
        patch.birthday_year = cleanYear(body.birthday_year)
        if (!patch.birthday_day || !patch.birthday_month) {
          patch.birthday_day = null; patch.birthday_month = null; patch.birthday_year = null
        }
      }

      if (!Object.keys(patch).length) return json({ error: 'nothing to update' }, 400)

      const { data, error } = await supabase
        .from('recipients')
        .update(patch)
        .eq('id', id)
        .ilike('owner_email', normalizedEmail)
        .select()
        .maybeSingle()

      if (error) return json({ error: error.message }, 500)
      if (!data) return json({ error: 'recipient_not_found' }, 404)
      return json({ recipient: data })
    }

    if (action === 'deleteRecipient') {
      if (!id) return json({ error: 'id required' }, 400)

      // Даты этого получателя не удаляем — FK стоит ON DELETE SET NULL,
      // напоминание останется как обычная дата, без привязки к человеку.
      const { error } = await supabase
        .from('recipients')
        .delete()
        .eq('id', id)
        .ilike('owner_email', normalizedEmail)

      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
