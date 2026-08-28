"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "../ThemeToggle";
import type { User } from "@supabase/supabase-js";

type Profile = {
  full_name: string | null;
  role: string | null;
  telegram_chat_id: number | null;
  telegram_link_code: string | null;
};
type DashboardContextValue = { user: User; profile: Profile | null };

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used inside the dashboard layout");
  return ctx;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<{
    loading: boolean;
    user: User | null;
    profile: Profile | null;
  }>({ loading: true, user: null, profile: null });
  const [warehouseMapsUrl, setWarehouseMapsUrl] = useState<string | null>(null);
  const [showTelegramCode, setShowTelegramCode] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("users")
        .select("full_name, role, telegram_chat_id, telegram_link_code")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("profile fetch error", error);
      }

      if (active) {
        setState({ loading: false, user, profile: profile ?? null });
      }

      if (profile?.role === "courier") {
        const { data: warehouse } = await supabase.from("warehouse_location").select("lat, lng").eq("id", true).single();
        if (active && warehouse?.lat != null && warehouse?.lng != null) {
          setWarehouseMapsUrl(`https://www.google.com/maps/dir/?api=1&destination=${warehouse.lat},${warehouse.lng}`);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (state.loading || !state.user) {
    return (
      <div className="flex flex-1 items-center justify-center text-zinc-500 dark:text-zinc-400">Загрузка…</div>
    );
  }

  return (
    <DashboardContext.Provider value={{ user: state.user, profile: state.profile }}>
      <div className="flex flex-1 flex-col">
        <header className="border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">NARIN WORK</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {state.profile?.full_name ?? state.user.email} · {roleLabel(state.profile?.role)}
              </p>
            </div>
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowTelegramCode((v) => !v)}
                className={`rounded-md border px-2 py-1.5 text-sm ${
                  state.profile?.telegram_chat_id
                    ? "border-green-300 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10"
                    : "border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {state.profile?.telegram_chat_id ? "✓ Telegram" : "Подключить Telegram"}
              </button>
              {showTelegramCode && (
                <div className="absolute right-0 top-full z-10 mt-2 w-72 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 text-sm shadow-lg">
                  {state.profile?.telegram_chat_id ? (
                    <p className="text-zinc-600 dark:text-zinc-300">
                      Telegram уже подключён — уведомления приходят туда. Чтобы переподключить к другому чату,
                      напишите новый код боту.
                    </p>
                  ) : (
                    <p className="text-zinc-600 dark:text-zinc-300">Уведомления в Telegram ещё не подключены.</p>
                  )}
                  <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                    Откройте бота NARIN WORK в Telegram и отправьте:
                  </p>
                  <p className="mt-1 rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-1.5 font-mono text-xs">
                    /start {state.profile?.telegram_link_code}
                  </p>
                </div>
              )}
              {warehouseMapsUrl && (
                <a
                  href={warehouseMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Маршрут до склада"
                  className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  🏭 До склада
                </a>
              )}
              <ThemeToggle />
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Выйти
              </button>
            </div>
          </div>
          {state.profile?.role === "manager" && (
            <nav className="mt-3 flex gap-1">
              <Link
                href="/dashboard"
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  pathname === "/dashboard" ? "bg-accent text-white" : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                Заказы
              </Link>
              <Link
                href="/dashboard/shop"
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  pathname === "/dashboard/shop" ? "bg-accent text-white" : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                Магазин
              </Link>
              <Link
                href="/dashboard/users"
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  pathname === "/dashboard/users" ? "bg-accent text-white" : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                Клиенты
              </Link>
              <Link
                href="/dashboard/couriers"
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  pathname === "/dashboard/couriers" ? "bg-accent text-white" : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                Курьеры
              </Link>
              <Link
                href="/dashboard/archive"
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  pathname === "/dashboard/archive" ? "bg-accent text-white" : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                Архив
              </Link>
              <Link
                href="/dashboard/chat"
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  pathname === "/dashboard/chat" ? "bg-accent text-white" : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                Чат
              </Link>
              <Link
                href="/dashboard/subscriptions"
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  pathname.startsWith("/dashboard/subscriptions") ? "bg-accent text-white" : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                Подписки
              </Link>
              <Link
                href="/dashboard/business"
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  pathname.startsWith("/dashboard/business") ? "bg-accent text-white" : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                Бизнес
              </Link>
              <Link
                href="/dashboard/logs"
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  pathname === "/dashboard/logs" ? "bg-accent text-white" : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                Логи
              </Link>
            </nav>
          )}
        </header>
        <main className="flex-1 bg-zinc-50 dark:bg-zinc-950 px-6 py-6">{children}</main>
      </div>
    </DashboardContext.Provider>
  );
}

function roleLabel(role?: string | null) {
  switch (role) {
    case "manager":
      return "Менеджер";
    case "courier":
      return "Курьер";
    case "warehouse":
      return "Склад";
    default:
      return "Роль не назначена";
  }
}
