"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

// Подарки без адреса (миграция 20261004000000_gift_without_address):
// менеджер ВРУЧНУЮ пишет получателю с готовым текстом и ссылкой, потом
// жмёт «Отправил». Пока не нажал — каждые 30 мин напоминание в Telegram.
type GiftLink = {
  id: string;
  order_id: string;
  token: string;
  recipient_channel: "telegram" | "whatsapp" | "instagram" | "phone";
  recipient_handle: string | null;
  recipient_name: string | null;
  sender_name: string | null;
  sender_name_visible: boolean;
  created_at: string;
  expires_at: string;
  manager_sent_at: string | null;
  reminder_3h_sent: boolean;
  reminder_12h_sent: boolean;
  sender_notified_at: string | null;
};

const CHANNEL_LABEL: Record<GiftLink["recipient_channel"], string> = {
  phone: "SMS / звонок",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
};
const PRIVACY_URL = "https://vezminarin.cz/ochrana-osobnich-udaju";

function contactUrl(g: GiftLink) {
  const handle = g.recipient_handle ?? "";
  const digits = handle.replace(/\D/g, "");
  const phone = digits.length === 9 ? `420${digits}` : digits;
  switch (g.recipient_channel) {
    case "whatsapp":
      return `https://wa.me/${phone}?text=${encodeURIComponent(message(g))}`;
    case "telegram":
      return /[A-Za-z]/.test(handle) ? `https://t.me/${handle.replace(/^@/, "")}` : `https://t.me/+${phone}`;
    case "instagram":
      return `https://ig.me/m/${handle.replace(/^@/, "")}`;
    default:
      return `sms:+${phone}?&body=${encodeURIComponent(message(g))}`;
  }
}

// Первое сообщение получателю обязано сказать, кто мы, откуда номер и как
// отказаться (см. GDPR в спецификации) — поэтому текст готовый, не «от руки».
function message(g: GiftLink) {
  const who = g.sender_name_visible && g.sender_name ? g.sender_name.split(/\s+/)[0] : "Někdo";
  const hi = g.recipient_name ? `Dobrý den, ${g.recipient_name.split(/\s+/)[0]},` : "Dobrý den,";
  return (
    `${hi} tady květinářství NARIN (vezminarin.cz). ${who} vám posílá kytici 💐 ` +
    `Kam a kdy vám ji máme přivézt? Zadejte to prosím tady (platí 48 hodin): ` +
    `https://vezminarin.cz/prijem-daru?t=${g.token}\n\n` +
    `Váš kontakt nám dal odesílatel a použijeme ho jen kvůli tomuto doručení. ` +
    `Nechcete-li dárek, klikněte v odkazu na „Dárek nechci“ nebo odepište STOP. ${PRIVACY_URL}`
  );
}

function ago(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  return `${h} ч ${min % 60} мин`;
}
function left(iso: string) {
  const min = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 60000));
  return `${Math.floor(min / 60)} ч`;
}

