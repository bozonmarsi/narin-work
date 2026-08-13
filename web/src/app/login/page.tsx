"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "../ThemeToggle";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setPending(false);
      setError("Неверный email или пароль");
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <div className="relative flex flex-1 items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-8 shadow-sm"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">NARIN WORK</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Вход для сотрудников</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            Пароль
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        {error && <p className="rounded-md bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-accent py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Входим…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
