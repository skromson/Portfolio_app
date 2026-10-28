import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ExternalLink,
  Info,
  Newspaper,
  RefreshCw,
} from "lucide-react";
import "./news.css";
const published = (value) =>
  new Date(value).toLocaleString("pl-PL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const eventDay = (value) =>
  new Date(value + "T12:00:00").toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
export default function NewsPanel({ accounts, symbols = {} }) {
  const tickers = useMemo(
    () =>
      [
        ...new Set(accounts.flatMap((a) => a.holdings.map((h) => h.ticker))),
      ].sort(),
    [accounts],
  );
  const key = JSON.stringify({
    tickers,
    symbols: Object.fromEntries(
      tickers.filter((t) => symbols[t]).map((t) => [t, symbols[t]]),
    ),
  });
  const [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [company, setCompany] = useState("all"),
    [tab, setTab] = useState("all");
  useEffect(() => {
    if (company !== "all" && !tickers.includes(company)) setCompany("all");
  }, [key, company]);
  useEffect(() => {
    if (!tickers.length) return;
    let closed = false;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    fetch("/api/company-updates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: key,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]),
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok)
          throw new Error(body.error || `Błąd pobierania HTTP ${r.status}`);
        if (!Array.isArray(body.companies))
          throw new Error("Nieprawidłowa odpowiedź serwera wiadomości.");
        if (!closed) setResult({ key, data: body });
      })
      .catch((e) => {
        if (!closed)
          setError(
            e.name === "TimeoutError"
              ? "Pobieranie przekroczyło limit czasu. Spróbuj ponownie."
              : e.message,
          );
      })
      .finally(() => {
        if (!closed) setBusy(false);
      });
    return () => {
      closed = true;
      controller.abort();
    };
  }, [key, revision]);
  const data = result?.key === key ? result.data : null;
  const companies = (data?.companies || []).filter(
    (c) => company === "all" || c.ticker === company,
  );
  const knownNames = new Map(
    accounts.flatMap((a) => a.holdings.map((h) => [h.ticker, h.name])),
  );
  const news = useMemo(() => {
    const map = new Map();
    for (const c of companies)
      for (const article of c.news || []) {
        if (!/^https:\/\//.test(article.url)) continue;
        const existing = map.get(article.url);
        if (existing) existing.tickers.push(c.ticker);
        else map.set(article.url, { ...article, tickers: [c.ticker] });
      }
    return [...map.values()].sort((a, b) =>
      b.publishedAt.localeCompare(a.publishedAt),
    );
  }, [data, company]);
  const earnings = companies
    .flatMap((c) =>
      (c.earnings || []).map((e) => ({
        ...e,
        ticker: c.ticker,
        name: knownNames.get(c.ticker) || c.name,
      })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const unavailable = companies.filter((c) => !c.earnings?.length);
  if (!tickers.length)
    return (
      <section className="panel news-empty">
        <Newspaper size={28} />
        <h2>Brak spółek do obserwowania</h2>
        <p>
          Wybierz konta z otwartymi pozycjami, aby zobaczyć wiadomości i terminy
          wyników.
        </p>
      </section>
    );
  return (
    <section className="updates-page">
      <div className="updates-toolbar">
        <label>
          Spółka
          <select
            aria-label="Filtr spółki w wiadomościach"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          >
            <option value="all">Wszystkie posiadane spółki</option>
            {tickers.map((t) => (
              <option key={t} value={t}>
                {knownNames.get(t) || t} ({t})
              </option>
            ))}
          </select>
        </label>
        <div className="segmented">
          {[
            ["all", "Wiadomości i wyniki"],
            ["news", "Wiadomości"],
            ["earnings", "Terminy wyników"],
          ].map(([id, text]) => (
            <button
              key={id}
              className={tab === id ? "on" : ""}
              onClick={() => setTab(id)}
            >
              {text}
            </button>
          ))}
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => setRevision((x) => x + 1)}
        >
          <RefreshCw size={14} />
          {busy ? "Pobieranie…" : "Odśwież wiadomości"}
        </button>
      </div>
      <p className="updates-source" role="status">
        {data ? `Ostatnie pobranie: ${published(data.fetchedAt)}. ` : ""}
        Bezpłatne źródła: Yahoo Finance i Google News. Serwer buforuje dane
        przez 15 minut. Artykuły mogą być po polsku lub angielsku.
      </p>
      {error && (
        <div className="warnings" role="alert">
          {error}
          {data ? " Pokazujemy ostatnio pobrane dane." : ""}
        </div>
      )}
      {busy && !data && (
        <div className="panel news-empty">
          <RefreshCw size={23} />
          <p>Pobieramy wiadomości i kalendarze posiadanych spółek…</p>
        </div>
      )}
      {(tab === "all" || tab === "earnings") && data && (
        <section className="panel earnings-panel">
          <div className="panel-heading">
            <div>
              <h2>
                <CalendarDays size={18} />
                Najbliższe wyniki finansowe
              </h2>
              <p>Terminy opublikowane przez źródło; estymacje są oznaczone.</p>
            </div>
            <span className="count">{earnings.length}</span>
          </div>
          {earnings.length ? (
            <div className="earnings-grid">
              {earnings.map((e) => (
                <article key={e.ticker + e.date} className="earnings-event">
                  <div className="earnings-date">
                    <CalendarDays size={17} />
                    <strong>
                      {eventDay(e.date)}
                      {e.dateEnd && e.dateEnd !== e.date
                        ? " – " + eventDay(e.dateEnd)
                        : ""}
                    </strong>
                  </div>
                  <h3>{e.name}</h3>
                  <span className="tag">{e.ticker}</span>
                  <span
                    className={`earnings-status ${e.status === "confirmed" ? "confirmed" : "estimate"}`}
                  >
                    {e.status === "confirmed"
                      ? "Potwierdzony przez źródło"
                      : "Termin szacowany"}
                  </span>
                  <a href={e.url} target="_blank" rel="noopener noreferrer">
                    {e.source}
                    <ExternalLink size={12} />
                  </a>
                </article>
              ))}
            </div>
          ) : (
            <div className="news-empty">
              <p>
                Źródło nie podaje obecnie nadchodzącego terminu dla wybranych
                spółek.
              </p>
            </div>
          )}
          {unavailable.length > 0 && (
            <div className="updates-note">
              <Info size={15} />
              <span>
                Brak dostępnej daty wyników:{" "}
                {unavailable.map((c) => c.ticker).join(", ")}. Sprawdź relacje
                inwestorskie spółki; brak daty nie oznacza braku zaplanowanych
                wyników.
              </span>
            </div>
          )}
        </section>
      )}
      {(tab === "all" || tab === "news") && data && (
        <section className="panel news-list">
          <div className="panel-heading">
            <div>
              <h2>
                <Newspaper size={18} />
                Najnowsze wiadomości
              </h2>
              <p>Ostatnie 30 dni • duplikaty artykułów połączone.</p>
            </div>
            <span className="count">{news.length}</span>
          </div>
          {news.length ? (
            news.map((article) => (
              <article className="news-article" key={article.url}>
                <div className="news-article-meta">
                  <span>{article.source}</span>
                  <time dateTime={article.publishedAt}>
                    {published(article.publishedAt)}
                  </time>
                </div>
                <a
                  className="news-article-title"
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {article.title}
                  <ExternalLink size={15} />
                </a>
                <div className="news-tickers">
                  {article.tickers.map((t) => (
                    <button
                      key={t}
                      className="tag"
                      onClick={() => setCompany(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <div className="news-empty">
              <p>Brak artykułów z ostatnich 30 dni w dostępnych źródłach.</p>
            </div>
          )}
        </section>
      )}
      {data && companies.some((c) => c.error || c.warnings?.length > 0) && (
        <details className="updates-diagnostics">
          <summary>Dostępność źródeł i uwagi</summary>
          {companies
            .filter((c) => c.error || c.warnings?.length > 0)
            .map((c) => (
              <div key={c.ticker}>
                <strong>{c.ticker}</strong>
                {c.error && <p>{c.error}</p>}
                {c.warnings?.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            ))}
        </details>
      )}
      <p className="updates-source">
        Nie wysyłamy plików, numerów kont ani wartości pozycji. Źródła otrzymują
        wyłącznie symbole instrumentów lub nazwę spółki. Terminy mogą się
        zmienić; przed decyzją sprawdź komunikat emitenta.
      </p>
    </section>
  );
}
