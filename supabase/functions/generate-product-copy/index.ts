// Черновик текста/характеристик для карточки в Tilda (см. кнопку "⬇️
// CSV" в Магазине) — по образцу того, как менеджер сама пишет карточки
// (см. реальный пример "Pivoňka Sarah Bernard": вступление + "#" +
// маркированный список ухода, характеристики в формате "значение #
// пояснение"). Это ЧЕРНОВИК: результат всегда показывается менеджеру в
// редактируемом виде перед тем, как попасть в CSV — сама функция ничего
// не публикует и не сохраняет.
//
// "Pro domácí mazlíčky" (токсичность для питомцев) — единственное поле
// здесь, где ошибка ИИ не просто неточность, а реальный риск (лилии,
// например, смертельно опасны для кошек) — промпт явно просит быть
// осторожной и не утверждать "нетоксично", если нет уверенности.
//
// "Výdrž" (срок жизни) не отдаём ИИ придумывать число — оно уже есть в
// нашей базе (default_vase_life_days), передаём его и просим только
// дописать пояснение.
//
// Авторизация — настоящая сессия менеджера/складского сотрудника
// (вызывается прямо из браузера). Платформенная проверка JWT для этой
// функции должна быть отключена в Dashboard — проверяем сами ниже (тот
// же паттерн, что и у invoice-ingest).
//
// Секреты: ANTHROPIC_API_KEY.

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

type ProductCopy = {
  text: string
  characteristics: {
    vyska: string
    aroma: string
    vydrz: string
    pets: string
    cut_type: string
    water_level: string
  }
}

const EMPTY: ProductCopy = {
  text: '',
  characteristics: { vyska: '', aroma: '', vydrz: '', pets: '', cut_type: '', water_level: '' },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    let authorized = false
    if (token) {
      const { data: userData } = await supabase.auth.getUser(token)
      if (userData?.user) {
        const { data: profile } = await supabase.from('users').select('role').eq('id', userData.user.id).maybeSingle()
        authorized = profile?.role === 'manager' || profile?.role === 'warehouse'
      }
    }
    if (!authorized) return json({ error: 'unauthorized' }, 401)

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) return json({ ok: false, error: 'no_anthropic_key', parsed: EMPTY }, 200)

    const body = await req.json().catch(() => null)
    const productName: string = (body?.product_name ?? '').toString().trim()
    if (!productName) return json({ error: 'product_name required' }, 400)

    const flowerTypes: string[] = Array.isArray(body?.flower_type) ? body.flower_type : []
    const colors: string[] = Array.isArray(body?.color) ? body.color : []
    const height: string | null = body?.height ?? null
    const fragrant: boolean = Boolean(body?.fragrant)
    const vaseLifeDays: number | null = body?.vase_life_days != null ? Number(body.vase_life_days) : null

    const prompt = `Ty píšeš popisky produktů pro květinářství v Praze (e-shop Tilda). Napiš podklad pro kartu produktu "${productName}" (${[...flowerTypes, ...colors, height, fragrant ? 'voňavé' : null].filter(Boolean).join(', ') || 'bez dalších tagů'}).

Vzor stylu (jiný produkt, jen jako ukázka tónu a struktury — nekopíruj obsah):
"""
Oblíbená klasická odrůda s velkými, plnými světle růžovými květy. Romantický, bohatý a elegantní vzhled s jemnými vrstvami okvětních lístků. Skvěle se hodí do luxusních kytic i samostatných vazeb.
#
- Postavte ihned do čisté vázy s vlažnou vodou
- Vyměňujte vodu každé 2 dny a vždy důkladně umyjte vázu
- Každé 2–3 dny seřízněte stonek šikmo pod úhlem o 2–3 cm
- Odstraňte listy, které jsou ponořené ve vodě
- Chraňte před přímým sluncem, průvanem a teplotami nad 22 °C
"""

Napiš:
1. "text" — 2-4 věty o vzhledu/charakteru květiny (marketingově, ne jen fakticky), pak řádek "#", pak 4-6 bodů péče (voda, výměna vody, řez stonku, odstranění listů, ochrana před sluncem/teplem/průvanem — přizpůsob konkrétní květině). Bez HTML značek, jen prostý text s odrážkami "- ".
2. "characteristics.vyska" — reálný rozsah výšky v cm pro tento druh, formát "50–65 cm # krátká poznámka".
3. "characteristics.aroma" — formát "popis vůně # číslo 1-5" (1 = bez vůně, 5 = velmi intenzivní).
4. "characteristics.pets" — TOXICITA PRO DOMÁCÍ MAZLÍČKY (kočky/psi). Buď při tomto poli maximálně přesná a opatrná — jde o reálné zdraví zvířat, ne o marketing. Pokud je druh znám jako toxický (např. pravé lilie jsou pro kočky život ohrožující), napiš to jasně. Pokud si nejsi jistá mírou toxicity, napiš obecně opatrnou formulaci ("Pro jistotu udržujte mimo dosah domácích mazlíčků."), nikdy netvrď "netoxické", pokud si nejsi jistá. Formát "krátké tvrzení # vysvětlení".
5. "characteristics.cut_type" — typ řezu stonku, např. "Šikmý řez na 45 stupňů" nebo "Rovný nebo mírně šikmý řez". Bez "#".
6. "characteristics.water_level" — formát "úroveň vody # číslo 1-3" (např. "1/3 délky stonku # 1").

Vrať STRIKTNĚ validní JSON bez markdown, přesně této struktury:
{"text": string, "characteristics": {"vyska": string, "aroma": string, "vydrz_comment": string, "pets": string, "cut_type": string, "water_level": string}}

"vydrz_comment" je jen krátké vysvětlující slovní spojení k výdrži (BEZ počtu dní — ten už známe), např. "Patří mezi stálé řezané květiny s dobrou výdrží."`

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
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      aiData = await aiRes.json()
      if (!aiRes.ok) return json({ ok: false, error: `anthropic_http_${aiRes.status}`, parsed: EMPTY })
    } catch (e) {
      return json({ ok: false, error: `anthropic_request_failed: ${String(e)}`, parsed: EMPTY })
    }

    if (aiData?.stop_reason === 'refusal') return json({ ok: false, error: 'anthropic_refusal', parsed: EMPTY })

    const textBlock = (aiData?.content ?? []).find((b: any) => b?.type === 'text')
    const rawText: string = textBlock?.text ?? ''
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()

    try {
      const parsed = JSON.parse(cleaned)
      const vydrz = vaseLifeDays != null
        ? `${vaseLifeDays} dní${parsed?.characteristics?.vydrz_comment ? ' # ' + parsed.characteristics.vydrz_comment : ''}`
        : (parsed?.characteristics?.vydrz_comment ?? '')

      const result: ProductCopy = {
        text: typeof parsed.text === 'string' ? parsed.text : '',
        characteristics: {
          vyska: parsed?.characteristics?.vyska ?? '',
          aroma: parsed?.characteristics?.aroma ?? '',
          vydrz,
          pets: parsed?.characteristics?.pets ?? '',
          cut_type: parsed?.characteristics?.cut_type ?? '',
          water_level: parsed?.characteristics?.water_level ?? '',
        },
      }
      return json({ ok: true, parsed: result })
    } catch {
      return json({ ok: false, error: 'parse_failed', parsed: EMPTY })
    }
  } catch (e) {
    return json({ ok: false, error: String(e), parsed: EMPTY })
  }
})
