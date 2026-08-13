"use client";

import { useTheme } from "@/lib/useTheme";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
      className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
