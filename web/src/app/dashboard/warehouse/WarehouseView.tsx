"use client";

import { useState } from "react";
import { OrdersView } from "./OrdersView";
import { ReceiveTab } from "./ReceiveTab";
import { SuppliersTab } from "./SuppliersTab";
import { StockTab } from "./StockTab";
import { RecipesTab } from "./RecipesTab";
import { SidePanel } from "./Modal";

type PanelKey = "receive" | "stock" | "recipes" | "suppliers";

const NAV_ITEMS: { key: PanelKey; label: string; icon: string }[] = [
  { key: "receive", label: "Приёмка", icon: "📦" },
  { key: "stock", label: "Остатки", icon: "🌿" },
  { key: "recipes", label: "Рецепты", icon: "📋" },
  { key: "suppliers", label: "Поставщики", icon: "🚚" },
];

const PANEL_TITLES: Record<PanelKey, string> = {
  receive: "Приёмка партии",
  stock: "Остатки на складе",
  recipes: "Рецепты букетов",
  suppliers: "Поставщики",
};

export function WarehouseView() {
  const [panel, setPanel] = useState<PanelKey | null>(null);

  return (
    <div className="flex h-[calc(100vh-100px)]">
      {/* Десктоп: боковая панель */}
      <nav className="hidden md:flex w-16 shrink-0 flex-col items-center gap-1 border-r border-zinc-100 dark:border-zinc-800 py-3">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => setPanel(item.key)}
            title={item.label}
            className={`flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-medium ${
              panel === item.key
                ? "bg-accent/10 text-accent"
                : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Главная область — всегда заказы */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-20 md:pb-4">
        <OrdersView />
      </div>

      {/* Мобильный: нижняя панель */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex md:hidden items-center justify-around border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1.5">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => setPanel(item.key)}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[10px] font-medium ${
              panel === item.key ? "text-accent" : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {panel && (
        <SidePanel title={PANEL_TITLES[panel]} onClose={() => setPanel(null)}>
          {panel === "receive" && <ReceiveTab />}
          {panel === "stock" && <StockTab />}
          {panel === "recipes" && <RecipesTab />}
          {panel === "suppliers" && <SuppliersTab />}
        </SidePanel>
      )}
    </div>
  );
}
