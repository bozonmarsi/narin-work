// Данные каталога для vezminarin.cz (tilda/blocks/catalog-unified.html):
// категории, наличие, плашки — то же, что RPC get_catalog_page_data.
//
// Зачем прослойка, а не прямой запрос браузера в Supabase: ответ кэширует
// CDN Vercel (s-maxage), поэтому посетители получают его с ближайшего узла
// за десятки миллисекунд, а в базу идёт не больше одного запроса в 20 с,
// сколько бы людей ни открыло каталог. Если база в этот момент не отвечает,
// CDN продолжает отдавать последнюю удачную версию (stale-while-revalidate),
// а этот экземпляр функции — последнюю удачную из памяти.
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

let lastGood: unknown = null;

export async function GET() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 6000));
  try {
    const { data, error } = await Promise.race([supabase.rpc("get_catalog_page_data"), timeout]);
    if (error || !data) throw error ?? new Error("empty");
    lastGood = data;
    return Response.json(data, {
      headers: { ...CORS, "Cache-Control": "public, s-maxage=20, stale-while-revalidate=86400" },
    });
  } catch {
    if (lastGood) {
      // короткий кэш: как только база ожила, CDN быстро возьмёт свежие данные
      return Response.json(lastGood, { headers: { ...CORS, "Cache-Control": "public, s-maxage=5" } });
    }
    return Response.json({ error: "unavailable" }, { status: 503, headers: { ...CORS, "Cache-Control": "no-store" } });
  }
}

export function OPTIONS() {
  return new Response(null, { headers: CORS });
}
