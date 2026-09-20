// Единая точка входа для ЛЮБОЙ фактуры/чека с почты — n8n тут не
// разбирает содержимое сам (раньше для каждого поставщика был свой
// Code-нод с ручным regex под конкретный формат письма — работало
// только для Van Vliet и Storge, для любого нового поставщика нужно
// было бы писать новый regex руками). Теперь n8n — просто сантехника:
// письмо -> PDF в Drive -> текст из PDF -> один POST сюда. Разбор текста
// в позиции делает Claude, одинаково для ЛЮБОГО поставщика и формата.
//
// Гарантия "фактура не потеряется" важнее гарантии "распозналась
// правильно": INSERT в invoice_drafts происходит ВСЕГДА, даже если
// Claude вернул отказ/мусор/пустой список позиций — тогда просто
// сохраняется черновик с items: [], а флорист дозаполняет позиции
// вручную в форме подтверждения (см. InvoiceDraftModal), глядя на
// drive_url. Ошибка распознавания и так ничем не рискует: партия на
// склад заводится только явным кликом "Принять на склад", не отсюда.
//
// supplier_id находим по адресу отправителя (suppliers.invoice_sender_
// emails), а не по строке "поставщик" из текста письма — та почти
// никогда не совпадает дословно с нашим suppliers.name ("Van Vliet CZ
// sro" в письме vs "Van Vliet" у нас).
//
// Вызывается из n8n с секретом в заголовке Authorization (тот же
// CRON_SECRET, что и у остальных фоновых функций — платформенная
// проверка JWT для этой функции должна быть отключена в Dashboard,
// у n8n нет настоящей сессии Supabase).
//
// Секреты: ANTHROPIC_API_KEY, CRON_SECRET.

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

// Защита от аномально большого вложения (много-страничный PDF с
// таблицами) — Claude такое всё равно осилит, но незачем гонять и
// хранить сотни КБ текста ради счёта из десяти строк.
const MAX_TEXT_CHARS = 40000

type ParsedItem = { name: string; quantity: number; unit_price: number | null }
type ParsedInvoice = { invoice_number: string | null; invoice_date: string | null; items: ParsedItem[] }

