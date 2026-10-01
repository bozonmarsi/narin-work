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

const LEAD_OPTIONS = [1, 2, 3, 5, 7, 14]
const GIFT_KEYS = ['kytice', 'dort', 'jahody', 'plysak', 'na_vas']
function cleanGiftPrefs(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((x) => GIFT_KEYS.includes(String(x))).map(String))] : []
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

    // Jmeniny: výslovně zadané (ruční oprava) mají přednost, jinak podle jména z kalendáře
    async function namedayPatch(name: string, b: Record<string, unknown>) {
      if ('nameday_day' in b || 'nameday_month' in b) {
        const d = cleanDay(b.nameday_day), m = cleanMonth(b.nameday_month)
        return d && m ? { nameday_day: d, nameday_month: m } : { nameday_day: null, nameday_month: null }
      }
      if (!name) return {}
      const { data } = await supabase.rpc('cz_nameday_for', { p_name: name })
      const row = Array.isArray(data) ? data[0] : null
      return row ? { nameday_day: row.day, nameday_month: row.month } : { nameday_day: null, nameday_month: null }
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
      const { data } = await supabase.from('occasion_settings').select('*').eq('email', normalizedEmail.toLowerCase()).maybeSingle()
      return json({
        settings: data ?? { lead_days: 3, email_enabled: true, pack_basic: true, pack_cz: false, namedays: false },
        saved: !!data,
      })
    }

    if (action === 'saveSettings') {
      const row: Record<string, unknown> = { email: normalizedEmail.toLowerCase(), updated_at: new Date().toISOString() }
      if ('lead_days' in body) row.lead_days = LEAD_OPTIONS.includes(Number(body.lead_days)) ? Number(body.lead_days) : 3
      for (const f of ['email_enabled', 'pack_basic', 'pack_cz', 'namedays']) {
        if (f in body) row[f] = !!body[f]
      }
      const { data, error } = await supabase.from('occasion_settings').upsert(row).select('*').single()
      if (error) return json({ error: error.message }, 500)
      return json({ settings: data, saved: true })
    }

    // Jediný zdroj "co se kdy slaví" — stejná SQL funkce jako denní rozesílka,
    // takže stránka, widget v hlavičce i e-maily ukazují totéž.
    if (action === 'upcoming') {
      const days = Math.min(400, Math.max(1, Number(body.days) || 400))
      const { data, error } = await supabase.rpc('occasion_upcoming', { p_email: normalizedEmail, p_days: days })
      if (error) return json({ error: error.message }, 500)
      return json({ items: (data ?? []).slice(0, 80) })
    }

    // Náhled jmenin při psaní jména (bez uložení)
    if (action === 'namedayFor') {
      const { data } = await supabase.rpc('cz_nameday_for', { p_name: cleanText(body.name, 80) ?? '' })
      const row = Array.isArray(data) ? data[0] : null
      return json({ nameday: row ? { month: row.month, day: row.day, name: row.name } : null })
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
        .select('id, name, relation, phone, address, address_lat, address_lng, note, holidays, created_at, birthday_day, birthday_month, birthday_year, nameday_day, nameday_month, budget, gift_prefs, autopilot')
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
        return { ...r, last_orders }
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
          gift_prefs: cleanGiftPrefs(body.gift_prefs),
          autopilot: !!body.autopilot,
          ...(await namedayPatch(name, body)),
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
      if ('gift_prefs' in body) patch.gift_prefs = cleanGiftPrefs(body.gift_prefs)
      if ('autopilot' in body) patch.autopilot = !!body.autopilot
      if ('birthday_day' in body || 'birthday_month' in body) {
        patch.birthday_day = cleanDay(body.birthday_day)
        patch.birthday_month = cleanMonth(body.birthday_month)
        patch.birthday_year = cleanYear(body.birthday_year)
        if (!patch.birthday_day || !patch.birthday_month) {
          patch.birthday_day = null; patch.birthday_month = null; patch.birthday_year = null
        }
      }
      // nové jméno → přepočítat jmeniny (pokud je klient výslovně neupravil)
      if ('nameday_day' in body || 'nameday_month' in body || typeof patch.name === 'string') {
        Object.assign(patch, await namedayPatch(String(patch.name ?? ''), body))
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
