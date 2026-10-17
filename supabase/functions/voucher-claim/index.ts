// Pogasheniye darkovoj karty klientom (stranitsa /poukaz).
//
// Klient uzhe voshel cherez obshchij lk_auth_token (tot zhe, chto u vsekh
// vidzhetov sajta - nikakoj novoj stranitsy podtverzhdeniya). Token podpisan
// AUTH_TOKEN_SECRET i soderzhit email, poetomu summa zachislyaetsya tomu, kto
// real'no voshel, a ne tomu, kogo klient napisal v zaprose.
//
// Deystviya:
//   info  - proverit kod i pokazat summu/srok, nichego ne menyaya;
//   claim - pogasit kartu: summa srazu na depozit (SQL claim_voucher, odna
//           tranzakciya, zashchita ot povtora - strochka karty zablokirovana).
//
// Zashchita ot podbora: 5 neudachnykh popytok za 15 minut na email -> 429.
//
// Sekrety: AUTH_TOKEN_SECRET, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const encoder = new TextEncoder()

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

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
    return payload.email ? String(payload.email).trim().toLowerCase() : null
  } catch {
    return null
  }
}

// Kod: tolko bukvy/tsifry i defisy, razumnaya dlina.
function cleanCode(raw: unknown): string | null {
  const s = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '')
  const key = s.replace(/-/g, '')
  if (key.length < 8 || key.length > 20) return null
  return s
}

const REASONS: Record<string, string> = {
  voucher_not_found: 'not_found',
  already_claimed: 'already_claimed',
  voucher_inactive: 'not_active',
  voucher_void: 'void',
  voucher_expired: 'expired',
}

function reasonOf(message: string): string {
  for (const k of Object.keys(REASONS)) if (message.includes(k)) return REASONS[k]
  return 'error'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => null)
    const action = body?.action
    const token = body?.token
    if (!token || !action) return json({ error: 'token and action required' }, 400)

    const email = await verifyToken(token, Deno.env.get('AUTH_TOKEN_SECRET')!)
    if (!email) return json({ error: 'invalid_token' }, 401)

    const code = cleanCode(body?.code)
    if (!code) return json({ error: 'bad_code' }, 400)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { count: fails } = await supabase
      .from('voucher_claim_attempts')
      .select('id', { count: 'exact', head: true })
      .ilike('email', email)
      .eq('ok', false)
      .gte('created_at', since)
    if ((fails ?? 0) >= 5) return json({ error: 'too_many_attempts' }, 429)

    const key = code.replace(/-/g, '')

    if (action === 'info') {
      const { data } = await supabase
        .from('gift_vouchers')
        .select('amount, status, expires_at')
        .eq('code_key', key)
        .maybeSingle()
      if (!data) {
        await supabase.from('voucher_claim_attempts').insert({ email, ok: false, reason: 'not_found' })
        return json({ ok: false, reason: 'not_found' })
      }
      if (data.status !== 'active') {
        const reason = data.status === 'claimed' ? 'already_claimed' : data.status === 'inactive' ? 'not_active' : data.status
        return json({ ok: false, reason })
      }
      if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return json({ ok: false, reason: 'expired' })
      return json({ ok: true, amount: data.amount, valid_until: data.expires_at })
    }

    if (action === 'claim') {
      const { data, error } = await supabase.rpc('claim_voucher', { p_email: email, p_code: code })
      if (error) {
        const reason = reasonOf(error.message)
        await supabase.from('voucher_claim_attempts').insert({ email, ok: false, reason })
        return json({ ok: false, reason })
      }
      await supabase.from('voucher_claim_attempts').insert({ email, ok: true, reason: 'claimed' })
      const row = Array.isArray(data) ? data[0] : data
      return json({ ok: true, balance: row?.new_balance, amount: row?.voucher_amount, valid_until: row?.valid_until })
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
