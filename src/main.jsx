import React, { useState, useMemo, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
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
  Download,
  Leaf,
  Layers,
  BriefcaseBusiness,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  parseWorkbook,
  stats,
  portfolio,
  inferRates,
  mergeReports,
  labels,
  companies,
  isFlow,
  parseQuotes,
  marketHistory,
} from "./portfolio";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./style.css";
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
const money = (v, c = "PLN") => `${num(v)} ${c === "PLN" ? "zł" : c}`;
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
    [period, setPeriod] = useState("ALL"),
    [chartMode, setChartMode] = useState("value"),
    [search, setSearch] = useState(""),
    [flowFilter, setFlowFilter] = useState("all"),
    [notice, setNotice] = useState(""),
    [importErrors, setImportErrors] = useState([]),
    [busy, setBusy] = useState(false),
    [drag, setDrag] = useState(false),
    [detail, setDetail] = useState(null),
    [page, setPage] = useState(1),
    [valuation, setValuation] = useState("cost"),
    [quotes, setQuotes] = useState([]),
    [quoteError, setQuoteError] = useState("");
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
  const chosen = accounts.filter((a) => selected.includes(a.id));
  const p = useMemo(
    () => portfolio(chosen, rates, base),
    [chosen, base, JSON.stringify(rates)],
  );
  const t = p.totals;
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
      if (!res.ok || !res.headers.get("content-type")?.includes("application/json"))
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
    setPage(1);
  };
  const market = useMemo(
    () => marketHistory(chosen, rates, base, quotes),
    [p, quotes],
  );
  const history = useMemo(() => {
    const data = valuation === "market" ? market : p.history;
    if (!data.length || period === "ALL") return data;
    const cutoff = new Date(data.at(-1).day);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - Number(period));
    return data.filter((d) => new Date(d.day) >= cutoff);
  }, [p.history, market, period, valuation]);
  const operations = chosen
    .flatMap((a) =>
      a.operations.map((o) => ({
        ...o,
        account: a.label,
        accountId: a.id,
        currency: a.currency,
      })),
    )
    .filter(
      (o) =>
        (flowFilter === "all" ||
          (flowFilter === "flows" && isFlow(o)) ||
          (flowFilter === "dividend" && o.type === "Dividend")) &&
        `${o.type} ${labels[o.type]} ${o.name} ${o.ticker} ${o.account}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.time.localeCompare(a.time));
  const filtered = p.holdings.filter((h) =>
    `${h.name} ${h.ticker}`.toLowerCase().includes(search.toLowerCase()),
  );
  const reportDate = chosen
    .map((a) => a.asOf)
    .filter(Boolean)
    .sort()
    .at(-1);
  const exportCSV = () => {
    const rows = [
      ["Data UTC", "Konto", "Waluta", "Typ", "Instrument", "Kwota"],
      ...operations.map((o) => [
        o.time,
        o.account,
        o.currency,
        labels[o.type] || o.type,
        o.ticker,
        o.amount,
      ]),
    ];
    const csv =
      "\uFEFF" +
      rows
        .map((r) =>
          r
            .map(
              (c) =>
                '"' +
                (typeof c === "string" && /^[=+\-@\t\r]/.test(c)
                  ? "'" + c
                  : String(c)
                ).replaceAll('"', '""') +
                '"',
            )
            .join(";"),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "folio-operacje.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const tabs = [
    ["overview", "Przegląd", LayoutDashboard],
    ["holdings", "Aktywa", BriefcaseBusiness],
    ["operations", "Operacje", ArrowLeftRight],
    ["companies", "Spółki", Building2],
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
                setPage(1);
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
            <i /> Dane z raportów XTB <span className="avatar">MP</span>
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
                      : "Spółki w portfelu"}
              </h1>
              <p>
                {view === "overview"
                  ? "Pełny obraz Twoich inwestycji. Spokojnie, przejrzyście, po Twojemu."
                  : view === "operations"
                    ? "Wpłaty, wypłaty, transfery i transakcje na wybranych kontach."
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
          ) : p.missing.length ? (
            <div className="panel empty-state">
              <Info />
              <h2>Uzupełnij kursy walut</h2>
              <p>
                Do połączenia tych kont w {base} potrzebny jest kurs:{" "}
                {[...new Set([...p.missing, base])]
                  .filter((c) => !rates[c])
                  .join(", ")}
                .
              </p>
              <button className="primary" onClick={() => setModal("settings")}>
                Ustaw kursy przeliczeniowe
              </button>
            </div>
          ) : (
            <>
              <div className="report-line">
                <span>
                  <span className="status-dot" />
                  Stan raportów: {day(reportDate)}
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
                      foot="Aktywa i wolne środki • stan z raportów"
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
                      foot="Łącznie brutto • wybrane konta"
                      icon={<Leaf size={19} />}
                    />
                  </section>
                  <div className="charts-grid">
                    <section className="panel history-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Historia kapitału</h2>
                          <p>
                            {valuation === "cost"
                              ? "Wartość według kosztu zakupu"
                              : "Wycena według importowanych notowań"}
                          </p>
                        </div>
                        <div className="segmented">
                          <button
                            className={chartMode === "value" ? "on" : ""}
                            onClick={() => setChartMode("value")}
                          >
                            Kwota
                          </button>
                          <button
                            className={chartMode === "percent" ? "on" : ""}
                            onClick={() => setChartMode("percent")}
                          >
                            %
                          </button>
                        </div>
                      </div>
                      <div className="valuation-controls">
                        <div className="segmented">
                          <button
                            className={valuation === "cost" ? "on" : ""}
                            onClick={() => setValuation("cost")}
                          >
                            Koszt historyczny
                          </button>
                          <button
                            className={valuation === "market" ? "on" : ""}
                            onClick={() => setValuation("market")}
                          >
                            Wycena rynkowa
                          </button>
                        </div>
                        {valuation === "market" && (
                          <button
                            className="text-button"
                            onClick={() => setModal("settings")}
                          >
                            Dodaj notowania CSV <Upload size={12} />
                          </button>
                        )}
                      </div>
                      <div className="chart-controls">
                        <div className="legend">
                          <span>
                            <i style={{ background: "#39765b" }} />
                            {chartMode === "value"
                              ? valuation === "cost"
                                ? "Kapitał według kosztu"
                                : "Wartość rynkowa"
                              : valuation === "cost"
                                ? "Wynik / suma wpływów"
                                : "Zmiana po korekcie przepływów"}
                          </span>
                          {chartMode === "value" && valuation === "cost" && (
                            <span>
                              <i className="dashed" />
                              Wpływy netto
                            </span>
                          )}
                        </div>
                        <div className="periods">
                          {[
                            ["1", "1M"],
                            ["3", "3M"],
                            ["6", "6M"],
                            ["12", "1R"],
                            ["ALL", "Całość"],
                          ].map(([id, label]) => (
                            <button
                              key={id}
                              className={period === id ? "on" : ""}
                              onClick={() => setPeriod(id)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {valuation === "market" && (
                        <div className="market-warning">
                          {!quotes.length
                            ? "Dodaj notowania CSV w ustawieniach, aby zobaczyć historię rynkową. Raport XTB nie zawiera tych cen."
                            : `${market.filter((d) => d.value !== null).length} z ${market.length} dni ma pełne pokrycie cenami. Braki tworzą przerwy; ostatnia znana cena jest przenoszona do przodu.`}
                          {market.some((d) => d.stale > 0) &&
                            " Niektóre ceny mają ponad 7 dni."}
                          {market.some((d) => d.percent === null) &&
                          chartMode === "percent"
                            ? " Braki cen uniemożliwiają ciągłą stopę zwrotu od początku okresu."
                            : ""}
                        </div>
                      )}
                      <div className="chart">
                        <ResponsiveContainer width="100%" height={260}>
                          <AreaChart
                            data={history}
                            margin={{ left: 0, right: 8, top: 15, bottom: 0 }}
                          >
                            <defs>
                              <linearGradient
                                id="fill"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="0%"
                                  stopColor="#619372"
                                  stopOpacity={0.25}
                                />
                                <stop
                                  offset="100%"
                                  stopColor="#619372"
                                  stopOpacity={0.01}
                                />
                              </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} stroke="#eef0eb" />
                            <XAxis
                              dataKey="day"
                              tickFormatter={(v) =>
                                new Date(v).toLocaleDateString("pl-PL", {
                                  month: "short",
                                  year: "2-digit",
                                })
                              }
                              axisLine={false}
                              tickLine={false}
                              minTickGap={50}
                              tick={{ fontSize: 11, fill: "#899087" }}
                            />
                            <YAxis
                              tickFormatter={(v) =>
                                chartMode === "percent"
                                  ? `${num(v, 0)}%`
                                  : Math.abs(v) >= 1000
                                    ? `${num(v / 1000, 1)} tys.`
                                    : num(v, 0)
                              }
                              axisLine={false}
                              tickLine={false}
                              width={66}
                              tick={{ fontSize: 11, fill: "#899087" }}
                            />
                            <Tooltip
                              labelFormatter={day}
                              formatter={(v, k) => [
                                chartMode === "percent"
                                  ? `${num(v)}%`
                                  : money(v, base),
                                k === "net"
                                  ? "Wpływy netto"
                                  : chartMode === "percent"
                                    ? valuation === "cost"
                                      ? "Wynik / suma wpływów"
                                      : "Zmiana skorygowana"
                                    : valuation === "cost"
                                      ? "Kapitał według kosztu"
                                      : "Wartość rynkowa",
                              ]}
                              contentStyle={{
                                border: "1px solid #e4e8df",
                                borderRadius: 12,
                                fontSize: 12,
                              }}
                            />
                            <Area
                              type="stepAfter"
                              dataKey={
                                chartMode === "value" ? "value" : "percent"
                              }
                              stroke="#39765b"
                              fill="url(#fill)"
                              strokeWidth={2}
                              isAnimationActive={false}
                            />
                            {chartMode === "value" && valuation === "cost" && (
                              <Area
                                type="stepAfter"
                                dataKey="net"
                                fill="none"
                                stroke="#b9bca8"
                                strokeDasharray="4 4"
                                strokeWidth={1.5}
                                isAnimationActive={false}
                              />
                            )}
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="chart-note">
                        <Info size={14} />
                        {valuation === "market"
                          ? "Ceny w walucie konta. Zmiana skorygowana zakłada przepływy na początku dnia."
                          : chartMode === "value"
                            ? "Historia obejmuje gotówkę i koszt pozycji, bez historycznych notowań."
                            : "Wynik kosztowy / suma dodatnich przepływów. To nie jest rynkowa stopa zwrotu ani TWR."}
                      </div>
                    </section>
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
              {view === "operations" && (
                <>
                  <div className="stats-grid flows-stats">
                    {chosen.map((a) => {
                      const s = stats(a);
                      return (
                        <Stat
                          key={a.id}
                          title={`Konto ${a.label}`}
                          value={money(s.inflows - s.outflows, a.currency)}
                          foot={`Wpływy ${money(s.inflows, a.currency)} · Wypływy ${money(s.outflows, a.currency)}`}
                          icon={<ArrowLeftRight size={19} />}
                        />
                      );
                    })}
                  </div>
                  <div className="info-strip">
                    <Info size={16} />
                    Wpływy i wypływy obejmują transfery między kontami i wymiany
                    walut. Nie oznaczają wyłącznie nowych wpłat z banku. Każda
                    operacja jest pokazana w walucie konta.
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>
                        Operacje{" "}
                        <span className="count">{operations.length}</span>
                      </h2>
                      <button className="secondary" onClick={exportCSV}>
                        <Download size={15} />
                        Eksport CSV
                      </button>
                    </div>
                    <div className="filter-row">
                      <div className="segmented">
                        {[
                          ["all", "Wszystkie"],
                          ["flows", "Wpłaty i wypłaty"],
                          ["dividend", "Dywidendy"],
                        ].map(([id, l]) => (
                          <button
                            className={flowFilter === id ? "on" : ""}
                            key={id}
                            onClick={() => {
                              setFlowFilter(id);
                              setPage(1);
                            }}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                      <SearchBox
                        value={search}
                        onChange={(x) => {
                          setSearch(x);
                          setPage(1);
                        }}
                      />
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>DATA</th>
                            <th>OPERACJA</th>
                            <th>INSTRUMENT</th>
                            <th>KONTO</th>
                            <th>KWOTA</th>
                          </tr>
                        </thead>
                        <tbody>
                          {operations
                            .slice((page - 1) * 20, page * 20)
                            .map((o) => (
                              <tr key={o.accountId + o.id}>
                                <td>{day(o.time)}</td>
                                <td>
                                  <span className="operation-type">
                                    <span
                                      className={
                                        o.amount >= 0
                                          ? "flow-icon positive"
                                          : "flow-icon negative"
                                      }
                                    >
                                      {o.amount >= 0 ? (
                                        <ArrowDownRight size={15} />
                                      ) : (
                                        <ArrowUpRight size={15} />
                                      )}
                                    </span>
                                    {labels[o.type] || o.type}
                                  </span>
                                </td>
                                <td>
                                  {o.name || "—"}
                                  <small>{o.ticker}</small>
                                </td>
                                <td>
                                  <span className="tag">{o.account}</span>
                                </td>
                                <td
                                  className={
                                    o.amount >= 0
                                      ? "positive bold"
                                      : "negative bold"
                                  }
                                >
                                  {o.amount > 0 ? "+" : ""}
                                  {money(o.amount, o.currency)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {!operations.length && (
                        <div className="empty-state">
                          Brak operacji spełniających kryteria.
                        </div>
                      )}
                    </div>
                    <div className="pagination">
                      <span>
                        {operations.length
                          ? `${(page - 1) * 20 + 1}–${Math.min(page * 20, operations.length)} z ${operations.length} operacji`
                          : "0 operacji"}
                      </span>
                      <button
                        className="secondary"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                      >
                        Poprzednia
                      </button>
                      <button
                        className="secondary"
                        disabled={page * 20 >= operations.length}
                        onClick={() => setPage(page + 1)}
                      >
                        Następna
                      </button>
                    </div>
                  </section>
                </>
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
                {chosen.length > 1 || chosen[0]?.currency !== base
                  ? "Wartości przeliczone stałymi kursami referencyjnymi. "
                  : ""}
                Wycena pochodzi z raportu, a nie z bieżących notowań.{" "}
                <button onClick={() => setModal("settings")}>Szczegóły</button>
              </div>
            </>
          )}
          <footer>
            <span className="footer-brand">
              <Leaf size={14} /> folio. <span>Inwestuj świadomie.</span>
            </span>
            <span>
              <ShieldCheck size={13} /> Twoje dane pozostają na tym urządzeniu
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
                <p>
                  Kursy referencyjne do łączenia walut. Nie są to kursy bieżące.
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
                        setValuation("market");
                        setNotice(
                          "Wczytano historyczne notowania. Wybierz wycenę rynkową na wykresie.",
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
              Stan z raportów: {day(reportDate)}. Dane o wartości są w walucie
              widoku ({base}).
            </p>
            <h3>Pozycje na kontach</h3>
            {chosen.flatMap((a) =>
              a.holdings
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
