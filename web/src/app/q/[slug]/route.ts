// Короткие ссылки для QR-кодов на печатных карточках NARIN:
// narin-work.vercel.app/q/<slug> → считает скан (таблица qr_scans) и
// перенаправляет дальше. Чтобы QR вёл в другое место, достаточно поменять
// адрес здесь — напечатанные карточки перепечатывать не нужно.
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const TARGETS: Record<string, string> = {
  // карточка ухода, лицевая/обратная сторона
  sos: "https://vezminarin.cz/atelier?utm_source=karticka&utm_content=sos#sos",
  review: "https://vezminarin.cz/members/review?utm_source=karticka&utm_content=review",
  radio: "https://open.spotify.com/playlist/5l4XyEmCaPG9dbpPBj4nzZ",
};

const FALLBACK = "https://vezminarin.cz/?utm_source=karticka";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const key = slug.toLowerCase();
  const target = TARGETS[key] ?? FALLBACK;

  if (TARGETS[key]) {
    // Сбой записи не должен мешать переходу: ждём не дольше 1,5 с.
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const log = supabase.rpc("log_qr_scan", { p_slug: key, p_user_agent: request.headers.get("user-agent") });
    await Promise.race([log, new Promise((resolve) => setTimeout(resolve, 1500))]).catch(() => {});
  }

  return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store" } });
}
