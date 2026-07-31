"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

type Profile = { full_name: string | null; role: string | null };
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
        .select("full_name, role")
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
      <div className="flex flex-1 items-center justify-center text-zinc-500">Загрузка…</div>
    );
  }

  return (
    <DashboardContext.Provider value={{ user: state.user, profile: state.profile }}>
      <div className="flex flex-1 flex-col">
        <header className="border-b border-zinc-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">NARIN WORK</p>
              <p className="text-sm text-zinc-500">
                {state.profile?.full_name ?? state.user.email} · {roleLabel(state.profile?.role)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {warehouseMapsUrl && (
                <a
                  href={warehouseMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Маршрут до склада"
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
                >
                  🏭 До склада
                </a>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
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
                  pathname === "/dashboard" ? "bg-accent text-white" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                Заказы
              </Link>
              <Link
                href="/dashboard/archive"
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  pathname === "/dashboard/archive" ? "bg-accent text-white" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                Архив
              </Link>
              <Link
                href="/dashboard/couriers"
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  pathname === "/dashboard/couriers" ? "bg-accent text-white" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                Курьеры
              </Link>
              <Link
                href="/dashboard/points"
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  pathname === "/dashboard/points" ? "bg-accent text-white" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                Баллы
              </Link>
              <Link
                href="/dashboard/logs"
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  pathname === "/dashboard/logs" ? "bg-accent text-white" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                Логи
              </Link>
            </nav>
          )}
        </header>
        <main className="flex-1 bg-zinc-50 px-6 py-6">{children}</main>
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
