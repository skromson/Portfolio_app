import React, { useState, useMemo, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import {
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Plus,
  LayoutDashboard,
  ArrowLeftRight,
  Building2,
  Settings2,
  Wallet,
  ChevronDown,
  Check,
  Upload,
  FileSpreadsheet,
  X,
  Search,
  ShieldCheck,
  Info,
  Trash2,
  Leaf,
  Layers,
  BriefcaseBusiness,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  parseWorkbook,
  portfolio,
  inferRates,
  mergeReports,
  companies,
  parseQuotes,
  marketHistory,
} from "./portfolio";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./style.css";
import { onlinePortfolio } from "./online.js";
import { useMarketData } from "./useMarketData.js";
import MarketSettings from "./MarketSettings.jsx";
import PortfolioChart from "./PortfolioChart.jsx";
import OperationsPanel from "./OperationsPanel.jsx";
import NewsPanel from "./NewsPanel.jsx";
const palette = [
  "#27654f",
  "#7aa58a",
  "#acc3a1",
  "#d5b982",
  "#a3b4be",
  "#d9d8c2",
  "#6d8480",
  "#ba9e8a",
  "#aec1b4",
  "#73835d",
  "#c6bca6",
];
const num = (v, d = 2) =>
  new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
    useGrouping: "always",
  }).format(v || 0);
