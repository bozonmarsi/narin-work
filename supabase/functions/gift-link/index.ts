// Dárek bez adresy — veřejné API pro Tilda stránky (pokladna a /prijem-daru).
//
// Prohlížeč nikdy nesahá do databáze: tady se ověří token a stav, vrátí se jen
// to, co stránka potřebuje, a zapisuje se service rolí na serveru.
//
// Akce (POST JSON):
//   check   { contact }                 → { blocked }   pokladna: kontakt odmítl dárky bez adresy?
//   get     { t } | { s }               → stav + termíny  t = token příjemce, s = token odesílatele
//   confirm { t|s, address, city, psc, lat, lng, floor, apartment, intercom, note, phone, date, slot }
//   optout  { t }                       → příjemce nechce: zrušit, vrátit peníze, už nekontaktovat
//
// Deploy: Edge Functions → gift-link, "Verify JWT" VYPNUTO (volá ji web s veřejným klíčem).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
function txt(v: unknown, max = 200): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const s = String(v).replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, max) : null
}
function firstName(name: string | null) {
  return (name ?? '').trim().split(/\s+/)[0] || null
}
function esc(s: unknown) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
}
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/
const SLOTS = ['9-12', '12-15', '15-18', '18-20']
// Doručujeme po Praze (stejná cena kurýra 239 Kč) — PSČ Prahy začínají 1.
const PRAGUE_PSC = /^1\d{2}\s?\d{2}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'bad_json' }, 400) }
  const action = String(body.action ?? '')

  try {
    // ---------- pokladna: smí se tomuto kontaktu poslat dárek bez adresy? ----------
    if (action === 'check') {
      const contact = txt(body.contact, 80)
      if (!contact) return json({ blocked: false })
      const { data: hash } = await supabase.rpc('gift_contact_hash', { p_handle: contact })
      if (!hash) return json({ blocked: false })
      const { data } = await supabase.from('gift_do_not_contact').select('id').eq('contact_hash', hash).maybeSingle()
      return json({ blocked: !!data })
    }

    // ---------- najít dárek podle tokenu ----------
    const t = txt(body.t, 64), s = txt(body.s, 64)
    const mode: 'recipient' | 'sender' | null = t && TOKEN_RE.test(t) ? 'recipient' : s && TOKEN_RE.test(s) ? 'sender' : null
    if (!mode) return json({ state: 'invalid' })
    const { data: g } = await supabase
      .from('gift_links')
      .select('*')
      .eq(mode === 'recipient' ? 'token' : 'sender_token', mode === 'recipient' ? t : s)
      .maybeSingle()
    if (!g) return json({ state: 'invalid' })

    const expired = g.status === 'awaiting_input' && new Date(g.expires_at).getTime() <= Date.now()
    const state = expired ? 'expired' : g.status === 'sender_manual' ? 'confirmed' : g.status

    if (action === 'get') {
      const base = {
        state,
        mode,
        recipient_name: firstName(g.recipient_name),
        sender_name: mode === 'sender' || g.sender_name_visible ? firstName(g.sender_name) : null,
        expires_at: g.expires_at,
      }
      if (state === 'confirmed') return json({ ...base, delivery_date: g.delivery_date, slot: g.recipient_slot })
      if (state !== 'awaiting_input') return json(base)
      const { data: dates } = await supabase.rpc('gift_available_dates', { p_order_id: g.order_id, p_days: 10 })
      return json({ ...base, dates: dates ?? [] })
    }

    if (action === 'confirm') {
      if (state !== 'awaiting_input') return json({ error: 'not_open', state }, 409)
      const address = txt(body.address, 160), city = txt(body.city, 80), psc = txt(body.psc, 10)
      const date = txt(body.date, 10), slot = txt(body.slot, 10)
      if (!address || !city || !psc) return json({ error: 'address_required' }, 400)
      if (!PRAGUE_PSC.test(psc)) return json({ error: 'outside_zone' }, 400)
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !slot || !SLOTS.includes(slot)) return json({ error: 'slot_required' }, 400)
      // termín musí být mezi nabízenými a slot otevřený (znovu na serveru, ne podle prohlížeče)
      const { data: dates } = await supabase.rpc('gift_available_dates', { p_order_id: g.order_id, p_days: 10 })
      const day = (dates ?? []).find((d: { date: string }) => d.date === date)
      const open = day && day.slots.some((x: { label: string; open: boolean }) => x.label === slot && x.open)
      if (!open) return json({ error: 'slot_unavailable' }, 409)

      const lat = Number(body.lat), lng = Number(body.lng)
      const floor = txt(body.floor, 20), apartment = txt(body.apartment, 20), intercom = txt(body.intercom, 40)
      const note = txt(body.note, 300), phone = txt(body.phone, 30)
      const newStatus = mode === 'recipient' ? 'confirmed' : 'sender_manual'

      // jen jednou: podmínka na status chrání proti dvojímu odeslání
      const { data: upd } = await supabase
        .from('gift_links')
        .update({ status: newStatus, recipient_address: `${address}, ${psc} ${city}`, recipient_slot: slot, delivery_date: date, closed_at: new Date().toISOString() })
        .eq('id', g.id)
        .eq('status', 'awaiting_input')
        .select('id')
        .maybeSingle()
      if (!upd) return json({ error: 'not_open' }, 409)

      const { data: order } = await supabase.from('tilda_orders').select('comments, customer_email, recipient_phone').eq('order_id', g.order_id).maybeSingle()
      const patch: Record<string, unknown> = {
        address, city, psk: psc, patro: floor ?? '', cislo_bytu: apartment ?? '', kod_intercomu: intercom ?? '',
        delivery_date: date, delivery_slot: slot, gift_status: newStatus,
        comments: [order?.comments, note ? `🎁 Pozn. příjemce: ${note}` : null].filter(Boolean).join('\n'),
      }
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0) { patch.recipient_lat = lat; patch.recipient_lng = lng }
      if (phone) patch.recipient_phone = phone
      await supabase.from('tilda_orders').update(patch).eq('order_id', g.order_id)

      // zprávu manažerům posílá trigger gift_links_after_confirm (migrace 20261006000000)
      const senderEmail = g.sender_email || order?.customer_email
      if (senderEmail && mode === 'recipient') {
        await supabase.rpc('notify_brevo', {
          p_payload: { event: 'gift_confirmed', order_id: g.order_id, email: senderEmail, recipient_name: firstName(g.recipient_name), delivery_date: date, delivery_time: slot },
        })
      }
      return json({ ok: true, state: 'confirmed', delivery_date: date, slot })
    }

    if (action === 'optout') {
      if (mode !== 'recipient') return json({ error: 'recipient_only' }, 403)
      if (state !== 'awaiting_input' && state !== 'expired') return json({ ok: true, state })
      const hash = g.contact_hash ?? (await supabase.rpc('gift_contact_hash', { p_handle: g.recipient_handle })).data
      if (hash) await supabase.from('gift_do_not_contact').upsert({ contact_hash: hash }, { onConflict: 'contact_hash' })
      await supabase.rpc('gift_close', { p_gift_id: g.id, p_status: 'opted_out' })
      return json({ ok: true, state: 'opted_out' })
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
