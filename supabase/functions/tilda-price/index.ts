// Меняет цену náruče в Tilda по кнопке владельца на экране «Цветы и цены»
// (/dashboard/matching) и пишет решение в журнал price_changes.
//
//   { product_id, action: "apply", price, suggested?, cost?, stem?, k? }
//       -> цена в Tilda = price (меняется ТОЛЬКО цена, всё остальное в
//          товаре остаётся), product_stickers.price тоже, запись applied.
//   { product_id, action: "keep", suggested?, cost?, stem?, k? }
//       -> ничего не меняет, запись kept (предложение не всплывает, пока
//          расчёт не уйдёт ещё больше чем на 10 %).
//
// Только менеджер (его сессия Supabase). Tilda меняется через официальный
// MCP-сервер Tilda (https://tilda.cc/api/mcp/) теми же инструментами,
// store_get_products / store_save_products. Товар с вариантами (editions)
// не трогаем - у náruče их нет, а у вариантов цена своя у каждого.
//
// Секреты: TILDA_MCP_TOKEN (ключ Tilda MCP), TILDA_PROJECT_ID (по умолчанию 21353796).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const MCP_URL = 'https://tilda.cc/api/mcp/'
const PROTO = '2025-06-18'

class Mcp {
  sid: string | null = null
  constructor(private auth: string) {}
  async rpc(body: unknown): Promise<any> {
    const h: Record<string, string> = {
      Authorization: this.auth,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': PROTO,
    }
    if (this.sid) h['Mcp-Session-Id'] = this.sid
    const res = await fetch(MCP_URL, { method: 'POST', headers: h, body: JSON.stringify(body) })
    const sid = res.headers.get('Mcp-Session-Id')
    if (sid) this.sid = sid
    const txt = await res.text()
    if (!res.ok) throw new Error(`tilda_http_${res.status}: ${txt.slice(0, 200)}`)
    const data = txt.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5))
    const raw = data.length ? data[data.length - 1] : txt
    return raw ? JSON.parse(raw) : null
  }
  async start() {
    await this.rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTO, capabilities: {}, clientInfo: { name: 'narin-price', version: '1' } } })
    await this.rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })
  }
  async call(name: string, args: Record<string, unknown>): Promise<any> {
    const r = await this.rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } })
    if (!r || r.error || r.result?.isError) throw new Error(`tilda_${name}: ${JSON.stringify(r?.error ?? r?.result?.content ?? r).slice(0, 300)}`)
    const txt = (r.result?.content ?? []).map((c: any) => c.text ?? '').join('')
    try {
      return JSON.parse(txt)
    } catch {
      return txt
    }
  }
}

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
    const productId = String(body?.product_id ?? '')
    const action = body?.action === 'keep' ? 'keep' : 'apply'
    const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
    const meta = { suggested: num(body?.suggested), cost: num(body?.cost), stem: num(body?.stem), k: num(body?.k) }

    const { data: p } = await supabase.from('product_stickers').select('id, product_name, tilda_uid, price, category').eq('id', productId).maybeSingle()
    if (!p) return json({ ok: false, error: 'product_not_found' }, 404)

    if (action === 'keep') {
      await supabase.from('price_changes').insert({ actor: user.id, product_sticker_id: p.id, action: 'kept', old_price: p.price, new_price: p.price, ...meta })
      return json({ ok: true, kept: true })
    }

    const price = num(body?.price)
    if (price == null || price < 10 || price > 50000 || Math.round(price) !== price) return json({ ok: false, error: 'bad_price' }, 400)
    if (!p.tilda_uid) return json({ ok: false, error: 'no_tilda_product' }, 400)

    const mcpToken = Deno.env.get('TILDA_MCP_TOKEN')
    if (!mcpToken) return json({ ok: false, error: 'missing_TILDA_MCP_TOKEN' }, 500)
    const projectid = Number(Deno.env.get('TILDA_PROJECT_ID') || 21353796)
    const mcp = new Mcp(mcpToken.startsWith('Bearer ') ? mcpToken : `Bearer ${mcpToken}`)
    await mcp.start()

    const productuid = Number(p.tilda_uid)
    const cur = await mcp.call('store_get_products', { projectid, productuid })
    if (!cur || typeof cur !== 'object' || !cur.title) return json({ ok: false, error: 'tilda_product_not_found' }, 404)
    if (cur.editions && String(cur.editions).trim() && String(cur.editions).trim() !== '[]') return json({ ok: false, error: 'product_has_variants' }, 400)

    // Только title (обязателен) и price: всё остальное у товара Tilda остаётся как было.
    await mcp.call('store_save_products', { projectid, productuid, title: cur.title, price: String(price) })
    const after = await mcp.call('store_get_products', { projectid, productuid })
    if (Math.round(Number(after?.price)) !== price) return json({ ok: false, error: 'tilda_price_not_saved', got: after?.price }, 502)

    const oldPrice = Math.round(Number(cur.price))
    await supabase.from('product_stickers').update({ price }).eq('id', p.id)
    await supabase.from('price_changes').insert({ actor: user.id, product_sticker_id: p.id, action: 'applied', old_price: oldPrice, new_price: price, ...meta })
    return json({ ok: true, old_price: oldPrice, price })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