const day = (x) =>
  x
    ? new Date(x).toLocaleDateString("pl-PL", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
const money = (v, c = "PLN") =>
  v == null ? "—" : `${num(v)} ${c === "PLN" ? "zł" : c}`;
const timestamp = (x) => (x ? new Date(x).toLocaleString("pl-PL") : "—");
function readLocal() {
  try {
    const v = JSON.parse(localStorage.getItem("folio-v1") || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function App() {
  const [accounts, setAccounts] = useState(readLocal),
    [selected, setSelected] = useState(() => readLocal().map((a) => a.id)),
    [view, setView] = useState("overview"),
    [modal, setModal] = useState(null),
    [base, setBase] = useState("PLN"),
    [rateOverrides, setRateOverrides] = useState({}),
    [search, setSearch] = useState(""),
    [notice, setNotice] = useState(""),
    [importErrors, setImportErrors] = useState([]),
    [busy, setBusy] = useState(false),
    [drag, setDrag] = useState(false),
    [detailSelection, setDetail] = useState(null),
    [valuation, setValuation] = useState("market"),
    [symbols, setSymbols] = useState(() => {
      try {
        return JSON.parse(localStorage.getItem("folio-symbols-v1") || "{}");
      } catch {
        return {};
      }
    }),
    [quotes, setQuotes] = useState([]),
    [quoteError, setQuoteError] = useState("");
  const detail = detailSelection;
  useEffect(() => {
    if (!modal && !detail) return;
    const previous = document.activeElement;
    const timer = setTimeout(
      () => document.querySelector("[role=dialog] button")?.focus(),
      0,
    );
    const handler = (e) => {
      if (e.key === "Escape" && !busy) {
        setModal(null);
        setDetail(null);
      }
      if (e.key === "Tab") {
        const items = [
          ...document.querySelectorAll(
            "[role=dialog] button:not(:disabled),[role=dialog] input:not([hidden]),[role=dialog] select",
          ),
        ];
        if (!items.length) return;
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1).focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [modal, detail, busy]);
  const input = useRef();
  const quoteInput = useRef();
  const inferred = useMemo(() => inferRates(accounts), [accounts]);
  const rates = { ...inferred, ...rateOverrides };
  const chosen = useMemo(
    () => accounts.filter((a) => selected.includes(a.id)),
    [accounts, selected],
  );
  const remote = useMarketData(accounts, symbols);
  const snapshot = useMemo(
    () => portfolio(chosen, rates, base),
    [chosen, base, JSON.stringify(rates)],
  );
  const online = useMemo(
    () => onlinePortfolio(chosen, remote.data, base),
    [chosen, base, remote.data],
  );
  const p = valuation === "market" ? online : snapshot;
  const onlineMode = valuation === "market";
  const t = p.totals;
  useEffect(() => {
    if (detailSelection) {
      const updated = p.holdings.find(
        (h) => h.ticker === detailSelection.ticker,
      );
      if (updated) setDetail(updated);
      else setDetail(null);
    }
  }, [remote.data, valuation, base, selected.join("|")]);
  const persist = (as) => {
    setAccounts(as);
    try {
      localStorage.setItem("folio-v1", JSON.stringify(as));
    } catch {
      setNotice(
        "Brak miejsca w przeglądarce. Dane działają w tej sesji; nie zostały zapisane.",
      );
    }
  };
  async function importFiles(files) {
    setBusy(true);
    setImportErrors([]);
    const incoming = [],
      errors = [];
    for (const f of files) {
      try {
        if (!/\.xlsx$/i.test(f.name)) throw new Error("Wybierz plik .xlsx.");
        if (f.size > 10 * 1024 * 1024)
          throw new Error("Maksymalny rozmiar pliku to 10 MB.");
        incoming.push(await parseWorkbook(await f.arrayBuffer(), f.name));
      } catch (e) {
        errors.push(`${f.name}: ${e.message}`);
      }
    }
    if (incoming.length) {
      const result = mergeReports(accounts, incoming);
      persist(result.accounts);
      setSelected((prev) => [
        ...new Set([...prev, ...incoming.map((a) => a.id)]),
      ]);
      setNotice(
        `Wczytano ${incoming.length} raportów. ${result.messages.join(" ")}`,
      );
    }
    setImportErrors(errors);
    setBusy(false);
    if (!errors.length && incoming.length) setModal(null);
  }
  async function loadAttached() {
    setBusy(true);
    try {
      const res = await fetch("/local-reports/manifest.json");
      if (
        !res.ok ||
        !res.headers.get("content-type")?.includes("application/json")
      )
        throw new Error(
          "Załączniki nie są dostępne w tej instalacji. Wybierz własne pliki XTB.",
        );
      const names = await res.json();
      const files = await Promise.all(
        names.map(async (name) => {
          const r = await fetch("/local-reports/" + encodeURIComponent(name));
          if (!r.ok) throw new Error("Nie udało się odczytać załącznika.");
          return new File([await r.blob()], name);
        }),
      );
      await importFiles(files);
    } catch (e) {
      setImportErrors([e.message]);
      setBusy(false);
    }
  }
  const toggle = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const market = useMemo(
    () => marketHistory(chosen, rates, base, quotes),
    [accounts, selected.join("|"), base, JSON.stringify(rates), quotes],
  );
  const chartHistory =
    valuation === "market"
      ? online.history
      : valuation === "csv"
        ? market
        : snapshot.history;
  const filtered = p.holdings.filter((h) =>
    `${h.name} ${h.ticker}`.toLowerCase().includes(search.toLowerCase()),
  );
  const reportDate = chosen
    .map((a) => a.asOf)
    .filter(Boolean)
    .sort()
    .at(-1);
  const tabs = [
    ["overview", "Przegląd", LayoutDashboard],
    ["holdings", "Aktywa", BriefcaseBusiness],
    ["operations", "Operacje", ArrowLeftRight],
    ["companies", "Spółki", Building2],
    ["news", "Wiadomości i wyniki", Info],
  ];
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("overview");
          }}
        >
          <span className="brand-icon">
            <Leaf size={22} />
          </span>
          folio<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">OSOBISTA PRZESTRZEŃ</div>
        <nav>
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              className={view === id ? "nav-item active" : "nav-item"}
              onClick={() => {
                setView(id);
                setSearch("");
              }}
            >
              <Icon size={19} />
              {label}
              {id === "holdings" && <small>{p.holdings.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={21} />
            <strong>Twój portfel. Twoje dane.</strong>
            <p>
              Pliki analizujemy lokalnie.
              <br />
              Dane zostają w przeglądarce.
            </p>
          </div>
          <button className="nav-item" onClick={() => setModal("settings")}>
            <Settings2 size={18} />
            Ustawienia
          </button>
          <div className="profile">
            <span>MP</span>
            <div>
              Mój portfel<small>Inwestor indywidualny</small>
            </div>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            Przestrzeń inwestora <span>/</span>{" "}
            <strong>{tabs.find((x) => x[0] === view)?.[1]}</strong>
          </div>
          <div className="top-status">
            <i />{" "}
            {onlineMode
              ? "Notowania online • Yahoo Finance"
              : "Dane z raportów XTB"}{" "}
            <span className="avatar">MP</span>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">TWOJE FINANSE, W JEDNYM MIEJSCU</div>
              <h1>
                {view === "overview"
                  ? "Przegląd portfela"
                  : view === "holdings"
                    ? "Twoje aktywa"
                    : view === "operations"
                      ? "Historia operacji"
                      : view === "news"
                        ? "Wiadomości i terminy wyników"
                        : "Spółki w portfelu"}
              </h1>
              <p>
                {view === "overview"
                  ? "Pełny obraz Twoich inwestycji. Spokojnie, przejrzyście, po Twojemu."
                  : view === "operations"
                    ? "Wpłaty, wypłaty, transfery i transakcje na wybranych kontach."
                    : view === "news"
                      ? "Najnowsze informacje o spółkach na wybranych kontach."
                      : "Zobacz, w co inwestujesz i jak pracuje Twój kapitał."}
              </p>
            </div>
            <button
              className="primary"
              onClick={() => {
                setModal("import");
                setImportErrors([]);
              }}
            >
              <Plus size={18} />
              Importuj raport
            </button>
          </div>
          {notice && (
            <div className="toast" role="status">
              <CheckCircle2 size={17} />
              {notice}
              <button
                aria-label="Zamknij komunikat"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          <section className="account-section">
            <div className="account-label">
              POKAŻ KONTA{" "}
              <button
                onClick={() =>
                  setSelected(
                    selected.length === accounts.length
                      ? []
                      : accounts.map((a) => a.id),
                  )
                }
              >
                {selected.length === accounts.length
                  ? "Odznacz wszystkie"
                  : "Zaznacz wszystkie"}
              </button>
            </div>
            <div className="account-row">
              {accounts.map((a, i) => (
                <button
                  aria-pressed={selected.includes(a.id)}
                  className={`account-chip ${selected.includes(a.id) ? "chosen" : ""}`}
                  key={a.id}
                  onClick={() => toggle(a.id)}
                >
                  <span
                    className="account-symbol"
                    style={{
                      background: ["#e6eddf", "#e8edf5", "#f5ede0", "#ebe7f3"][
                        i % 4
                      ],
                    }}
                  >
                    {a.label === "IKE" ? (
                      <ShieldCheck size={17} />
                    ) : a.currency === "USD" ? (
                      "$"
                    ) : a.currency === "EUR" ? (
                      "€"
                    ) : (
                      "zł"
                    )}
                  </span>
                  <div>
                    <strong>Konto {a.label}</strong>
                    <small>•••• {a.id.slice(-4)}</small>
                  </div>
                  <span className="check-box">
                    {selected.includes(a.id) && <Check size={12} />}
                  </span>
                </button>
              ))}
              {!accounts.length && (
                <span className="muted">
                  Dodaj pierwszy raport, aby zobaczyć swoje konta.
                </span>
              )}
              <button
                className="add-account"
                onClick={() => setModal("import")}
                aria-label="Dodaj konto"
              >
                <Plus size={18} />
              </button>
              <label className="currency-select">
                Waluta widoku{" "}
                <select
                  aria-label="Waluta widoku"
                  value={base}
                  onChange={(e) => setBase(e.target.value)}
                >
                  <option>PLN</option>
                  <option>EUR</option>
                  <option>USD</option>
                </select>
              </label>
            </div>
          </section>
          {accounts.length > 0 && (
            <section className="market-toolbar">
              <div className="segmented">
                <button
                  className={onlineMode ? "on" : ""}
                  onClick={() => setValuation("market")}
                >
                  Notowania online
                </button>
                <button
                  className={valuation === "cost" ? "on" : ""}
                  onClick={() => setValuation("cost")}
                >
                  Raport / koszt historyczny
                </button>
                <button
                  className={valuation === "csv" ? "on" : ""}
                  onClick={() => setValuation("csv")}
                >
                  Ceny CSV
                </button>
              </div>
              <button
                className="secondary"
                disabled={remote.loading}
                onClick={remote.refresh}
              >
                {remote.loading ? "Pobieranie…" : "Odśwież notowania"}
              </button>
              <p role="status">
                {remote.data
                  ? `Pobrano: ${timestamp(remote.data.fetchedAt)}. Automatyczne odświeżanie co 60 s.`
                  : "Pobieramy ceny akcji i kursy FX…"}{" "}
                Dostawca może publikować opóźnione ceny.
              </p>
              {(remote.error || remote.stale) && (
                <p className="negative" role="alert">
                  {remote.error ||
                    "Notowania nie zostały odświeżone od ponad 2,5 minuty."}{" "}
                  {remote.data
                    ? "Widać ostatnio pobrane dane, a nie nowe ceny."
                    : ""}
                </p>
              )}
              <small>
                Wyceniamy pozycje z ostatnio wgranych raportów. Nowe transakcje
                XTB wymagają ponownego importu.
              </small>
            </section>
          )}
          {!accounts.length ? (
            <section className="empty-hero panel">
              <div className="empty-icon">
                <Layers size={35} />
              </div>
              <span className="eyebrow">ZACZNIJ OD SWOICH DANYCH</span>
              <h2>Twoje inwestycje mają nowy dom.</h2>
              <p>
                Wgraj pełny eksport historii XTB. Połącz konta PLN, EUR, USD i
                IKE
                <br />i poznaj swój portfel z nowej perspektywy.
              </p>
              <button className="primary" onClick={() => setModal("import")}>
                <Upload size={17} />
                Wybierz raporty .xlsx
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={loadAttached}
              >
                {busy ? "Wczytywanie…" : "Wczytaj cztery załączone raporty"}{" "}
                <ArrowRight size={15} />
              </button>
              {importErrors.map((e) => (
                <p className="negative" key={e}>
                  {e}
                </p>
              ))}
              <div className="empty-features">
                <span>
                  <CheckCircle2 size={16} /> Wiele kont w jednym widoku
                </span>
                <span>
                  <CheckCircle2 size={16} /> Bez przesyłania plików na serwer
                </span>
                <span>
                  <CheckCircle2 size={16} /> Import bez duplikatów
                </span>
              </div>
            </section>
          ) : !chosen.length ? (
            <div className="panel empty-state">
              Wybierz przynajmniej jedno konto powyżej.
            </div>
          ) : view === "operations" ? (
            <OperationsPanel
              accounts={chosen}
              base={base}
              marketData={remote.data}
              rates={rates}
              onlineMode={onlineMode}
            />
          ) : view === "news" ? (
            <NewsPanel accounts={chosen} symbols={symbols} />
          ) : p.missing.length ? (
            <div className="panel empty-state">
              <Info />
              <h2>
                {onlineMode
                  ? remote.loading
                    ? "Pobieranie notowań…"
                    : "Brak pełnej wyceny online"
                  : "Uzupełnij kursy walut"}
              </h2>
              {onlineMode ? (
                <>
                  <p>{remote.error || p.missing.join(" • ")}</p>
                  <p>
                    Możesz zmienić symbole w ustawieniach albo wybrać widok
                    raportu. Nie zastępujemy brakującej ceny zerem.
                  </p>
                  <button
                    className="primary"
                    onClick={() => setModal("settings")}
                  >
                    Symbole i ustawienia
                  </button>
                </>
              ) : (
                <>
                  <p>
                    Do widoku {base} brakuje kursów: {p.missing.join(", ")}.
                  </p>
                  <button
                    className="primary"
                    onClick={() => setModal("settings")}
                  >
                    Ustaw kursy referencyjne
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="report-line">
                <span>
                  <span className="status-dot" />
                  {onlineMode
                    ? `Bieżąca wycena pozycji • raport z ${day(reportDate)}`
                    : `Stan raportów: ${day(reportDate)}`}
                  {new Set(chosen.map((a) => a.asOf?.slice(0, 10))).size > 1
                    ? " • raporty z różnych dni"
                    : ""}
                </span>
                <button onClick={() => setModal("settings")}>
                  Kursy i metodologia <Info size={13} />
                </button>
              </div>
              {view === "overview" && (
                <>
                  <section className="stats-grid">
                    <Stat
                      title="Wartość portfela"
                      value={money(t.value, base)}
                      foot={
                        onlineMode
                          ? "Aktywa i gotówka • ostatnie dostępne ceny"
                          : "Aktywa i wolne środki • stan z raportów"
                      }
                      icon={<Wallet size={19} />}
                      main
                    />
                    <Stat
                      title="Wynik otwartych pozycji"
                      value={money(t.profit, base)}
                      foot={`${num(t.assets - t.profit > 0 ? (t.profit / (t.assets - t.profit)) * 100 : 0)}% względem kosztu zakupu`}
                      positive={t.profit >= 0}
                      icon={<ArrowUpRight size={19} />}
                    />
                    <Stat
                      title="Wolne środki"
                      value={money(t.cash, base)}
                      foot="Saldo operacji w zakresie eksportu"
                      icon={<Layers size={19} />}
                    />
                    <Stat
                      title="Otrzymane dywidendy"
                      value={money(t.dividends, base)}
                      foot={
                        onlineMode
                          ? "Brutto • FX z dnia wypłaty"
                          : "Łącznie brutto • wybrane konta"
                      }
                      icon={<Leaf size={19} />}
                    />
                  </section>
                  <div className="charts-grid">
                    <PortfolioChart
                      history={chartHistory}
                      accounts={chosen}
                      marketData={remote.data}
                      base={base}
                      rates={rates}
                      onlineMode={onlineMode}
                      valuation={valuation}
                      onSettings={() => setModal("settings")}
                    />
                    <section className="panel allocation-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Struktura portfela</h2>
                          <p>Udział w wartości aktywów</p>
                        </div>
                        <span className="mini-icon">
                          <Layers size={17} />
                        </span>
                      </div>
                      {p.holdings.length ? (
                        <>
                          <div className="donut">
                            <ResponsiveContainer width="100%" height={204}>
                              <PieChart>
                                <Pie
                                  data={p.holdings}
                                  dataKey="value"
                                  nameKey="name"
                                  innerRadius={66}
                                  outerRadius={91}
                                  paddingAngle={2}
                                  stroke="none"
                                  isAnimationActive={false}
                                >
                                  {p.holdings.map((h, i) => (
                                    <Cell
                                      key={h.ticker}
                                      fill={palette[i % palette.length]}
                                    />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(v) => money(v, base)} />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="donut-center">
                              <small>AKTYWA</small>
                              <strong>{p.holdings.length}</strong>
                              <span>instrumentów</span>
                            </div>
                          </div>
                          <div className="allocation-list">
                            {p.holdings.slice(0, 4).map((h, i) => (
                              <div key={h.ticker}>
                                <span>
                                  <i style={{ background: palette[i] }} />
                                  {h.name}
                                </span>
                                <strong>
                                  {num((h.value / t.assets) * 100, 1)}%
                                </strong>
                              </div>
                            ))}
                            {p.holdings.length > 4 && (
                              <div>
                                <span>Pozostałe ({p.holdings.length - 4})</span>
                                <strong>
                                  {num(
                                    (p.holdings
                                      .slice(4)
                                      .reduce((s, h) => s + h.value, 0) /
                                      t.assets) *
                                      100,
                                    1,
                                  )}
                                  %
                                </strong>
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="empty-state">
                          Brak otwartych pozycji na tym koncie.
                        </div>
                      )}
                    </section>
                  </div>
                </>
              )}
              {(view === "overview" || view === "holdings") && (
                <section className="panel holdings-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        Aktywa w portfelu{" "}
                        <span className="count">{p.holdings.length}</span>
                      </h2>
                      <p>Otwarte pozycje na wybranych kontach</p>
                    </div>
                    {view === "overview" ? (
                      <button
                        className="text-button"
                        onClick={() => {
                          setView("holdings");
                          setSearch("");
                        }}
                      >
                        Wszystkie aktywa <ArrowRight size={15} />
                      </button>
                    ) : (
                      <SearchBox value={search} onChange={setSearch} />
                    )}
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>INSTRUMENT</th>
                          <th>KONTO</th>
                          <th>LICZBA</th>
                          <th>WARTOŚĆ</th>
                          <th>WYNIK</th>
                          <th>UDZIAŁ</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {(view === "overview"
                          ? filtered.slice(0, 5)
                          : filtered
                        ).map((h, i) => (
                          <tr
                            key={h.ticker}
                            onClick={() => setDetail(h)}
                            tabIndex={0}
                            onKeyDown={(e) => e.key === "Enter" && setDetail(h)}
                          >
                            <td>
                              <div className="instrument">
                                <span
                                  className="ticker-logo"
                                  style={{
                                    background:
                                      palette[i % palette.length] + "24",
                                    color: palette[i % palette.length],
                                  }}
                                >
                                  {h.name
                                    .replace(/[^a-zA-Z]/g, "")
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </span>
                                <div>
                                  <strong>{h.name}</strong>
                                  <small>
                                    {h.ticker} <span>• Akcje</span>
                                    {onlineMode && h.quote && (
                                      <small className="quote-stamp">
                                        {money(h.quote.price, h.quote.currency)}{" "}
                                        • {timestamp(h.quote.priceTime)} •{" "}
                                        {h.quote.exchange}
                                      </small>
                                    )}
                                  </small>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="tag">
                                {h.accounts.join(" · ")}
                              </span>
                            </td>
                            <td>{num(h.quantity, 4)}</td>
                            <td className="bold">{money(h.value, base)}</td>
                            <td
                              className={
                                h.profit >= 0 ? "positive" : "negative"
                              }
                            >
                              {h.profit >= 0 ? "+" : ""}
                              {money(h.profit, base)}
                              <small>
                                {h.cost > 0
                                  ? (h.profit >= 0 ? "+" : "") +
                                    num((h.profit / h.cost) * 100) +
                                    "%"
                                  : "—"}
                              </small>
                            </td>
                            <td>
                              <div className="weight">
                                {num((h.value / t.assets) * 100, 1)}%
                                <span>
                                  <i
                                    style={{
                                      width: `${(h.value / t.assets) * 100}%`,
                                    }}
                                  />
                                </span>
                              </div>
                            </td>
                            <td>
                              <ArrowUpRight size={15} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!filtered.length && (
                      <div className="empty-state">
                        Brak pozycji spełniających kryteria.
                      </div>
                    )}
                  </div>
                </section>
              )}
              {view === "companies" && (
                <>
                  <div className="company-toolbar">
                    <p className="muted">
                      Profile ogólne, bez bieżących danych finansowych i
                      rekomendacji.
                    </p>
                    <SearchBox value={search} onChange={setSearch} />
                  </div>
                  <div className="company-grid">
                    {filtered.map((h, i) => {
                      const c = companies[h.ticker];
                      return (
                        <button
                          key={h.ticker}
                          className="panel company-card"
                          onClick={() => setDetail(h)}
                        >
                          <div className="company-top">
                            <span
                              className="ticker-logo"
                              style={{
                                background: palette[i % palette.length] + "22",
                              }}
                            >
                              {h.name.slice(0, 2).toUpperCase()}
                            </span>
                            <ArrowUpRight size={18} />
                          </div>
                          <small>
                            {h.ticker} • {c?.[2] || "Rynek instrumentu"}
                          </small>
                          <h2>{c?.[0] || h.name}</h2>
                          <span className="tag">{c?.[1] || h.category}</span>
                          <p>
                            {c?.[3] ||
                              "Brak opisu w lokalnym katalogu. Szczegóły pozycji pochodzą z raportu XTB."}
                          </p>
                          <div className="company-value">
                            <span>
                              Wartość pozycji
                              <strong>{money(h.value, base)}</strong>
                            </span>
                            <strong
                              className={
                                h.profit >= 0 ? "positive" : "negative"
                              }
                            >
                              {h.profit >= 0 ? "+" : ""}
                              {num(h.cost > 0 ? (h.profit / h.cost) * 100 : 0)}%
                            </strong>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {onlineMode && online.warnings.length > 0 && (
                <div className="warnings">
                  <AlertCircle size={17} />
                  <div>
                    {online.warnings.map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                  </div>
                </div>
              )}
              {chosen.some((a) => a.warnings.length > 0) && (
                <div className="warnings">
                  <AlertCircle size={17} />
                  <div>
                    {chosen.flatMap((a) =>
                      a.warnings.map((w) => (
                        <p key={a.id + w}>
                          <strong>Konto {a.label}:</strong> {w}
                        </p>
                      )),
                    )}
                  </div>
                </div>
              )}
              <div className="info-strip">
                <Info size={15} />
                {onlineMode
                  ? "Ceny online i historyczne FX: Yahoo Finance. Rynki mogą być zamknięte lub dane opóźnione. Koszt zakupu przeliczany kursem z dnia transakcji."
                  : "Tryb raportu/CSV używa stałych referencyjnych kursów FX i nie jest wyceną online."}{" "}
                <button onClick={() => setModal("settings")}>Szczegóły</button>
              </div>
            </>
          )}
          <footer>
            <span className="footer-brand">
              <Leaf size={14} /> folio. <span>Inwestuj świadomie.</span>
            </span>
            <span>
              <ShieldCheck size={13} /> Raporty pozostają na tym urządzeniu
            </span>
          </footer>
        </div>
      </main>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) =>
            e.target === e.currentTarget && !busy && setModal(null)
          }
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal === "import" ? "Import raportów" : "Ustawienia"}
          >
            <button
              className="close-modal"
              aria-label="Zamknij"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              <X size={21} />
            </button>
            {modal === "import" ? (
              <>
                <div className="modal-icon">
                  <FileSpreadsheet size={26} />
                </div>
                <h2>Dodaj swoje inwestycje</h2>
                <p>
                  Wybierz pełne raporty XTB. Możesz dodać kilka kont
                  jednocześnie.
                </p>
                <div
                  className={`dropzone ${drag ? "dragging" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    if (!busy) importFiles([...e.dataTransfer.files]);
                  }}
                >
                  <Upload size={28} />
                  <strong>
                    {busy ? "Analizujemy raporty…" : "Przeciągnij pliki tutaj"}
                  </strong>
                  <span>lub wybierz je ze swojego urządzenia</span>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => input.current.click()}
                  >
                    Wybierz pliki .xlsx
                  </button>
                  <small>Do 10 MB na plik • PLN, EUR, USD i IKE</small>
                </div>
                <input
                  ref={input}
                  type="file"
                  multiple
                  accept=".xlsx"
                  hidden
                  onChange={(e) => importFiles([...e.target.files])}
                />
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={loadAttached}
                >
                  Wczytaj cztery załączone raporty <ArrowRight size={15} />
                </button>
                {importErrors.map((e) => (
                  <div className="error-message" role="alert" key={e}>
                    {e}
                  </div>
                ))}
                <div className="import-help">
                  <strong>Jak pobrać raport?</strong>
                  <p>
                    W XTB wybierz historię konta i eksport Excel. Uwzględnij
                    cały okres oraz arkusze Closed Positions, Cash Operations i
                    Open Positions.
                  </p>
                  <p>
                    Ponowny import zastępuje dane tego konta pełnym raportem.
                    Starsze raporty są pomijane. Dla IKE zachowaj prefiks IKE_ w
                    nazwie pliku.
                  </p>
                </div>
                <div className="privacy-line">
                  <ShieldCheck size={15} /> Pliki nie opuszczają Twojej
                  przeglądarki.
                </div>
              </>
            ) : (
              <>
                <div className="modal-icon">
                  <Settings2 size={24} />
                </div>
                <h2>Ustawienia portfela</h2>
                <MarketSettings
                  accounts={accounts}
                  mapping={symbols}
                  data={remote.data}
                  onApply={(next) => {
                    setSymbols(next);
                    try {
                      localStorage.setItem(
                        "folio-symbols-v1",
                        JSON.stringify(next),
                      );
                    } catch {
                      setNotice(
                        "Nie udało się zapisać mapowania na tym urządzeniu.",
                      );
                    }
                  }}
                />
                <section className="quotes-section">
                  <h3>Kursy online do PLN</h3>
                  {Object.entries(remote.data?.fx || {})
                    .filter(([c]) => c !== "PLN")
                    .map(([c, r]) => (
                      <p key={c}>
                        1 {c} = {r.error ? r.error : num(r.price, 6) + " PLN"} •{" "}
                        {timestamp(r.priceTime)}
                        <small> • {r.source}</small>
                      </p>
                    ))}
                  <p>
                    Waluta akcji i waluta konta są przeliczane oddzielnie.
                    Historia używa kursu z każdego dnia; weekendy korzystają z
                    poprzedniej sesji.
                  </p>
                </section>
                <p>
                  Kursy ręczne poniżej dotyczą wyłącznie trybu raportu i CSV.
                  Nie nadpisują kursów online.
                </p>
                <div className="rate-fields">
                  {["EUR", "USD"].map((c) => (
                    <label key={c}>
                      1 {c} =
                      <input
                        type="number"
                        min="0.000001"
                        step="0.000001"
                        placeholder="Wpisz kurs"
                        value={rateOverrides[c] ?? inferred[c] ?? ""}
                        onChange={(e) =>
                          setRateOverrides((prev) => ({
                            ...prev,
                            [c]:
                              Number(e.target.value) > 0
                                ? Number(e.target.value)
                                : null,
                          }))
                        }
                      />{" "}
                      PLN
                    </label>
                  ))}
                </div>
                <p className="muted">
                  {inferred.source} Zmiany ręczne obowiązują w tej sesji.
                </p>
                <div className="quotes-section">
                  <h3>Historyczne notowania</h3>
                  <p>
                    Dodaj CSV z ceną jednostki w walucie konta (np. SIVE.SE na
                    koncie EUR wymaga ceny przeliczonej na EUR). Kolumny:{" "}
                    <code>date,ticker,currency,price</code>. Daty: RRRR-MM-DD.
                    Kropka dziesiętna. Notowania zastępują poprzedni import i
                    pozostają w tej sesji.
                  </p>
                  <pre>
                    date,ticker,currency,price
                    <br />
                    2026-10-23,MU.US,USD,877.10
                  </pre>
                  <button
                    className="secondary"
                    onClick={() => quoteInput.current.click()}
                  >
                    <Upload size={14} />
                    Wczytaj CSV z cenami
                  </button>
                  <input
                    ref={quoteInput}
                    type="file"
                    accept=".csv"
                    hidden
                    onChange={async (e) => {
                      try {
                        const f = e.target.files[0];
                        if (!f) return;
                        if (f.size > 10 * 1024 * 1024)
                          throw new Error("Plik przekracza 10 MB.");
                        setQuotes(parseQuotes(await f.text()));
                        setQuoteError("");
                        setValuation("csv");
                        setNotice(
                          "Wczytano ceny CSV. Włączono tryb CSV ze stałym kursem FX.",
                        );
                      } catch (err) {
                        setQuoteError(err.message);
                      }
                      e.target.value = "";
                    }}
                  />
                  {quotes.length > 0 && (
                    <p className="positive">
                      Wczytano {quotes.length} notowań.
                    </p>
                  )}
                  {quoteError && (
                    <p className="negative" role="alert">
                      {quoteError}
                    </p>
                  )}
                </div>
                <div className="methodology">
                  <h3>Jak liczymy wartości?</h3>
                  <p>
                    <b>Tryb online (domyślny):</b> liczba akcji z raportu ×
                    ostatnia cena × aktualny kurs waluty. Historia zawiera
                    dzienne ceny zamknięcia i FX z danego dnia oraz dzisiejszą
                    ostatnią cenę. Stan transakcji nie synchronizuje się z XTB.
                    Gotówka pochodzi z pełnej historii operacji.
                  </p>
                  <p>
                    <b>Wynik online:</b> koszt każdej partii w walucie widoku
                    jest liczony z FX na dzień zakupu. Zmiana procentowa wykresu
                    jest łańcuchowana dziennie z konwencją przepływów na
                    początku dnia; duże przepływy w ciągu dnia mogą wpływać na
                    dokładność. Brakujące wyceny są oznaczonym szacunkiem z
                    wcześniejszych danych lub transakcji; całkowity brak podstaw
                    wyceny jest jawnie oznaczony. Dywidendy są w gotówce — nie
                    używamy cen skorygowanych o dywidendy. Ceny Yahoo są
                    skorygowane o splity; ilości normalizujemy z daty
                    raportu/zamknięcia partii. Inne zdarzenia korporacyjne mogą
                    wymagać korekty eksportu.
                  </p>
                  <p>
                    <b>Tryb raportu / CSV:</b> poniższe zasady kosztowe i stałe
                    kursy dotyczą tylko trybów offline.
                  </p>
                  <p>
                    <b>Wartość portfela:</b> otwarte pozycje z raportu + suma
                    operacji gotówkowych. Eksport musi obejmować całą historię
                    konta; saldo początkowe przyjmujemy jako zero.
                  </p>
                  <p>
                    <b>Historia nominalna:</b> gotówka + koszt historyczny
                    otwartych w danym dniu pozycji. Nie obejmuje
                    niezrealizowanych zmian cen. Brak historycznych notowań w
                    eksporcie uniemożliwia odtworzenie rzeczywistej wyceny
                    rynkowej.
                  </p>
                  <p>
                    <b>Wykres procentowy:</b> (kapitał kosztowy − wpływy netto)
                    / suma dodatnich przepływów. Obejmuje zrealizowane wyniki,
                    podatki i odsetki, ale nie niezrealizowane zyski. To
                    wskaźnik kosztowy, nie stopa zwrotu TWR/IRR. Transfery są
                    przepływami dla każdego konta; nie liczymy ich jako zysk.
                  </p>
                  <p>
                    <b>Waluty:</b> jeden stały kurs na cały okres. Wynik nie
                    uwzględnia historycznych zmian FX. Profile spółek to opisy
                    ogólne, bez aktualnych wskaźników finansowych.
                  </p>
                  <p>
                    <b>Wycena rynkowa CSV:</b> pozycje są wyceniane ostatnią
                    znaną ceną nie późniejszą niż dany dzień. Gdy brakuje ceny
                    dla choć jednej pozycji, wykres ma przerwę. Procentowa
                    zmiana jest łańcuchowana dziennie jako Vkoniec / (Vpoczątek
                    + przepływy), z założeniem przepływów na początku dnia. Luka
                    w cenach przerywa obliczanie wyniku od początku. Stały kurs
                    FX nadal dotyczy całej historii.
                  </p>
                </div>
                <h3>Zapisane konta</h3>
                {accounts.map((a) => (
                  <div className="saved-account" key={a.id}>
                    <span>
                      Konto {a.label} • {a.id.slice(-4)}
                      <small>{a.filename}</small>
                    </span>
                    <button
                      className="delete-button"
                      aria-label={`Usuń konto ${a.label}`}
                      onClick={() => {
                        persist(accounts.filter((x) => x.id !== a.id));
                        setSelected((prev) => prev.filter((id) => id !== a.id));
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))}
                <p className="muted">
                  Dane są zapisane w pamięci tej przeglądarki. Usunięcie konta
                  usuwa lokalną kopię; plik źródłowy pozostaje bez zmian.
                </p>
              </>
            )}
          </section>
        </div>
      )}
      {detail && (
        <div
          className="modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && setDetail(null)}
        >
          <section
            className="modal detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label={detail.name}
          >
            <button
              className="close-modal"
              aria-label="Zamknij szczegóły"
              onClick={() => setDetail(null)}
            >
              <X size={21} />
            </button>
            <span className="eyebrow">
              SZCZEGÓŁY INWESTYCJI • {detail.ticker}
            </span>
            <h2>{companies[detail.ticker]?.[0] || detail.name}</h2>
            <span className="tag">
              {companies[detail.ticker]?.[1] || detail.category}
            </span>
            <p>
              {companies[detail.ticker]?.[3] ||
                "Brak opisu tej spółki w lokalnym katalogu."}
            </p>
            <div className="detail-grid">
              {[
                ["Wartość", money(detail.value, base)],
                ["Koszt zakupu", money(detail.cost, base)],
                ["Wynik", money(detail.profit, base)],
                ["Liczba jednostek", num(detail.quantity, 4)],
                ["Konta", detail.accounts.join(", ")],
                [
                  "Udział w aktywach",
                  num((detail.value / t.assets) * 100) + "%",
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <small>{k}</small>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            <p className="muted">
              {onlineMode ? "Wycena online pozycji z raportu" : "Stan raportów"}
              : {day(reportDate)}. Dane o wartości są w walucie widoku ({base}).
            </p>
            <h3>Pozycje na kontach</h3>
            {chosen.flatMap((a) =>
              (onlineMode ? online.accountHoldings[a.id] || [] : a.holdings)
                .filter((h) => h.ticker === detail.ticker)
                .map((h) => (
                  <div className="saved-account" key={a.id}>
                    <span>
                      Konto {a.label}
                      <small>{num(h.quantity, 4)} jednostek</small>
                    </span>
                    <b>{money(h.value, a.currency)}</b>
                  </div>
                )),
            )}
            <p className="muted">
              Profile spółek mają charakter informacyjny. Nie zawierają
              aktualnych wyników finansowych ani rekomendacji.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
function Stat({ title, value, foot, icon, main, positive }) {
  return (
    <div className={`stat-card ${main ? "featured" : ""}`}>
      <div className="stat-top">
        <span>{title}</span>
        {icon}
      </div>
      <strong
        className={`stat-value ${positive === true ? "positive" : positive === false ? "negative" : ""}`}
      >
        {value}
      </strong>
      <small>
        {positive !== undefined && (
          <span className="trend">
            {positive ? (
              <ArrowUpRight size={13} />
            ) : (
              <ArrowDownRight size={13} />
            )}
          </span>
        )}
        {foot}
      </small>
    </div>
  );
}
function SearchBox({ value, onChange }) {
  return (
    <label className="search-box">
      <Search size={16} />
      <input
        aria-label="Szukaj"
        placeholder="Szukaj instrumentu…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
createRoot(document.getElementById("root")).render(<App />);