async function parseInvoiceText(anthropicKey: string, text: string): Promise<{ parsed: ParsedInvoice; error: string | null }> {
  const empty: ParsedInvoice = { invoice_number: null, invoice_date: null, items: [] }
  if (!text.trim()) return { parsed: empty, error: 'empty_text' }

  const prompt = `Ты разбираешь текст, извлечённый из PDF-фактуры или чека (любой поставщик — цветы, упаковка, транспорт, услуги, что угодно) для внутренней бухгалтерии небольшого цветочного магазина в Праге. Текст может быть на чешском, английском или голландском, числа могут быть с запятой вместо точки как разделителем.

Текст документа:
"""
${text}
"""

Найди:
- номер документа (обычно рядом со словами "Faktura", "Daňový doklad", "Invoice number" и т.п.)
- дату выставления документа
- позиции: список товаров/услуг с количеством и ценой за единицу (без НДС, если можно различить)

Верни СТРОГО валидный JSON без markdown-разметки и пояснений, ровно такой формы:
{"invoice_number": string|null, "invoice_date": "YYYY-MM-DD"|null, "items": [{"name": string, "quantity": number, "unit_price": number|null}]}

Числа — обычными точечными float, без валюты и пробелов. Если что-то не удаётся определить уверенно — ставь null, не придумывай значения. Если позиций в тексте нет вообще или текст нечитаем/обрезан — верни "items": [].`

  let aiData: any
  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    aiData = await aiRes.json()
    if (!aiRes.ok) return { parsed: empty, error: `anthropic_http_${aiRes.status}` }
  } catch (e) {
    return { parsed: empty, error: `anthropic_request_failed: ${String(e)}` }
  }

  if (aiData?.stop_reason === 'refusal') return { parsed: empty, error: 'anthropic_refusal' }

  const textBlock = (aiData?.content ?? []).find((b: any) => b?.type === 'text')
  const rawText: string = textBlock?.text ?? ''
  const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    return {
      parsed: {
        invoice_number: parsed.invoice_number ?? null,
        invoice_date: parsed.invoice_date ?? null,
        items: Array.isArray(parsed.items)
          ? parsed.items
              .filter((it: any) => it && typeof it.name === 'string' && it.name.trim() && Number.isFinite(Number(it.quantity)))
              .map((it: any) => ({
                name: String(it.name).trim(),
                quantity: Number(it.quantity),
                unit_price: it.unit_price != null && Number.isFinite(Number(it.unit_price)) ? Number(it.unit_price) : null,
              }))
          : [],
      },
      error: null,
    }
  } catch {
    return { parsed: empty, error: 'parse_failed' }
  }
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
    if (!cronSecret || token !== cronSecret) return json({ error: 'unauthorized' }, 401)

    const body = await req.json().catch(() => null)
    const senderEmailRaw: string = (body?.sender_email ?? '').toString().trim()
    const driveUrl: string | null = body?.drive_url ? String(body.drive_url) : null
    const pdfText: string = (body?.pdf_text ?? '').toString().slice(0, MAX_TEXT_CHARS)
    const subject: string = (body?.subject ?? '').toString()

    if (!senderEmailRaw && !driveUrl && !pdfText) {
      return json({ error: 'empty_payload' }, 400)
    }

    const senderEmail = senderEmailRaw.toLowerCase()

    // 1. Кто прислал — по адресу, не по имени из текста письма.
    const { data: supplier } = senderEmail
      ? await supabase
          .from('suppliers')
          .select('id, name')
          .contains('invoice_sender_emails', [senderEmail])
          .maybeSingle()
      : { data: null }

    // 2. Разбор текста в позиции — одинаково для любого поставщика.
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    let parsed: ParsedInvoice = { invoice_number: null, invoice_date: null, items: [] }
    let parseError: string | null = 'no_anthropic_key'
    if (anthropicKey) {
      const result = await parseInvoiceText(anthropicKey, pdfText)
      parsed = result.parsed
      parseError = result.error
    }

    // 3. Сопоставление позиций с нашим каталогом по уже накопленному
    // словарю алиасов — тому же самому, что учится от ручных
    // подтверждений в Приёмке и от Van Vliet. Сначала пробуем алиасы
    // именно этого поставщика (точнее), при отсутствии — вообще все
    // (вдруг то же название уже встречалось у другого поставщика).
    const { data: aliasesForSupplier } = supplier
      ? await supabase.from('product_name_aliases').select('alias, product_sticker_id').eq('supplier_id', supplier.id)
      : { data: [] }
    const { data: aliasesAll } = await supabase.from('product_name_aliases').select('alias, product_sticker_id')

    function findMatch(name: string): string | null {
      const norm = name.trim().toLowerCase()
      const hit =
        (aliasesForSupplier ?? []).find((a) => a.alias.trim().toLowerCase() === norm) ??
        (aliasesAll ?? []).find((a) => a.alias.trim().toLowerCase() === norm)
      return hit?.product_sticker_id ?? null
    }

    const items = parsed.items.map((it) => ({
      supplier_item_name: it.name,
      quantity: it.quantity,
      unit_price: it.unit_price,
      matched_product_sticker_id: findMatch(it.name),
    }))

    // 4. Сохраняем ВСЕГДА — это единственный шаг, которому разрешено
    // провалить весь запрос (значит реальная проблема с базой, не с
    // распознаванием).
    const { data: draft, error: insertErr } = await supabase
      .from('invoice_drafts')
      .insert({
        supplier_name: supplier?.name ?? (senderEmailRaw || subject || null),
        supplier_id: supplier?.id ?? null,
        invoice_number: parsed.invoice_number,
        invoice_date: parsed.invoice_date,
        drive_url: driveUrl,
        sender_email: senderEmailRaw || null,
        raw_text: pdfText || null,
        items,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertErr || !draft) return json({ ok: false, step: 'insert', error: insertErr?.message }, 500)

    return json({
      ok: true,
      id: draft.id,
      matchedSupplier: Boolean(supplier),
      itemsFound: items.length,
      itemsMatched: items.filter((i) => i.matched_product_sticker_id).length,
      parseError,
    })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
