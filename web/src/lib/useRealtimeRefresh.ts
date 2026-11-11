"use client";

import { useEffect, useRef } from "react";
import { createClient } from "./supabase/client";

// Subscribes to Postgres changes on `table` and calls `onChange` (typically
// a page's own `load()`) whenever a row is inserted/updated/deleted —
// pages stay fresh without the user having to manually reload. Bursts of
// several changes in quick succession are coalesced into one refresh
// instead of refetching once per row.
//
// While the browser tab is in the background nothing is refetched: the
// change is only remembered, and one refresh runs when the tab is shown
// again. Otherwise every forgotten open tab on every staff phone/laptop
// re-downloads the page on each order change.
export function useRealtimeRefresh(table: string, onChange: () => void) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const supabase = createClient();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let missedWhileHidden = false;

    const fire = () => {
      if (typeof document !== "undefined" && document.hidden) {
        missedWhileHidden = true;
        return;
      }
      onChangeRef.current();
    };

    const onVisible = () => {
      if (!document.hidden && missedWhileHidden) {
        missedWhileHidden = false;
        onChangeRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const channel = supabase
      .channel(`realtime-${table}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(fire, 500);
      })
      .subscribe();

    return () => {
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [table]);
}
