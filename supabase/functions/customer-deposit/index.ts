// Depozit klienta v osobnim uctu (karta "Depozit" na /members).
//
//   get - zustatek + z ceho se sklada (davky s datem platnosti, napr. z dárkového
//         poukazu) + poslednich 20 pohybu (poukaz, propadnuti, platba depozitem...).
//
// Token je ten sdileny lk_auth_token (podepsany AUTH_TOKEN_SECRET), e-mail se bere
// z nej, ne z pozadavku. Cte se pres service key, klient k tabulkam primo nema pristup.

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
    return payload.email
  } catch {
    return null
  }
}

// ilike bere "_" a "%" jako zastupne znaky, e-mail je ma uplne bezne.
const likeEscape = (s: string) => s.replace(/[\\%_]/g, '\\$&')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { action, token } = await req.json()
    if (!token || !action) return json({ error: 'token and action required' }, 400)

    const email = await verifyToken(token, Deno.env.get('AUTH_TOKEN_SECRET')!)
    if (!email) return json({ error: 'invalid_token' }, 401)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    if (action === 'get') {
      const like = likeEscape(String(email).trim())

      const { data: dep, error } = await supabase.from('customer_deposits').select('balance').ilike('email', like).maybeSingle()
      if (error) return json({ error: error.message }, 500)

      // Davky, ktere jeste neco obsahuji. Ty s datem platnosti jdou prvni, nejblizsi vyprseni nahore
      // (stejne poradi, v jakem se z nich plati).
      const { data: lots } = await supabase
        .from('deposit_lots')
        .select('remaining, expires_at, source')
        .ilike('email', like)
        .gt('remaining', 0)
        .is('expired_at', null)
        .order('expires_at', { ascending: true, nullsFirst: false })

      const { data: history } = await supabase
        .from('deposit_transactions')
        .select('amount, type, description, created_at')
        .ilike('user_email', like)
        .order('created_at', { ascending: false })
        .limit(20)

      return json({ balance: dep ? dep.balance : 0, lots: lots ?? [], history: history ?? [] })
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
