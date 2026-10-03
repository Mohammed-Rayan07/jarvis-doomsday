"use client";
import { useEffect, useState } from "react";

/** Current time, re-rendering every `intervalMs` (keeps render pure for the React compiler lint). */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
