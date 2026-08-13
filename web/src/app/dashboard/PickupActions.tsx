"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Self-pickup orders skip the whole courier part of the workflow — nobody
// is assigned, so nothing else ever pushes the status forward. Until a
// dedicated florist/warehouse role exists, the manager stands in for that
// role here with two plain buttons instead of the big status dropdown.
export function PickupActions({
  orderId,
  status,
  onDone,
}: {
  orderId: string;
  status: string | null;
  onDone: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function advance(newStatus: string, note: string) {
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

    const { error } = await supabase.from("tilda_orders").update({ status: newStatus }).eq("id", orderId);
    if (error) {
      setError(error.message);
      setIsPending(false);
      return;
    }

    await supabase.from("order_status_history").insert({
      order_id: orderId,
      status: newStatus,
      changed_by: user.id,
      note,
    });

    setIsPending(false);
    onDone();
  }

  if (status === "confirmed") {
    return (
      <div className="flex flex-col gap-1">
        <button
          onClick={() => advance("assembled", "Букет собран, готов к самовывозу")}
          disabled={isPending}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          🌸 Собран, готов к выдаче
        </button>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  if (status === "assembled") {
    return (
      <div className="flex flex-col gap-1">
        <button
          onClick={() => advance("delivered", "Заказ выдан клиенту (самовывоз)")}
          disabled={isPending}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          ✅ Выдано клиенту
        </button>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  return null;
}
