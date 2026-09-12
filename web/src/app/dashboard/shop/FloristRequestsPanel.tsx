"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decodeHtmlEntities } from "@/lib/format";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";
import { useDashboard } from "../layout";

// Флорист лучше менеджера знает, какие цветы нужны для её букетов —
// здесь можно попросить цветок на дату напрямую, вместо объяснений на
// словах. Видно и менеджеру (может отметить "заказано"/"отклонить"), и
// складу (может добавлять и удалять свои же пожелания) — доступ
// разграничен в RLS таблицы florist_flower_requests, а не только в UI.

type Material = { id: string; product_name: string };
type Request = {
  id: string;
  product_sticker_id: string;
  needed_date: string;
  quantity: number;
  note: string | null;
  status: "pending" | "ordered" | "dismissed";
  requested_by: string | null;
};

function pragueToday(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
}

export function FloristRequestsPanel() {
  const { user, profile } = useDashboard();
  const isManager = profile?.role === "manager";

  const [materials, setMaterials] = useState<Material[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  const [materialId, setMaterialId] = useState("");
  const [neededDate, setNeededDate] = useState(pragueToday());
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const [materialsRes, requestsRes] = await Promise.all([
      supabase.from("product_stickers").select("id, product_name").eq("category", "ohapka").order("product_name"),
      supabase
        .from("florist_flower_requests")
        .select("id, product_sticker_id, needed_date, quantity, note, status, requested_by")
        .order("needed_date"),
    ]);
    setMaterials(materialsRes.data ?? []);
    setRequests((requestsRes.data ?? []) as Request[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useRealtimeRefresh("florist_flower_requests", load);

  async function addRequest() {
    if (!materialId || !(Number(quantity) > 0)) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: insertErr } = await supabase.from("florist_flower_requests").insert({
        product_sticker_id: materialId,
        needed_date: neededDate,
        quantity: Number(quantity),
        note: note.trim() || null,
        requested_by: user.id,
      });
      if (insertErr) throw insertErr;
      setMaterialId("");
      setQuantity("");
      setNote("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: Request["status"]) {
    const supabase = createClient();
    await supabase.from("florist_flower_requests").update({ status }).eq("id", id);
    load();
  }

  async function remove(id: string) {
    const supabase = createClient();
    await supabase.from("florist_flower_requests").delete().eq("id", id);
    load();
  }

  function materialName(id: string) {
    return decodeHtmlEntities(materials.find((m) => m.id === id)?.product_name ?? "—");
  }

  if (loading) return <p className="text-xs text-zinc-400">Загрузка…</p>;

  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Пожелания флориста</p>
      <p className="text-xs text-zinc-400">Попроси цветок на дату напрямую — менеджер увидит и закажет у поставщика.</p>

      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-zinc-200 p-2 dark:border-zinc-700">
        <select
          value={materialId}
          onChange={(e) => setMaterialId(e.target.value)}
          className="max-w-[10rem] rounded-md border border-zinc-300 bg-transparent px-1 py-1 text-xs outline-none focus:border-accent dark:border-zinc-600"
        >
          <option value="">какой цветок…</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {decodeHtmlEntities(m.product_name)}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={neededDate}
          onChange={(e) => setNeededDate(e.target.value)}
          className="rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-accent dark:border-zinc-600"
        />
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="шт"
          type="number"
          className="w-16 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-accent dark:border-zinc-600"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="комментарий (необязательно)"
          className="min-w-[10rem] flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-accent dark:border-zinc-600"
        />
        <button
          onClick={addRequest}
          disabled={saving || !materialId || !(Number(quantity) > 0)}
          className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {saving ? "…" : "Попросить"}
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="space-y-1.5">
        {pending.length === 0 && <p className="text-xs text-zinc-400">Пожеланий пока нет.</p>}
        {pending.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-700"
          >
            <div>
              <span className="font-medium">{materialName(r.product_sticker_id)}</span> × {r.quantity} на {r.needed_date}
              {r.note && <span className="text-zinc-400"> — {r.note}</span>}
            </div>
            <div className="flex gap-1.5">
              {isManager && (
                <>
                  <button onClick={() => setStatus(r.id, "ordered")} className="text-emerald-600 hover:underline dark:text-emerald-400">
                    Заказано
                  </button>
                  <button onClick={() => setStatus(r.id, "dismissed")} className="text-zinc-400 hover:text-red-500">
                    Отклонить
                  </button>
                </>
              )}
              {(isManager || r.requested_by === user.id) && (
                <button onClick={() => remove(r.id)} className="text-zinc-400 hover:text-red-500">
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {resolved.length > 0 && (
        <details className="text-xs text-zinc-400">
          <summary className="cursor-pointer">Закрытые пожелания ({resolved.length})</summary>
          <div className="mt-1 space-y-1">
            {resolved.map((r) => (
              <p key={r.id}>
                {materialName(r.product_sticker_id)} × {r.quantity} на {r.needed_date} — {r.status === "ordered" ? "заказано" : "отклонено"}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
