import React, { useEffect, useMemo, useRef, useState, useId } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Bar,
  Brush,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  Info,
  Plus,
  Minus,
  MoveHorizontal,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { labels } from "./portfolio.js";
import { rebaseHistory } from "./online.js";
import { compareBenchmarks } from "./benchmarks.js";
import "./chart.css";
const COLORS = [
  "#527bb0",
  "#c39047",
  "#9c75ac",
  "#4c9e9b",
  "#bd7474",
  "#778348",
  "#ac7e55",
  "#7d91aa",
];
const GROUPS = [
  ["deposit", "Wpłaty"],
  ["withdrawal", "Wypłaty"],
  ["transfer", "Transfery"],
  ["purchase", "Zakupy"],
  ["sale", "Sprzedaże"],
  ["dividend", "Dywidendy"],
  ["interest", "Odsetki"],
  ["tax", "Podatki"],
  ["other", "Pozostałe"],
];
const PRESETS = [
  ["^GSPC", "S&P 500"],
  ["^NDX", "Nasdaq 100"],
  ["WIG20.WA", "WIG20"],
  ["ETFBW20TR.WA", "WIG20TR — ETF Beta (proxy)"],
  ["URTH", "MSCI World — ETF URTH"],
];
const number = (v, d = 2) =>
  new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
    useGrouping: "always",
  }).format(v);
