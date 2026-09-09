"use client";

import { useState } from "react";
import { OrdersView } from "./OrdersView";
import { ReceiveTab } from "./ReceiveTab";
import { SuppliersTab } from "./SuppliersTab";
import { RecipesTab } from "./RecipesTab";
import { CatalogTab } from "./CatalogTab";
import { SidePanel } from "./Modal";

type PanelKey = "receive" | "recipes" | "suppliers";

const NAV_ITEMS: { key: PanelKey; label: string; icon: string }[] = [
  { key: "receive", label: "Приёмка", icon: "📦" },
  { key: "recipes", label: "Рецепты", icon: "📋" },
  { key: "suppliers", label: "Поставщики", icon: "🚚" },
];

const PANEL_TITLES: Record<PanelKey, string> = {
  receive: "Приёмка партии",
  recipes: "Рецепты букетов",
  suppliers: "Поставщики",
};

function PanelContent({ panel, onOpenCatalog }: { panel: PanelKey; onOpenCatalog: () => void }) {
  if (panel === "receive") return <ReceiveTab onOpenCatalog={onOpenCatalog} />;
  if (panel === "recipes") return <RecipesTab onOpenCatalog={onOpenCatalog} />;
  return <SuppliersTab />;
}

export function WarehouseView() {
  const [panel, setPanel] = useState<PanelKey>("receive");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mobileCatalogOpen, setMobileCatalogOpen] = useState(false);
  const openCatalog = () => setMobileCatalogOpen(true);

  return (
    <div className="flex h-[calc(100vh-100px)] gap-4">
      {/* Левая колонка (2/3): заказы сверху, каталог+остатки снизу — им
          нужно больше места для просмотра, чем заказам. */}
      <div className="flex w-full flex-col gap-4 overflow-hidden pb-20 md:w-2/3 md:pb-0">
        <div className="max-h-[38%] shrink-0 overflow-y-auto">
          <OrdersView />
        </div>
        <div className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 md:flex">
          <div className="shrink-0 border-b border-zinc-100 dark:border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-semibold">Каталог</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <CatalogTab />
          </div>
        </div>
      </div>

      {/* Правая колонка (1/3): приёмка / рецепты / поставщики */}
      <div className="hidden md:flex md:w-1/3 flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex shrink-0 border-b border-zinc-100 dark:border-zinc-800">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => setPanel(item.key)}
              className={`flex-1 border-b-2 px-2 py-2.5 text-xs font-medium ${
                panel === item.key
                  ? "border-accent text-accent"
                  : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              <span className="block text-base leading-none">{item.icon}</span>
              <span className="mt-0.5 block">{item.label}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <PanelContent panel={panel} onOpenCatalog={openCatalog} />
        </div>
      </div>

      {/* Мобильный: нижняя панель, всё открывается на весь экран */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex md:hidden items-center justify-around border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1.5">
        <button
          onClick={openCatalog}
          className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[9px] font-medium text-zinc-500 dark:text-zinc-400"
        >
          <span className="text-lg leading-none">🌷</span>
          Каталог
        </button>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => {
              setPanel(item.key);
              setMobilePanelOpen(true);
            }}
            className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[9px] font-medium text-zinc-500 dark:text-zinc-400"
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {mobilePanelOpen && (
        <SidePanel title={PANEL_TITLES[panel]} onClose={() => setMobilePanelOpen(false)}>
          <PanelContent panel={panel} onOpenCatalog={openCatalog} />
        </SidePanel>
      )}

      {mobileCatalogOpen && (
        <SidePanel title="Каталог" onClose={() => setMobileCatalogOpen(false)}>
          <CatalogTab />
        </SidePanel>
      )}
    </div>
  );
}
