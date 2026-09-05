"use client";

import { useState } from "react";
import { ReceiveTab } from "./ReceiveTab";
import { SuppliersTab } from "./SuppliersTab";
import { StockTab } from "./StockTab";

const TABS = [
  { key: "receive", label: "Приёмка" },
  { key: "stock", label: "Остатки" },
  { key: "suppliers", label: "Поставщики" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function WarehouseView() {
  const [tab, setTab] = useState<TabKey>("receive");

  return (
    <div>
      <div className="mb-5 flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-accent text-accent"
                : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "receive" && <ReceiveTab />}
      {tab === "stock" && <StockTab />}
      {tab === "suppliers" && <SuppliersTab />}
    </div>
  );
}