const money = (v, base) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : `${number(v)} ${base === "PLN" ? "zł" : base}`;
const date = (v) =>
  v
    ? new Date(v + "T12:00:00Z").toLocaleDateString("pl-PL", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
const percent = (v) =>
  v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${number(v)}%`;
function group(type) {
  if (type === "Deposit") return "deposit";
  if (type === "Withdrawal") return "withdrawal";
  if (["Transfer", "IKE deposit", "IKE withdrawal"].includes(type))
    return "transfer";
  if (type === "Stock purchase") return "purchase";
  if (type === "Stock sell") return "sale";
  if (type === "Dividend") return "dividend";
  if (type === "Free funds interest") return "interest";
  if (/tax|fee|commission/i.test(type)) return "tax";
  return "other";
}
function readBenchmarks() {
  try {
    const values = JSON.parse(
      localStorage.getItem("folio-benchmarks-v1") || "[]",
    );
    return Array.isArray(values)
      ? values
          .filter(
            (v) =>
              v && typeof v.symbol === "string" && typeof v.name === "string",
          )
          .slice(0, 8)
      : [];
  } catch {
    return [];
  }
}
function rangeFor(rows, period) {
  if (!rows.length) return { start: 0, end: 0 };
  if (period === "ALL") return { start: 0, end: rows.length - 1 };
  const cutoff = new Date(rows.at(-1).day + "T00:00:00Z");
  cutoff.setUTCMonth(cutoff.getUTCMonth() - Number(period));
  const start = rows.findIndex((d) => Date.parse(d.day) >= +cutoff);
  return { start: Math.max(0, start), end: rows.length - 1 };
}
function clampRange(start, end, length) {
  if (!length) return { start: 0, end: 0 };
  const span = Math.min(length - 1, Math.max(0, end - start));
  const safeStart = Math.min(Math.max(0, Math.round(start)), length - 1 - span);
  return { start: safeStart, end: safeStart + span };
}
function fallbackFlows(accounts, base, rates) {
  const result = new Map();
  for (const a of accounts)
    for (const o of a.operations) {
      const factor =
        a.currency === base
          ? 1
          : rates[a.currency] && rates[base]
            ? rates[a.currency] / rates[base]
            : null;
      const day = o.time.slice(0, 10),
        list = result.get(day) || [];
      list.push({
        ...o,
        amount: factor === null ? null : o.amount * factor,
        nativeAmount: o.amount,
        currency: a.currency,
        accountId: a.id,
        accountLabel: a.label,
        internal: false,
      });
      result.set(day, list);
    }
  return result;
}
function ChartTooltip({ active, payload, base, mode, benchmarks }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const shownFlows = row.chartFlows || [];
  return (
    <div className="folio-chart-tooltip">
      <strong>{date(row.day)}</strong>
      <div>
        <span>Portfel</span>
        <b>
          {mode === "percent" ? percent(row.percent) : money(row.value, base)}
        </b>
      </div>
      {benchmarks.map((b, i) => (
        <div key={b.symbol}>
          <span>
            <i style={{ background: COLORS[i] }} />
            {b.name}
          </span>
          <b>
            {mode === "percent"
              ? percent(row[`benchmark${i}Percent`])
              : money(row[`benchmark${i}Value`], base)}
          </b>
        </div>
      ))}
      {(row.estimated || row.estimatedReturn) && (
        <p className="estimate-tooltip">
          {row.estimated
            ? "Wycena szacunkowa"
            : "Wynik zależy od wcześniejszych szacunków"}
          {row.estimates?.length
            ? ": " +
              [
                ...new Set(
                  row.estimates.map((e) => `${e.ticker} (${e.source})`),
                ),
              ].join(", ")
            : ""}
        </p>
      )}
      {shownFlows.length > 0 && (
        <>
          <hr />
          <div>
            <span>Wpływy / wypływy</span>
            <b>
              {money(row.chartInflow, base)} / {money(row.chartOutflow, base)}
            </b>
          </div>
          <ul>
            {shownFlows.slice(0, 6).map((o, i) => (
              <li key={`${o.accountId}-${o.id || i}`}>
                <span>
                  {labels[o.type] || o.type} · {o.accountLabel}
                  {o.internal ? " · wewnętrzny" : ""}
                </span>
                <b>{money(o.nativeAmount ?? o.amount, o.currency || base)}</b>
              </li>
            ))}
          </ul>
          {shownFlows.length > 6 && (
            <small>i {shownFlows.length - 6} kolejnych operacji</small>
          )}
        </>
      )}
      {benchmarks.length > 0 && (
        <p className="benchmark-tooltip-source">
          {benchmarks
            .map((b, i) =>
              row[`benchmark${i}Source`]
                ? `${b.symbol}: ${row[`benchmark${i}Source`]}`
                : null,
            )
            .filter(Boolean)
            .join(" • ")}
        </p>
      )}
      {benchmarks.some((b, i) => row[`benchmark${i}Status`]) && (
        <p className="estimate-tooltip">
          {benchmarks
            .map((b, i) =>
              row[`benchmark${i}Status`]
                ? `${b.name}: ${row[`benchmark${i}Status`]}`
                : null,
            )
            .filter(Boolean)
            .join(" • ")}
        </p>
      )}
    </div>
  );
}
export default function PortfolioChart({
  history = [],
  accounts = [],
  marketData,
  base = "PLN",
  rates = {},
  onlineMode = false,
  valuation = "cost",
  onSettings,
}) {
  const [mode, setMode] = useState("value"),
    [period, setPeriod] = useState("6"),
    [bounds, setBounds] = useState(null),
    [inflows, setInflows] = useState(true),
    [outflows, setOutflows] = useState(true),
    [types, setTypes] = useState(["deposit", "withdrawal", "transfer"]),
    [benchmarks, setBenchmarks] = useState(readBenchmarks),
    [editor, setEditor] = useState(false),
    [query, setQuery] = useState(""),
    [searchResults, setSearchResults] = useState([]),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState(""),
    [benchmarkData, setBenchmarkData] = useState(null),
    [benchmarkError, setBenchmarkError] = useState(""),
    [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const plot = useRef(),
    gesture = useRef(null),
    pointers = useRef(new Map()),
    boundsRef = useRef(),
    previousDates = useRef("");
  const gradient = useId().replaceAll(":", "");
  const rows = history;
  const defaultRange = rangeFor(rows, period === "custom" ? "ALL" : period);
  const range = clampRange(
    bounds?.start ?? defaultRange.start,
    bounds?.end ?? defaultRange.end,
    rows.length,
  );
  boundsRef.current = range;
  const dateKey = `${rows[0]?.day || ""}|${rows.at(-1)?.day || ""}`;
  useEffect(() => {
    if (
      previousDates.current &&
      previousDates.current.split("|")[0] !== dateKey.split("|")[0]
    ) {
      setBounds(null);
      setPeriod("6");
    }
    previousDates.current = dateKey;
  }, [dateKey]);
  const symbols = benchmarks.map((b) => b.symbol),
    symbolKey = JSON.stringify(symbols),
    from = rows[0]?.day;
  useEffect(() => {
    try {
      localStorage.setItem("folio-benchmarks-v1", JSON.stringify(benchmarks));
    } catch {}
  }, [benchmarks]);
  useEffect(() => {
    if (!onlineMode || !symbols.length || !from) {
      setBenchmarkData(null);
      setBenchmarkError("");
      setBenchmarkLoading(false);
      return;
    }
    let canceled = false,
      timer;
    const controller = new AbortController();
    setBenchmarkData(null);
    async function load() {
      setBenchmarkLoading(true);
      try {
        const response = await fetch("/api/benchmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: JSON.parse(symbolKey), from }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(120000),
          ]),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || `HTTP ${response.status}`);
        if (!data.instruments || !data.fx)
          throw new Error("Niepełna odpowiedź benchmarków.");
        if (!canceled) {
          setBenchmarkData(data);
          setBenchmarkError("");
        }
      } catch (e) {
        if (!canceled)
          setBenchmarkError(
            e.name === "TimeoutError"
              ? "Pobieranie benchmarków trwało zbyt długo."
              : e.message,
          );
      } finally {
        if (!canceled) {
          setBenchmarkLoading(false);
          timer = setTimeout(load, 60000);
        }
      }
    }
    load();
    return () => {
      canceled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [symbolKey, from, onlineMode, dateKey]);
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchError("");
      return;
    }
    let canceled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          "/api/search?q=" + encodeURIComponent(query.trim()),
          { signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Wyszukiwanie niedostępne.");
        if (!canceled) {
          setSearchResults(data.quotes || []);
          setSearchError("");
        }
      } catch (e) {
        if (!canceled) setSearchError(e.message);
      } finally {
        if (!canceled) setSearching(false);
      }
    }, 350);
    return () => {
      canceled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);
  const activeBenchmarks = onlineMode ? benchmarks : [];
  const clipped = useMemo(() => {
    const selection = rows.slice(range.start, range.end + 1);
    return onlineMode ? rebaseHistory(selection) : selection;
  }, [rows, range.start, range.end, onlineMode]);
  const compared = useMemo(
    () =>
      activeBenchmarks.length && benchmarkData
        ? compareBenchmarks(
            clipped,
            benchmarkData,
            base,
            activeBenchmarks.map((b) => b.symbol),
          )
        : clipped,
    [clipped, benchmarkData, base, symbolKey, onlineMode],
  );
  const offlineFlows = useMemo(
    () => fallbackFlows(accounts, base, rates),
    [accounts, base, JSON.stringify(rates)],
  );
  const chartRows = useMemo(
    () =>
      compared.map((row) => {
        const flows = (row.flows || offlineFlows.get(row.day) || []).filter(
          (o) =>
            types.includes(group(o.type)) &&
            (o.amount >= 0 ? inflows : outflows),
        );
        const incoming = flows.reduce(
            (s, o) => (o.amount > 0 ? s + o.amount : s),
            0,
          ),
          outgoing = flows.reduce(
            (s, o) => (o.amount < 0 ? s - o.amount : s),
            0,
          );
        return {
          ...row,
          chartFlows: flows,
          chartInflow: incoming,
          chartOutflow: outgoing,
          estimatedPoint:
            row.estimated || (mode === "percent" && row.estimatedReturn)
              ? mode === "percent"
                ? row.percent
                : row.value
              : null,
        };
      }),
    [compared, offlineFlows, types, inflows, outflows, mode],
  );
  const estimatedCount = clipped.filter((d) => d.estimated).length,
    missingCount = clipped.filter((d) => d.value === null).length;
  const last = chartRows.at(-1);
  const flowMax = Math.max(
    1,
    ...chartRows.map((d) => Math.max(d.chartInflow, d.chartOutflow)),
  );
  function setRange(next) {
    setBounds(clampRange(next.start, next.end, rows.length));
    setPeriod("custom");
  }
  function zoom(factor, anchor = 0.5) {
    const current = boundsRef.current || range,
      n = rows.length;
    if (n < 2) return;
    const oldSize = current.end - current.start + 1,
      newSize = Math.min(
        n,
        Math.max(Math.min(3, n), Math.round(oldSize * factor)),
      ),
      point = current.start + (oldSize - 1) * anchor,
      start = Math.round(point - (newSize - 1) * anchor);
    setRange({ start, end: start + newSize - 1 });
  }
  function pan(direction) {
    const current = boundsRef.current || range,
      step = Math.max(1, Math.round((current.end - current.start + 1) * 0.2));
    setRange({
      start: current.start + step * direction,
      end: current.end + step * direction,
    });
  }
  const zoomRef = useRef(zoom),
    panRef = useRef(pan);
  zoomRef.current = zoom;
  panRef.current = pan;
  useEffect(() => {
    const element = plot.current;
    if (!element) return;
    const handler = (event) => {
      if (!rows.length) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY))
        panRef.current(event.deltaX > 0 ? 1 : -1);
      else
        zoomRef.current(
          event.deltaY > 0 ? 1.22 : 0.82,
          Math.max(
            0,
            Math.min(
              1,
              (event.clientX - rect.left - 58) / Math.max(1, rect.width - 80),
            ),
          ),
        );
    };
    element.addEventListener("wheel", handler, { passive: false });
    return () => element.removeEventListener("wheel", handler);
  }, [rows.length]);
  function pointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const points = [...pointers.current.values()];
    gesture.current =
      points.length === 2
        ? {
            pinch:
              Math.hypot(
                points[0].x - points[1].x,
                points[0].y - points[1].y,
              ) || 1,
            range: { ...range },
          }
        : { x: event.clientX, range: { ...range } };
  }
  function pointerMove(event) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const points = [...pointers.current.values()],
      start = gesture.current;
    const width = Math.max(1, plot.current?.clientWidth - 80);
    if (points.length === 2 && start.pinch) {
      const distance = Math.max(
        1,
        Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
      );
      const size = Math.min(
        rows.length,
        Math.max(
          Math.min(3, rows.length),
          Math.round(
            ((start.range.end - start.range.start + 1) * start.pinch) /
              distance,
          ),
        ),
      );
      const center = (start.range.start + start.range.end) / 2;
      setRange({
        start: Math.round(center - (size - 1) / 2),
        end: Math.round(center - (size - 1) / 2) + size - 1,
      });
    } else if (points.length === 1 && start.x !== undefined) {
      const delta = Math.round(
        ((start.x - event.clientX) / width) *
          (start.range.end - start.range.start + 1),
      );
      setRange({
        start: start.range.start + delta,
        end: start.range.end + delta,
      });
    }
  }
  function pointerUp(event) {
    pointers.current.delete(event.pointerId);
    gesture.current = null;
  }
  function addBenchmark(symbol, name = symbol) {
    symbol = symbol.trim();
    if (!/^[A-Za-z0-9^][A-Za-z0-9.^=\-]{0,39}$/.test(symbol)) {
      setSearchError("Wpisz symbol, np. AAPL lub ^GSPC.");
      return;
    }
    if (benchmarks.some((b) => b.symbol === symbol)) {
      setSearchError("Ten benchmark jest już wybrany.");
      return;
    }
    if (benchmarks.length >= 8) {
      setSearchError(
        "Można porównywać maksymalnie 8 benchmarków jednocześnie.",
      );
      return;
    }
    setBenchmarks([...benchmarks, { symbol, name }]);
    setQuery("");
    setSearchResults([]);
    setSearchError("");
  }
  function changeDate(which, value) {
    if (!value || !rows.length) return;
    const index =
      which === "start"
        ? rows.findIndex((d) => d.day >= value)
        : rows.findLastIndex((d) => d.day <= value);
    if (index < 0) return;
    setRange(
      which === "start"
        ? { start: Math.min(index, range.end), end: range.end }
        : { start: range.start, end: Math.max(index, range.start) },
    );
  }
  return (
    <section
      className="panel folio-history-panel"
      data-testid="portfolio-chart"
      data-visible-points={chartRows.length}
    >
      <div className="panel-heading">
        <div>
          <h2>Historia kapitału</h2>
          <p>
            {onlineMode
              ? "Wartość rynkowa z historycznymi cenami i FX"
              : valuation === "csv"
                ? "Importowane ceny CSV · stałe FX"
                : "Kapitał według kosztu zakupu"}
          </p>
        </div>
        <div className="segmented" aria-label="Rodzaj wykresu">
          <button
            className={mode === "value" ? "on" : ""}
            aria-pressed={mode === "value"}
            onClick={() => setMode("value")}
          >
            Kwota
          </button>
          <button
            className={mode === "percent" ? "on" : ""}
            aria-pressed={mode === "percent"}
            onClick={() => setMode("percent")}
          >
            %
          </button>
        </div>
      </div>
      <div className="folio-chart-summary">
        <div>
          <small>
            {mode === "percent"
              ? "WYNIK WIDOCZNEGO OKRESU"
              : "WARTOŚĆ NA KONIEC ZAKRESU"}
          </small>
          <strong
            className={
              mode === "percent" && last?.percent < 0 ? "negative" : ""
            }
          >
            {mode === "percent"
              ? `${last?.estimatedReturn ? "≈ " : ""}${percent(last?.percent)}`
              : `${last?.estimated ? "≈ " : ""}${money(last?.value, base)}`}
          </strong>
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
              aria-pressed={period === id}
              onClick={() => {
                setPeriod(id);
                setBounds(rangeFor(rows, id));
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="folio-chart-range">
        <label>
          Od{" "}
          <input
            type="date"
            aria-label="Początek zakresu wykresu"
            min={rows[0]?.day}
            max={rows.at(-1)?.day}
            value={rows[range.start]?.day || ""}
            onChange={(e) => changeDate("start", e.target.value)}
          />
        </label>
        <label>
          Do{" "}
          <input
            type="date"
            aria-label="Koniec zakresu wykresu"
            min={rows[0]?.day}
            max={rows.at(-1)?.day}
            value={rows[range.end]?.day || ""}
            onChange={(e) => changeDate("end", e.target.value)}
          />
        </label>
        <div className="folio-chart-tools">
          <button
            title="Przesuń wykres w lewo"
            aria-label="Przesuń wykres w lewo"
            disabled={range.start === 0}
            onClick={() => pan(-1)}
          >
            <ChevronLeft size={15} />
          </button>
          <button
            title="Przybliż wykres"
            aria-label="Przybliż wykres"
            disabled={chartRows.length <= 3}
            onClick={() => zoom(0.65)}
          >
            <Plus size={15} />
          </button>
          <button
            title="Oddal wykres"
            aria-label="Oddal wykres"
            disabled={chartRows.length >= rows.length}
            onClick={() => zoom(1.55)}
          >
            <Minus size={15} />
          </button>
          <button
            title="Pokaż całą historię"
            aria-label="Pokaż całą historię"
            onClick={() => {
              setPeriod("ALL");
              setBounds(rangeFor(rows, "ALL"));
            }}
          >
            <RotateCcw size={14} />
          </button>
          <button
            title="Przesuń wykres w prawo"
            aria-label="Przesuń wykres w prawo"
            disabled={range.end >= rows.length - 1}
            onClick={() => pan(1)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <div className="folio-chart-legend">
        <span>
          <i style={{ background: "#39765b" }} />
          Portfel
        </span>
        {activeBenchmarks.map((b, i) => (
          <span key={b.symbol}>
            <i style={{ background: COLORS[i] }} />
            {b.name}
          </span>
        ))}
        {(estimatedCount > 0 || last?.estimatedReturn) && (
          <span>
            <i className="estimated-key" />
            Szacunek
          </span>
        )}
      </div>
      {valuation === "csv" && (missingCount > 0 || rows.length === 0) && (
        <div className="market-warning">
          Dodaj notowania CSV w ustawieniach, aby zobaczyć historię rynkową.
        </div>
      )}
      {(estimatedCount > 0 || missingCount > 0 || last?.estimatedReturn) && (
        <div className="folio-chart-estimate" role="status">
          <Info size={14} />
          <span>
            {estimatedCount > 0
              ? `${estimatedCount} ${estimatedCount === 1 ? "dzień" : "dni"} z wyceną szacunkową w widocznym zakresie. `
              : ""}
            {last?.estimatedReturn
              ? "Wynik procentowy zależy także od oznaczonych szacunków. "
              : ""}
            {missingCount > 0
              ? `${missingCount} dni bez możliwej wyceny pozostaje przerwą. `
              : ""}
            Szacunki są oznaczone kolorem bursztynowym; szczegóły po najechaniu.
          </span>
        </div>
      )}
      <div
        ref={plot}
        className="folio-chart-plot"
        role="region"
        aria-label="Wykres portfela. Kółko przybliża, przeciągnięcie przesuwa. Strzałki przesuwają, plus i minus zmieniają skalę."
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            pan(-1);
          }
          if (e.key === "ArrowRight") {
            e.preventDefault();
            pan(1);
          }
          if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            zoom(0.65);
          }
          if (e.key === "-") {
            e.preventDefault();
            zoom(1.55);
          }
          if (e.key === "Home") {
            e.preventDefault();
            setPeriod("ALL");
            setBounds(rangeFor(rows, "ALL"));
          }
        }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      >
        <ResponsiveContainer width="100%" height={290}>
          <ComposedChart
            data={chartRows}
            margin={{ left: 0, right: 12, top: 14, bottom: 0 }}
            barGap={0}
            barCategoryGap="12%"
          >
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#619372" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#619372" stopOpacity={0.015} />
              </linearGradient>
            </defs>
            <CartesianGrid yAxisId={0} vertical={false} stroke="#eef0eb" />
            <XAxis
              dataKey="day"
              tickFormatter={(v) =>
                new Date(v + "T12:00:00Z").toLocaleDateString("pl-PL", {
                  month: "short",
                  year: "2-digit",
                })
              }
              minTickGap={48}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#899087" }}
            />
            <YAxis
              yAxisId={0}
              domain={["auto", "auto"]}
              width={62}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) =>
                mode === "percent"
                  ? `${number(v, 0)}%`
                  : Math.abs(v) >= 1000
                    ? `${number(v / 1000, 1)} tys.`
                    : number(v, 0)
              }
              tick={{ fontSize: 10, fill: "#899087" }}
            />
            <YAxis
              yAxisId={1}
              orientation="right"
              domain={[0, flowMax * 2.5]}
              hide
            />
            <Tooltip
              content={
                <ChartTooltip
                  base={base}
                  mode={mode}
                  benchmarks={activeBenchmarks}
                />
              }
              cursor={{ stroke: "#b9c8b0", strokeDasharray: "3 3" }}
            />
            {inflows && (
              <Bar
                yAxisId={1}
                dataKey="chartInflow"
                name="Wpływy"
                fill="#75a88c"
                fillOpacity={0.27}
                maxBarSize={12}
                isAnimationActive={false}
              />
            )}{" "}
            {outflows && (
              <Bar
                yAxisId={1}
                dataKey="chartOutflow"
                name="Wypływy"
                fill="#cf9083"
                fillOpacity={0.28}
                maxBarSize={12}
                isAnimationActive={false}
              />
            )}
            <Area
              yAxisId={0}
              type={onlineMode ? "linear" : "stepAfter"}
              dataKey={mode === "percent" ? "percent" : "value"}
              stroke="#39765b"
              fill={`url(#${gradient})`}
              strokeWidth={2}
              connectNulls={false}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            <Line
              yAxisId={0}
              dataKey="estimatedPoint"
              stroke="#b58d47"
              strokeDasharray="4 3"
              strokeWidth={2}
              connectNulls={false}
              dot={{ r: 2, fill: "#b58d47", strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            {activeBenchmarks.map((b, i) => (
              <Line
                key={b.symbol}
                yAxisId={0}
                type="linear"
                dataKey={`benchmark${i}${mode === "percent" ? "Percent" : "Value"}`}
                name={b.name}
                stroke={COLORS[i]}
                strokeWidth={1.6}
                dot={false}
                connectNulls={false}
                activeDot={{ r: 3 }}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {!chartRows.length && (
        <div className="empty-state">Brak danych w wybranym zakresie.</div>
      )}
      <div
        className="folio-chart-navigator"
        aria-label="Nawigator zakresu wykresu"
      >
        <ResponsiveContainer width="100%" height={48}>
          <ComposedChart
            data={rows}
            margin={{ left: 62, right: 12, top: 0, bottom: 0 }}
          >
            <Brush
              dataKey="day"
              height={23}
              y={5}
              stroke="#a8bba0"
              fill="#f8faf5"
              startIndex={range.start}
              endIndex={range.end}
              travellerWidth={9}
              tickFormatter={(v) => v?.slice(0, 10)}
              onChange={(r) =>
                r?.startIndex !== undefined &&
                r?.endIndex !== undefined &&
                setRange({ start: r.startIndex, end: r.endIndex })
              }
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="folio-chart-affordance">
        <MoveHorizontal size={13} />
        <span>
          Kółko / gest szczypania: zoom · przeciągnięcie: przesuwanie · uchwyty
          pod wykresem: zakres
        </span>
      </div>
      <div className="folio-flow-controls">
        <label>
          <input
            type="checkbox"
            checked={inflows}
            onChange={(e) => setInflows(e.target.checked)}
          />
          <ArrowDownRight size={14} className="positive" />
          Wpływy
        </label>
        <label>
          <input
            type="checkbox"
            checked={outflows}
            onChange={(e) => setOutflows(e.target.checked)}
          />
          <ArrowUpRight size={14} className="negative" />
          Wypływy
        </label>
        <details>
          <summary>
            <SlidersHorizontal size={13} />
            Rodzaje operacji ({types.length})
          </summary>
          <div className="folio-flow-popover">
            <button
              onClick={() =>
                setTypes(
                  types.length === GROUPS.length
                    ? []
                    : GROUPS.map(([id]) => id),
                )
              }
            >
              {types.length === GROUPS.length
                ? "Odznacz wszystkie typy"
                : "Wszystkie typy operacji"}
            </button>
            {GROUPS.map(([id, name]) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={types.includes(id)}
                  onChange={() =>
                    setTypes(
                      types.includes(id)
                        ? types.filter((t) => t !== id)
                        : [...types, id],
                    )
                  }
                />
                {name}
              </label>
            ))}
          </div>
        </details>
      </div>
      <div className="folio-benchmark-header">
        <button className="text-button" onClick={() => setEditor(!editor)}>
          <Plus size={14} />
          {benchmarks.length ? "Zarządzaj benchmarkami" : "Dodaj benchmark"}
        </button>
        {activeBenchmarks.length > 0 && (
          <div className="segmented" aria-label="Sposób porównania benchmarków">
            <button
              className={mode === "percent" ? "on" : ""}
              onClick={() => setMode("percent")}
            >
              Zmiana %
            </button>
            <button
              className={mode === "value" ? "on" : ""}
              onClick={() => setMode("value")}
            >
              Te same przepływy
            </button>
          </div>
        )}
      </div>
      {editor && (
        <div className="folio-benchmark-editor">
          <h3>Porównaj z rynkiem</h3>
          <p>
            Indeks lub pojedyncza spółka, w walucie widoku ({base}). Do 8
            benchmarków.
          </p>
          {!onlineMode && (
            <p className="negative">
              Porównania dostępne są w trybie „Notowania online”.
            </p>
          )}
          <div className="folio-benchmark-presets">
            {PRESETS.map(([symbol, name]) => (
              <button
                key={symbol}
                disabled={
                  !onlineMode || benchmarks.some((b) => b.symbol === symbol)
                }
                onClick={() => addBenchmark(symbol, name)}
              >
                + {name}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addBenchmark(query.trim().toUpperCase());
            }}
          >
            <label className="search-box">
              <Search size={15} />
              <input
                aria-label="Wyszukaj benchmark"
                placeholder="Spółka, indeks lub symbol, np. AAPL"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={!onlineMode}
              />
            </label>
            <button
              className="secondary"
              disabled={!onlineMode || !query.trim()}
              type="submit"
            >
              Dodaj symbol
            </button>
          </form>
          {searching && <small>Wyszukiwanie…</small>}
          {searchError && (
            <p className="negative" role="alert">
              {searchError}
            </p>
          )}
          {searchResults.length > 0 && (
            <ul className="folio-benchmark-results">
              {searchResults.slice(0, 7).map((q) => (
                <li key={q.symbol}>
                  <button
                    onClick={() => addBenchmark(q.symbol, q.name || q.symbol)}
                  >
                    <span>
                      <b>{q.name || q.symbol}</b>
                      <small>
                        {q.symbol} · {q.exchange} · {q.type}
                      </small>
                    </span>
                    <Plus size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="folio-benchmark-disclaimer">
            „Zmiana %” porównuje zmianę cen od wspólnego początku zakresu. „Te
            same przepływy” symuluje tę samą wartość początkową i daty
            wpłat/wypłat. To porównanie cenowe, bez automatycznego
            reinwestowania dywidend; URTH jest ETF-em reprezentującym MSCI
            World. ETF Beta odwzorowuje WIG20TR (z dywidendami i kosztami
            funduszu); nie jest indeksem WIG20.
          </p>
        </div>
      )}
      {benchmarks.length > 0 && (
        <div className="folio-benchmark-comparison">
          <table>
            <thead>
              <tr>
                <th>INSTRUMENT</th>
                <th>ZMIANA %</th>
                <th>PORTFEL VS BENCHMARK</th>
                <th>TE SAME PRZEPŁYWY</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr className="portfolio-comparison-row">
                <td>
                  <span>
                    <i style={{ background: "#39765b" }} />
                    <b>Mój portfel</b>
                  </span>
                </td>
                <td>
                  {last?.estimatedReturn ? "≈ " : ""}
                  {percent(last?.percent)}
                </td>
                <td>—</td>
                <td>{money(last?.value, base)}</td>
                <td />
              </tr>
              {benchmarks.map((b, i) => {
                const value = last?.[`benchmark${i}Percent`],
                  simulation = last?.[`benchmark${i}Value`],
                  difference =
                    value != null && last?.percent != null
                      ? last.percent - value
                      : null,
                  status =
                    benchmarkData?.instruments[b.symbol]?.error ||
                    last?.[`benchmark${i}Status`];
                return (
                  <React.Fragment key={b.symbol}>
                    <tr>
                      <td>
                        <span>
                          <i style={{ background: COLORS[i] }} />
                          <b>{b.name}</b>
                        </span>
                        <small>{b.symbol}</small>
                      </td>
                      <td>
                        {last?.[`benchmark${i}Estimated`] ? "≈ " : ""}
                        {percent(value)}
                      </td>
                      <td
                        className={
                          difference > 0
                            ? "positive"
                            : difference < 0
                              ? "negative"
                              : ""
                        }
                      >
                        {difference === null
                          ? "—"
                          : `${difference > 0 ? "+" : ""}${number(difference)} p.p.`}
                      </td>
                      <td>
                        {simulation == null
                          ? "—"
                          : `${last?.[`benchmark${i}Estimated`] ? "≈ " : ""}${money(simulation, base)}`}
                      </td>
                      <td>
                        <button
                          aria-label={`Usuń benchmark ${b.name}`}
                          onClick={() =>
                            setBenchmarks(
                              benchmarks.filter((v) => v.symbol !== b.symbol),
                            )
                          }
                        >
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                    {onlineMode && status && (
                      <tr className="benchmark-status-row">
                        <td colSpan={5}>{status}</td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          <p>
            Różnica dodatnia oznacza przewagę portfela. Symulacja zakłada
            identyczny kapitał początkowy i przepływy, bez prowizji i
            reinwestowania dywidend.
          </p>
        </div>
      )}

      {benchmarkLoading && (
        <p className="folio-benchmark-status" role="status">
          Pobieranie notowań benchmarków…
        </p>
      )}
      {benchmarkError && (
        <p className="folio-benchmark-status negative" role="alert">
          {benchmarkError}{" "}
          {benchmarkData ? "Wyświetlamy ostatnio pobrane dane." : ""}
        </p>
      )}
      <div className="chart-note">
        <Info size={14} />
        <span>
          {onlineMode
            ? "Historyczne ceny i FX. Procenty od początku widocznego zakresu, po korekcie przepływów."
            : mode === "percent" && valuation === "cost"
              ? "Wynik kosztowy / suma wpływów. To nie jest rynkowa stopa zwrotu ani TWR."
              : valuation === "csv"
                ? "Ceny z importu CSV, stałe kursy FX."
                : "Gotówka i koszt pozycji; bez historycznych zmian cen."}{" "}
          Słupki operacji mają osobną skalę w {base}.
          {onSettings && <button onClick={onSettings}> Metodologia</button>}
        </span>
      </div>
    </section>
  );
}
