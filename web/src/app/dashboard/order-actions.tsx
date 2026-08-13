"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function OrderActions({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [isPending, setIsPending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
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
        status: "confirmed",
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (error) {
      setError(error.message);
      setIsPending(false);
      return;
    }

    await supabase.from("order_status_history").insert({
      order_id: orderId,
      status: "confirmed",
      changed_by: user.id,
    });

    setIsPending(false);
    onDone();
  }

  async function handleCancel() {
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
        status: "cancelled",
        cancelled_reason: reason || null,
      })
      .eq("id", orderId);

    if (error) {
      setError(error.message);
      setIsPending(false);
      return;
    }

    await supabase.from("order_status_history").insert({
      order_id: orderId,
      status: "cancelled",
      changed_by: user.id,
      note: reason || null,
    });

    setIsPending(false);
    setCancelling(false);
    onDone();
  }

  if (cancelling) {
    return (
      <div className="flex flex-col gap-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Причина отмены"
          className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-sm"
        />
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            disabled={isPending}
            className="rounded-md bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
          >
            Подтвердить отмену
          </button>
          <button
            onClick={() => setCancelling(false)}
            className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Назад
          </button>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={isPending}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          Подтвердить
        </button>
        <button
          onClick={() => setCancelling(true)}
          disabled={isPending}
          className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          Отменить
        </button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
