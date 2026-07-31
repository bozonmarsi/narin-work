"use client";

import { useEffect, useRef } from "react";
import { createClient } from "./supabase/client";

// Subscribes to Postgres changes on `table` and calls `onChange` (typically
// a page's own `load()`) whenever a row is inserted/updated/deleted —
// pages stay fresh without the user having to manually reload. Bursts of
// several changes in quick succession are coalesced into one refresh
// instead of refetching once per row.
export function useRealtimeRefresh(table: string, onChange: () => void) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const supabase = createClient();
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel(`realtime-${table}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => onChangeRef.current(), 300);
      })
      .subscribe();

    return () => {
      if (timeout) clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [table]);
}
