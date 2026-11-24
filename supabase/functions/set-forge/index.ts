// Кузница сетов (Магазин -> Кузница сетов в narin-work).
//
//   { action: "import", file_name, file_b64 }
//       -> разбирает Excel прайса Голландии Van Vliet ("Pricelists_DD-MM-YYYY.xlsx",
//          колонки Zbozi / Objednat po / Barva / Kvalita / Pestitel / Puvod / Tags /
//          delka / Baleni / Bunch / Bucket) в forge_pricelists + forge_pricelist_items.
//   { action: "generate", pricelist_id, count?, hint? }
//       -> Claude придумывает сеты из 2-4 охапок по этому прайсу, каждое название
//          цветка проверяется по прайсу (точно как в каталоге Van Vliet), количество
//          округляется до упаковки, себестоимость = Bunch x 1,21 DPH x штук.
//          Пишет в forge_candidates (status pending).
//
// Только менеджер (его сессия Supabase). Секреты: ANTHROPIC_API_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@1.12.0'
import * as XLSX from 'npm:xlsx@0.18.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const DPH = 1.21
const MAX_PACK = 25

type Item = {
  name: string
  order_per: number | null
  color: string | null
  quality: string | null
  grower: string | null
  origin: string | null
  tags: string | null
  length_cm: number | null
  packing: string | null
  price_bunch: number | null
  price_bucket: number | null
}

function norm(s: unknown) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
function txt(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s && s !== '.' ? s : null
}

function parseWorkbook(bytes: Uint8Array): Item[] {
  const wb = XLSX.read(bytes, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as unknown[][]
  const head = (rows[0] ?? []).map(norm)
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h))
  const c = {
    name: col('zbozi'),
    per: col('objednat po'),
    color: col('barva'),
    quality: col('kvalita'),
    grower: col('pestitel'),
    origin: col('puvod'),
    tags: col('tags'),
    length: col('delka'),
    packing: col('baleni'),
    bunch: col('bunch'),
    bucket: col('bucket'),
  }
  if (c.name < 0) throw new Error('no_zbozi_column')
  const out: Item[] = []
  for (const r of rows.slice(1)) {
    const name = txt(r[c.name])
    if (!name) continue
    const g = (i: number) => (i >= 0 ? r[i] : null)
    out.push({
      name,
      order_per: num(g(c.per)),
      color: txt(g(c.color)),
      quality: txt(g(c.quality)),
      grower: txt(g(c.grower)),
      origin: txt(g(c.origin)),
      tags: txt(g(c.tags)),
      length_cm: num(g(c.length)),
      packing: txt(g(c.packing)),
      price_bunch: num(g(c.bunch)),
      price_bucket: num(g(c.bucket)),
    })
  }
  return out
}

function arrivalFromName(fileName: string): string | null {
  const m = fileName.match(/(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

const SET_SCHEMA = {
  type: 'object',
  properties: {
    sets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Название-образ по-чешски, формат "SET DŮM U JEZERA" (2-4 слова, заглавными).' },
          description_cs: { type: 'string', description: 'Popis pro web v cestine, 1-2 vety, bez patosu.' },
          idea_ru: { type: 'string', description: 'По-русски, 1-2 строки: какая сцена/образ и что в сете неожиданного.' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                catalog_name: { type: 'string', description: 'ТОЧНО как в прайсе, символ в символ.' },
                common_ru: { type: 'string', description: 'Обычное название по-русски: вид + цвет + форма, напр. "Эустома зелёная махровая".' },
                label_cs: { type: 'string', description: 'Radek slozeni v cestine: "EUSTOMA ZELENA (PLNE KVETY)".' },
                role: { type: 'string', enum: ['akcent', 'objem', 'faktura'] },
                qty: { type: 'integer', description: 'Stebel/svazku v sete; nasobek "pack".' },
              },
              required: ['catalog_name', 'common_ru', 'label_cs', 'role', 'qty'],
              additionalProperties: false,
            },
          },
        },
        required: ['name', 'description_cs', 'idea_ru', 'items'],
        additionalProperties: false,
      },
    },
  },
  required: ['sets'],
  additionalProperties: false,
}

