"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CourierOption } from "./types";

export function AssignCourier({
  orderId,
  couriers,
  onDone,
}: {
  orderId: string;
  couriers: CourierOption[];
  onDone: () => void;
}) {
  const [courierId, setCourierId] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAssign() {
    if (!courierId) return;
    setError(null);
    setIsPending(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Не авторизован");
      setIsPending(false);
      return;
    }

    const { error } = await supabase
      .from("tilda_orders")
      .update({
        assigned_courier_id: courierId,
        status: "courier_assigned",
      })
      .eq("id", orderId);

    if (error) {
      setError(error.message);
      setIsPending(false);
      return;
    }

    const courierName = couriers.find((c) => c.id === courierId)?.full_name ?? "курьер";

    await supabase.from("order_status_history").insert({
      order_id: orderId,
      status: "courier_assigned",
      changed_by: user.id,
      note: `Назначен курьер: ${courierName}`,
    });

    setIsPending(false);
    onDone();
  }

  if (couriers.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Нет добавленных курьеров</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={courierId}
        onChange={(e) => setCourierId(e.target.value)}
        className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
      >
        <option value="">Выбрать курьера…</option>
        {couriers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.full_name ?? c.id}
          </option>
        ))}
      </select>
      <button
        onClick={handleAssign}
        disabled={!courierId || isPending}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        Назначить
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
