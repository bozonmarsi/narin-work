"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Supplier } from "./types";

export function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, { contact_phone: string; contact_email: string }>>({});

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.from("suppliers").select("id, name, contact_phone, contact_email").order("name");
    setSuppliers(data ?? []);
    setEditing(
      Object.fromEntries(
        (data ?? []).map((s) => [s.id, { contact_phone: s.contact_phone ?? "", contact_email: s.contact_email ?? "" }])
      )
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(id: string) {
    const supabase = createClient();
    await supabase.from("suppliers").update(editing[id]).eq("id", id);
  }

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загрузка…</p>;
  }

  if (suppliers.length === 0) {
    return <p className="text-sm text-zinc-400">Поставщиков пока нет — добавь на вкладке «Приёмка».</p>;
  }

  return (
    <div className="max-w-xl space-y-2">
      {suppliers.map((s) => (
        <div key={s.id} className="rounded-md border border-zinc-200 dark:border-zinc-700 p-3">
          <p className="mb-2 text-sm font-medium">{s.name}</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={editing[s.id]?.contact_phone ?? ""}
              onChange={(e) => setEditing((p) => ({ ...p, [s.id]: { ...p[s.id], contact_phone: e.target.value } }))}
              onBlur={() => save(s.id)}
              placeholder="Телефон"
              className="w-40 rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-2 py-1 text-sm outline-none focus:border-accent"
            />
            <input
              value={editing[s.id]?.contact_email ?? ""}
              onChange={(e) => setEditing((p) => ({ ...p, [s.id]: { ...p[s.id], contact_email: e.target.value } }))}
              onBlur={() => save(s.id)}
              placeholder="Email"
              className="w-52 rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-2 py-1 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
