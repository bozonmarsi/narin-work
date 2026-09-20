// Единая точка входа для ЛЮБОЙ фактуры/чека — с почты (через n8n) ИЛИ
// напрямую из приложения, когда флорист просто фоткает бумажный счёт
// (кнопка "Загрузить фактуру" в Приёмке). Раньше для каждого поставщика
// с почты был свой Code-нод в n8n с ручным regex под конкретный формат
// письма — работало только для Van Vliet и Storge, для любого нового
// поставщика нужно было бы писать новый regex руками. Теперь n8n —
// просто сантехника: письмо -> PDF в Drive -> текст из PDF -> один POST
// сюда. Разбор — текста ИЛИ прямо фото/скана (Claude Vision) — в
// позиции делает Claude, одинаково для ЛЮБОГО поставщика и формата.
//
// Гарантия "фактура не потеряется" важнее гарантии "распозналась
// правильно": INSERT в invoice_drafts происходит ВСЕГДА, даже если
// Claude вернул отказ/мусор/пустой список позиций — тогда просто
// сохраняется черновик с items: [], а флорист дозаполняет позиции
// вручную в форме подтверждения (см. InvoiceDraftModal), глядя на
// drive_url/фото. Ошибка распознавания и так ничем не рискует: партия
// на склад заводится только явным кликом "Принять на склад", не отсюда.
//
// supplier_id находим по адресу отправителя (suppliers.invoice_sender_
// emails), а не по строке "поставщик" из текста письма — та почти
// никогда не совпадает дословно с нашим suppliers.name ("Van Vliet CZ
// sro" в письме vs "Van Vliet" у нас). При ручной загрузке фото адреса
// нет — supplier_id остаётся пустым, флорист выбирает поставщика сам в
// форме подтверждения.
//
// Письмо С адресом, который "похож на фактуру" (прошёл фильтр n8n по
// ключевым словам), но не значится ни за одним поставщиком — например
// биллинг Google Cloud — НЕ должно засорять очередь флориста. Такой
// черновик получает статус needs_sender_review и уходит менеджеру на
// отдельный экран "Новые отправители": разрешить (регистрирует адрес
// за выбранным поставщиком, черновик становится обычным pending) или
// отклонить.
//
// Два режима (body.mode): "draft" (по умолчанию) — товарная фактура,
// заводится черновик в invoice_drafts для Приёмки, со сопоставлением
// поставщика/каталога. "extract" — общий расход менеджера (аренда,
// реклама, бензин и т.п.) в разделе "Расходы": ничего не пишем в базу,
// просто возвращаем разобранные данные (сумма/дата/контрагент), чтобы
// заполнить готовую форму — сохраняет её сам менеджер явным кликом.
//
// Авторизация — ЛИБО секрет n8n (CRON_SECRET в заголовке Authorization,
// у n8n нет настоящей сессии Supabase), ЛИБО настоящая сессия
// менеджера/складского сотрудника (ручная загрузка из приложения).
// Платформенная проверка JWT для этой функции должна быть отключена в
// Dashboard — оба случая проверяем сами ниже (тот же паттерн, что и у
// vanvliet-alias-refresh).
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
// таблицами, или огромное фото с телефона без сжатия) — Claude такое
// всё равно осилит, но незачем гонять и хранить лишнее ради счёта из
// десяти строк. 15 МБ в base64 — с запасом покрывает обычное фото
// счёта или скан-PDF на несколько страниц.
const MAX_TEXT_CHARS = 40000
const MAX_FILE_BASE64_CHARS = 15_000_000

type ParsedItem = { name: string; quantity: number; unit_price: number | null }
type ParsedInvoice = {
  invoice_number: string | null
  invoice_date: string | null
  vendor: string | null
  total_amount: number | null
  items: ParsedItem[]
}

const PROMPT_INSTRUCTIONS = `Найди:
- номер документа (обычно рядом со словами "Faktura", "Daňový doklad", "Invoice number" и т.п.)
- дату выставления документа
- контрагента — кто выставил документ (название компании/продавца)
- итоговую сумму документа целиком (с учётом НДС, как в самом низу чека/фактуры)
- позиции: список товаров/услуг с количеством и ценой за единицу (без НДС, если можно различить)

Верни СТРОГО валидный JSON без markdown-разметки и пояснений, ровно такой формы:
{"invoice_number": string|null, "invoice_date": "YYYY-MM-DD"|null, "vendor": string|null, "total_amount": number|null, "items": [{"name": string, "quantity": number, "unit_price": number|null}]}

Числа — обычными точечными float, без валюты и пробелов. Если что-то не удаётся определить уверенно — ставь null, не придумывай значения. Если позиций нет вообще, документ нечитаем или это не фактура/чек — верни "items": [].`

async function callClaude(anthropicKey: string, content: unknown): Promise<{ parsed: ParsedInvoice; error: string | null }> {
  const empty: ParsedInvoice = { invoice_number: null, invoice_date: null, vendor: null, total_amount: null, items: [] }

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
        messages: [{ role: 'user', content }],
      }),
    })
    aiData = await aiRes.json()
    if (!aiRes.ok) return { parsed: empty, error: `anthropic_http_${aiRes.status}: ${JSON.stringify(aiData)}` }
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
        vendor: typeof parsed.vendor === 'string' && parsed.vendor.trim() ? parsed.vendor.trim() : null,
        total_amount: parsed.total_amount != null && Number.isFinite(Number(parsed.total_amount)) ? Number(parsed.total_amount) : null,
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