export function GiftLinksPanel() {
  const [gifts, setGifts] = useState<GiftLink[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await createClient()
      .from("gift_links")
      .select(
        "id, order_id, token, recipient_channel, recipient_handle, recipient_name, sender_name, sender_name_visible, created_at, expires_at, manager_sent_at, reminder_3h_sent, reminder_12h_sent, sender_notified_at",
      )
      .eq("status", "awaiting_input")
      .order("created_at", { ascending: true });
    if (error) {
      // чаще всего — ещё не запущен SQL 20261004000000_gift_without_address
      setLoadError(/gift_links/.test(error.message) || error.code === "42P01" || error.code === "PGRST205"
        ? "Таблица gift_links не найдена — запустите SQL «Dárek bez adresy» в Supabase."
        : error.message);
      return;
    }
    setLoadError(null);
    setGifts((data ?? []) as GiftLink[]);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000); // таймеры «ждёт N мин» и на случай пропущенного realtime
    return () => clearInterval(t);
  }, [load]);
  useRealtimeRefresh("gift_links", load);

  async function markSent(g: GiftLink) {
    setBusy(g.id);
    await createClient().from("gift_links").update({ manager_sent_at: new Date().toISOString() }).eq("id", g.id);
    setBusy(null);
    load();
  }

  async function copy(g: GiftLink) {
    try {
      await navigator.clipboard.writeText(message(g));
      setCopied(g.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Скопируйте текст:", message(g));
    }
  }

  if (loadError) {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
        🎁 Подарки без адреса: {loadError}
      </section>
    );
  }

  if (!gifts.length) {
    return (
      <section className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 text-sm">
        <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
          <span className="font-medium">🎁 Подарки без адреса</span>
          <span className="text-xs text-zinc-500">нет новых {open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            Когда клиент на оплате выберет «🎁 Ať ji zadá sám», заказ появится здесь: кнопка написать получателю, готовый текст со
            ссылкой и «Отправил». Пока адрес не указан, заказ в канбане нельзя подтвердить.
          </p>
        )}
      </section>
    );
  }

  // неотправленные — наверх, дольше ждущие выше
  const sorted = [...gifts].sort((a, b) => {
    if (!a.manager_sent_at !== !b.manager_sent_at) return a.manager_sent_at ? 1 : -1;
    return a.created_at.localeCompare(b.created_at);
  });

  return (
    <section className="space-y-2 rounded-lg border border-pink-200 dark:border-pink-500/30 bg-pink-50 dark:bg-pink-500/10 p-4">
      <h2 className="font-semibold text-pink-700 dark:text-pink-300">🎁 Подарки без адреса ({gifts.length})</h2>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Напишите получателю сами (с рабочего аккаунта), вставьте готовый текст и нажмите «Отправил». Через 48 ч без адреса заказ
        отменится автоматически, а вам придёт задача вернуть деньги.
      </p>
      <div className="space-y-2">
        {sorted.map((g) => {
          const waiting = !g.manager_sent_at;
          return (
            <div
              key={g.id}
              className={`rounded-md bg-white dark:bg-zinc-900 p-3 text-sm ${waiting ? "ring-2 ring-red-300 dark:ring-red-500/40" : ""}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  #{g.order_id} · {g.sender_name ?? "?"} → {g.recipient_name ?? "получатель"}
                  {!g.sender_name_visible && <span className="ml-1 text-xs text-zinc-500">(анонимно)</span>}
                </span>
                <span className={`text-xs ${waiting ? "font-semibold text-red-600 dark:text-red-400" : "text-zinc-500"}`}>
                  {waiting ? `НЕ отправлено · ждёт ${ago(g.created_at)}` : `отправлено ${ago(g.manager_sent_at!)} назад`} · до отмены{" "}
                  {left(g.expires_at)}
                </span>
              </div>
              <div className="mt-1 text-zinc-600 dark:text-zinc-300">
                {CHANNEL_LABEL[g.recipient_channel]}: <span className="font-mono">{g.recipient_handle ?? "—"}</span>
                {g.reminder_3h_sent && !g.reminder_12h_sent && " · молчит 3 ч, напишите ещё раз"}
                {g.reminder_12h_sent && " · молчит 12 ч"}
                {g.sender_notified_at && " · отправителю ушло письмо"}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={contactUrl(g)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white"
                >
                  Открыть {CHANNEL_LABEL[g.recipient_channel]}
                </a>
                <button
                  onClick={() => copy(g)}
                  className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-xs"
                >
                  {copied === g.id ? "Скопировано ✓" : "Скопировать текст"}
                </button>
                {waiting ? (
                  <button
                    onClick={() => markSent(g)}
                    disabled={busy === g.id}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Отправил
                  </button>
                ) : (
                  <button
                    onClick={() => markSent(g)}
                    disabled={busy === g.id}
                    className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-xs"
                  >
                    Написал ещё раз
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
