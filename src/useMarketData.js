import { useEffect, useMemo, useState } from "react";
import { marketRequest } from "./online.js";
export function useMarketData(accounts, symbols) {
  const request = useMemo(
    () => marketRequest(accounts, symbols),
    [accounts, symbols],
  );
  const key = JSON.stringify(request);
  const [saved, setSaved] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0),
    [clock, setClock] = useState(Date.now());
  useEffect(() => {
    if (!accounts.length) return;
    let cancelled = false,
      timer;
    const controller = new AbortController();
    async function refresh() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/market", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: key,
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(120000),
          ]),
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error || `HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!data.fx || !data.instruments || !data.to)
          throw new Error(
            "Serwer nie zwrócił notowań. Uruchom aplikację przez npm run dev lub npm start.",
          );
        if (!cancelled) setSaved({ key, data });
      } catch (e) {
        if (!cancelled)
          setError(
            e.name === "TimeoutError"
              ? "Przekroczono czas pobierania notowań. Spróbuj ponownie."
              : e.message,
          );
      } finally {
        if (!cancelled) {
          setLoading(false);
          setClock(Date.now());
          timer = setTimeout(refresh, 60000);
        }
      }
    }
    refresh();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [key, revision, accounts.length]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const data = saved?.key === key ? saved.data : null;
  return {
    data,
    error,
    loading,
    stale: data ? clock - Date.parse(data.fetchedAt) > 150000 : false,
    refresh: () => setRevision((x) => x + 1),
  };
}