// Текстовый путь — n8n уже прислал текст, извлечённый из PDF письма.
function parseInvoiceFromText(anthropicKey: string, text: string) {
  const prompt = `Ты разбираешь текст, извлечённый из PDF-фактуры или чека (любой поставщик — цветы, упаковка, транспорт, услуги, что угодно) для внутренней бухгалтерии небольшого цветочного магазина в Праге. Текст может быть на чешском, английском или голландском, числа могут быть с запятой вместо точки как разделителем.

Текст документа:
"""
${text}
"""

${PROMPT_INSTRUCTIONS}`
  return callClaude(anthropicKey, prompt)
}

// Путь с файлом — фото или PDF-скан загружен прямо из приложения,
// текста для распознавания ещё нет. Claude читает изображение/документ
// сам (Vision), без промежуточного OCR-шага.
function parseInvoiceFromFile(anthropicKey: string, fileBase64: string, mimeType: string) {
  const isPdf = mimeType === 'application/pdf'
  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
    : { type: 'image', source: { type: 'base64', media_type: mimeType, data: fileBase64 } }
  const prompt = `Это ${isPdf ? 'скан (PDF)' : 'фото'} фактуры или чека (любой поставщик — цветы, упаковка, транспорт, услуги, что угодно) для внутренней бухгалтерии небольшого цветочного магазина в Праге. Документ может быть на чешском, английском или голландском, числа могут быть с запятой вместо точки как разделителем.

${PROMPT_INSTRUCTIONS}`
  return callClaude(anthropicKey, [fileBlock, { type: 'text', text: prompt }])
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
      // Ручная загрузка фото из приложения — приходит настоящая сессия
      // менеджера/складского сотрудника.
      const { data: userData } = await supabase.auth.getUser(token)
      if (userData?.user) {
        const { data: profile } = await supabase.from('users').select('role').eq('id', userData.user.id).maybeSingle()
        authorized = profile?.role === 'manager' || profile?.role === 'warehouse'
      }
    }
    if (!authorized) return json({ error: 'unauthorized' }, 401)

    const body = await req.json().catch(() => null)
    const senderEmailRaw: string = (body?.sender_email ?? '').toString().trim()
    const driveUrl: string | null = body?.drive_url ? String(body.drive_url) : null
    const pdfText: string = (body?.pdf_text ?? '').toString().slice(0, MAX_TEXT_CHARS)
    const subject: string = (body?.subject ?? '').toString()
    const fileBase64: string = (body?.file_base64 ?? '').toString()
    const mimeType: string = (body?.mime_type ?? '').toString()
    // "draft" (по умолчанию) — как раньше, письмо/скан фактуры товара,
    // заводится черновик в invoice_drafts для Приёмки. "extract" — общий
    // расход менеджера (аренда, реклама, бензин и т.п.) в разделе
    // "Расходы": туда не нужен ни поставщик из каталога, ни черновик на
    // складе — просто разобрать чек и вернуть данные, чтобы заполнить
    // готовую форму, а сохраняет её сам менеджер явным кликом "Добавить".
    const mode: 'draft' | 'extract' = body?.mode === 'extract' ? 'extract' : 'draft'

    if (!senderEmailRaw && !driveUrl && !pdfText && !fileBase64) {
      return json({ error: 'empty_payload' }, 400)
    }
    if (fileBase64.length > MAX_FILE_BASE64_CHARS) {
      return json({ error: 'file_too_large' }, 400)
    }

    const senderEmail = senderEmailRaw.toLowerCase()

    // 1. Разбор — текстом (письмо) или файлом (ручная загрузка/фото).
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    let parsed: ParsedInvoice = { invoice_number: null, invoice_date: null, vendor: null, total_amount: null, items: [] }
    let parseError: string | null = 'no_anthropic_key'
    if (anthropicKey) {
      const result = fileBase64
        ? await parseInvoiceFromFile(anthropicKey, fileBase64, mimeType || 'image/jpeg')
        : await parseInvoiceFromText(anthropicKey, pdfText)
      parsed = result.parsed
      parseError = result.error
    }

    if (mode === 'extract') {
      return json({ ok: true, parsed, parseError })
    }

    // 2. Кто прислал — по адресу, не по имени из текста письма. Для
    // ручной загрузки адреса нет — supplier остаётся null, дальше это
    // просто "не сопоставлено" в форме, как и для незнакомых писем.
    const { data: supplier } = senderEmail
      ? await supabase
          .from('suppliers')
          .select('id, name')
          .contains('invoice_sender_emails', [senderEmail])
          .maybeSingle()
      : { data: null }

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

    // 4. Письмо с известного отправителя (или ручная загрузка без
    // адреса вовсе) — обычный черновик, сразу флористу в Приёмку. Письмо
    // ПОХОЖЕЕ на фактуру, но с адреса, который ни за одним поставщиком
    // не числится (например биллинг Google Cloud, который просто
    // подходит под ключевые слова в фильтре n8n) — не должно засорять
    // очередь флориста мусором. Такое уходит менеджеру на разбор
    // ("новые отправители"): разрешить (тогда адрес регистрируется за
    // поставщиком и черновик становится обычным pending) или отклонить.
    const status = senderEmailRaw && !supplier ? 'needs_sender_review' : 'pending'

    // 5. Сохраняем ВСЕГДА — это единственный шаг, которому разрешено
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
        status,
      })
      .select('id')
      .single()

    if (insertErr || !draft) return json({ ok: false, step: 'insert', error: insertErr?.message }, 500)

    return json({
      ok: true,
      id: draft.id,
      status,
      matchedSupplier: Boolean(supplier),
      itemsFound: items.length,
      itemsMatched: items.filter((i) => i.matched_product_sticker_id).length,
      parseError,
    })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
