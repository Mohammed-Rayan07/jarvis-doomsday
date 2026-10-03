"use client";
import { useCallback, useEffect, useState } from "react";
import type { JarvisErrorShape } from "@/lib/types";

/** Fetch an API envelope ({ok,data}|{ok:false,error}) and refetch whenever `version` changes. */
export function useFeed<T>(url: string | null, version: number, pollMs?: number) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<JarvisErrorShape | undefined>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!url) return;
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: { "x-jarvis-tz": Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      const json = await res.json();
      if (json.ok) {
        setData(json.data as T);
        setError(undefined);
      } else setError(json.error);
    } catch (err) {
      setError({ code: "NETWORK", message: err instanceof Error ? err.message : "Network link lost." });
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    // load() only sets state after an awaited fetch, so this can't cascade synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, version]);

  useEffect(() => {
    if (!pollMs) return;
    const id = setInterval(() => void load(), pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return { data, error, loading, reload: load };
}
