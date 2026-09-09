export function freshness(wiltDate: string | null): { label: string; className: string } {
  if (!wiltDate) return { label: "—", className: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500" };
  const days = Math.round((new Date(wiltDate).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: "просрочено", className: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400" };
  if (days <= 2) return { label: `${days} дн.`, className: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400" };
  return { label: `${days} дн.`, className: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
}