const SYSTEM = `Ты арт-директор и флорист магазина NARIN (Прага). Ты придумываешь СЕТЫ: 2-4 отдельные охапки (каждая - один сорт, целая упаковка поставщика), которые покупатель расставляет по разным вазам или собирает в один массив. Все цветы - из прайса Van Vliet (Голландия) ниже.

ГЛАВНОЕ: владельцу НЕ нужны базовые сеты ("розовое к розовому", "розы + эустома + зелень"). Каждый сет - это ОБРАЗ: место, сцена, время, настроение, фактура материала. Сначала придумай образ, потом подбери под него цветы так, чтобы по составу этот образ угадывался. Примеры образов: дом у озера (зелёная гортензия + тёмно-бордовые каллы + тёмно-красный антуриум + декоративная зелень); степь (сухой хлопок + алые розы + белая эустома + Green Trick); холодный кобальт без пафоса (синий дельфиниум + оксипеталум + персиковый диантус + ветки); глянцевая архитектура против мягкой массы (зелёные антуриумы + персиковая пионовидная кустовая роза + диантус лайм); дикая экзотика (протея + розовые пионы + молюцелла + орнитогалум).

Как собирать:
- В каждом сете есть НЕОЖИДАННЫЙ элемент: необычная фактура (антуриум, протея, леукоспермум, анигозантос, целозия, эрингиум, молюцелла, скабиоза-коробочки, хлопок, ветки, злаки, суккулентная зелень), непривычный цвет (зелёная гортензия, тёмно-бордовая калла, чёрно-фиолетовая эустома, терракота, лайм) или смелый контраст. Обычные розы/эустома/хризантемы допустимы только как фон для такого элемента.
- Роли охапок: akcent (крупная выразительная форма), objem (мягкая масса), faktura (линия, текстура, зелень, ветки). Минимум один akcent или яркая faktura.
- Палитра продуманная: тон в тон с одним глубоким акцентом, или один смелый контраст. Тёмные, глубокие, "взрослые" сочетания приветствуются. Не больше трёх цветов.
- Стеблей как можно меньше: qty = одна упаковка (pack); две - только если одной явно мало. Предпочитай pack 5-20.
- Длины охапок в сете близкие (разница до ~20 см), кроме высоких свечей и веток.
- Не брать окрашенные (Painted & Dyed); максимум одна позиция Dec.bunch/Dec.stem на сет.
- Учитывай сезон по дате прихода (ноябрь-декабрь: можно зимние образы, но не только Рождество).
- Сеты разные между собой по образу и палитре, не повторяют уже предложенные (список ниже).
- catalog_name копируй из прайса СИМВОЛ В СИМВОЛ - по нему владелец ищет цветок в каталоге поставщика.

Название: образ по-чешски, 2-4 слова, заглавными, формат "SET DŮM U JEZERA", "SET STEP", "SET STUDENÝ KOBALT". Свои, не из примеров, без имён художников. label_cs - строка состава в духе "ANTURIUM TMAVĚ ČERVENÝ (LESKLÁ SRDCE)": вид, цвет, а в скобках - фактура/форма. Popis - по-чешски, 1-2 короткие фразы про образ и фактуру, без пафоса и без слов "krásný", "nádherný".`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: userData } = token ? await supabase.auth.getUser(token) : { data: { user: null } }
    const user = userData?.user
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401)
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'manager') return json({ ok: false, error: 'forbidden' }, 403)

    const body = await req.json().catch(() => ({}))

    if (body?.action === 'import') {
      const fileName = String(body?.file_name ?? 'pricelist.xlsx')
      const b64 = String(body?.file_b64 ?? '')
      if (!b64) return json({ ok: false, error: 'no_file' }, 400)
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))
      const items = parseWorkbook(bytes)
      if (!items.length) return json({ ok: false, error: 'empty_pricelist' }, 400)
      const { data: pl, error } = await supabase
        .from('forge_pricelists')
        .insert({ uploaded_by: user.id, file_name: fileName, arrival_date: arrivalFromName(fileName), row_count: items.length })
        .select('id, uploaded_at, file_name, arrival_date, row_count')
        .single()
      if (error || !pl) return json({ ok: false, error: error?.message ?? 'insert_failed' }, 500)
      for (let i = 0; i < items.length; i += 500) {
        const { error: e2 } = await supabase.from('forge_pricelist_items').insert(items.slice(i, i + 500).map((it) => ({ ...it, pricelist_id: pl.id })))
        if (e2) return json({ ok: false, error: e2.message }, 500)
      }
      return json({ ok: true, pricelist: pl })
    }

    if (body?.action === 'generate') {
      const pricelistId = String(body?.pricelist_id ?? '')
      const count = Math.min(Math.max(Number(body?.count) || 6, 1), 10)
      const hint = String(body?.hint ?? '').trim().slice(0, 300)

      const { data: pl } = await supabase.from('forge_pricelists').select('id, arrival_date').eq('id', pricelistId).maybeSingle()
      if (!pl) return json({ ok: false, error: 'pricelist_not_found' }, 404)
      const { data: rows } = await supabase.from('forge_pricelist_items').select('*').eq('pricelist_id', pricelistId).limit(20000)

      // Один сорт = одна строка: самая дешёвая по Bunch, без окрашенных и огромных упаковок.
      const byName = new Map<string, Item>()
      for (const r of (rows ?? []) as Item[]) {
        if (r.price_bunch == null || r.price_bunch <= 0) continue
        if (r.order_per != null && r.order_per > MAX_PACK) continue
        if ((r.tags ?? '').toLowerCase().includes('painted')) continue
        const prev = byName.get(r.name)
        if (!prev || (prev.price_bunch ?? Infinity) > r.price_bunch) byName.set(r.name, r)
      }
      const offer = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
      if (offer.length < 10) return json({ ok: false, error: 'too_few_items' }, 400)
      const lines = offer.map((r) => `${r.name} | ${r.color ?? '-'} | pack ${r.order_per ?? 1} | ${r.length_cm ?? '-'}cm | ${r.price_bunch} Kc`)

      const { data: past } = await supabase
        .from('forge_candidates')
        .select('name, status, reject_note, items')
        .order('created_at', { ascending: false })
        .limit(80)
      const describe = (c: { name: string; items: { common_ru?: string }[] }) => `${c.name}: ${(c.items ?? []).map((i) => i.common_ru).join(' + ')}`
      const taken = (past ?? []).filter((c) => c.status === 'taken').slice(0, 15).map(describe)
      const rejected = (past ?? []).filter((c) => c.status === 'rejected').slice(0, 20).map((c) => `${describe(c)}${c.reject_note ? ` - причина: ${c.reject_note}` : ''}`)
      const already = (past ?? []).filter((c) => c.status === 'pending').map(describe)

      const user_msg = [
        `Дата прихода: ${pl.arrival_date ?? 'неизвестна'}.`,
        `Собери ${count} разных сетов.`,
        hint ? `Пожелание владельца: ${hint}` : '',
        taken.length ? `Владелец ВЗЯЛ такие сеты (делай в этом духе, но не повторяй):\n${taken.join('\n')}` : '',
        rejected.length ? `Владелец ОТКЛОНИЛ (не повторяй эти ошибки):\n${rejected.join('\n')}` : '',
        already.length ? `Уже предложены и ждут решения (не повторяй):\n${already.join('\n')}` : '',
        `Прайс (название | цвет | упаковка | длина | цена за стебель без DPH):\n${lines.join('\n')}`,
      ]
        .filter(Boolean)
        .join('\n\n')

      const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })
      const stream = client.beta.messages.stream({
        model: 'claude-opus-5-5',
        max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SET_SCHEMA } },
        system: SYSTEM,
        messages: [{ role: 'user', content: user_msg }],
      } as never)
      const msg = (await stream.finalMessage()) as unknown as { stop_reason: string; content: { type: string; text?: string }[] }
      if (msg.stop_reason === 'refusal') return json({ ok: false, error: 'model_refused' }, 502)
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
      let parsed: { sets: { name: string; description_cs: string; idea_ru: string; items: { catalog_name: string; common_ru: string; label_cs: string; role: string; qty: number }[] }[] }
      try {
        parsed = JSON.parse(text)
      } catch {
        return json({ ok: false, error: 'bad_model_output', stop_reason: msg.stop_reason }, 502)
      }

      // Проверка: каждое название ровно из прайса, количество кратно упаковке.
      const exact = new Map(offer.map((r) => [r.name, r]))
      const loose = new Map(offer.map((r) => [norm(r.name), r]))
      const inserts = []
      let dropped = 0
      for (const s of parsed.sets ?? []) {
        const items = []
        let ok = true
        for (const it of s.items ?? []) {
          const row = exact.get(it.catalog_name) ?? loose.get(norm(it.catalog_name))
          if (!row) {
            ok = false
            break
          }
          const pack = Math.max(1, row.order_per ?? 1)
          const qty = Math.max(pack, Math.ceil((Number(it.qty) || pack) / pack) * pack)
          items.push({
            catalog_name: row.name,
            common_ru: it.common_ru,
            label_cs: it.label_cs,
            role: it.role,
            qty,
            pack,
            color: row.color,
            length_cm: row.length_cm,
            origin: row.origin,
            price: row.price_bunch,
            cost: Math.round((row.price_bunch ?? 0) * DPH * qty),
          })
        }
        if (!ok || items.length < 2 || items.length > 4) {
          dropped++
          continue
        }
        inserts.push({
          pricelist_id: pricelistId,
          name: s.name,
          description_cs: s.description_cs,
          idea_ru: s.idea_ru,
          items,
          stems: items.reduce((a, i) => a + i.qty, 0),
          cost: items.reduce((a, i) => a + i.cost, 0),
          hint: hint || null,
        })
      }
      if (inserts.length) {
        const { error } = await supabase.from('forge_candidates').insert(inserts)
        if (error) return json({ ok: false, error: error.message }, 500)
      }
      return json({ ok: true, created: inserts.length, dropped })
    }

    return json({ ok: false, error: 'bad_action' }, 400)
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
