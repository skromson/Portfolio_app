import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  Filter,
  Search,
  Info,
  X,
} from "lucide-react";
import { labels } from "./portfolio.js";
import {
  OPERATION_CATEGORIES,
  flattenOperations,
  filterOperations,
  summarizeOperations,
  operationsCSV,
  quickOperationRange,
} from "./operations.js";
import "./operations.css";

const allCategories = OPERATION_CATEGORIES.map(([key]) => key);
const format = (amount, currency) =>
  amount == null
    ? "—"
    : `${new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" }).format(Math.abs(amount) < 0.005 ? 0 : amount)} ${currency === "PLN" ? "zł" : currency}`;
const formatDay = (value) =>
  new Date(value).toLocaleDateString("pl-PL", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const toggle = (selected, value) =>
  selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];

export default function OperationsPanel({
  accounts,
  base = "PLN",
  marketData,
  rates,
  onlineMode = false,
}) {
  const [range, setRange] = useState({ from: "", to: "" });
  const [period, setPeriod] = useState("all");
  const [categories, setCategories] = useState(allCategories);
  const [accountIds, setAccountIds] = useState(accounts.map((a) => a.id));
  const [direction, setDirection] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const accountKey = accounts.map((a) => a.id).join("|");
  useEffect(() => {
    setAccountIds(accounts.map((a) => a.id));
    setPage(1);
  }, [accountKey]);
  const operations = useMemo(() => flattenOperations(accounts), [accounts]);
  const filtered = useMemo(
    () =>
      filterOperations(operations, {
        ...range,
        categories,
        accountIds,
        direction,
        search,
      }),
    [operations, range, categories, accountIds, direction, search],
  );
  const summary = useMemo(
    () =>
      summarizeOperations(filtered, base, { marketData, rates, onlineMode }),
    [filtered, base, marketData, rates, onlineMode],
  );
  useEffect(
    () => setPage(1),
    [range, categories, accountIds, direction, search],
  );
  const invalidDates = range.from && range.to && range.from > range.to;
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages);
  function choosePeriod(next) {
    setPeriod(next);
    setRange(quickOperationRange(next));
  }
  function exportCSV() {
    const url = URL.createObjectURL(
      new Blob([operationsCSV(filtered)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `folio-operacje-${range.from || "poczatek"}-${range.to || "koniec"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  function resetFilters() {
    setRange({ from: "", to: "" });
    setPeriod("all");
    setCategories(allCategories);
    setAccountIds(accounts.map((a) => a.id));
    setDirection("all");
    setSearch("");
  }
  return (
    <section className="operations-panel">
      <div className="panel operation-filters">
        <div className="panel-heading">
          <div>
            <h2>
              <Filter size={16} /> Filtry operacji
            </h2>
            <p>
              Zakres dat i podsumowania dotyczą wszystkich zaznaczonych filtrów.
            </p>
          </div>
          <button className="text-button" onClick={resetFilters}>
            <X size={13} />
            Wyczyść filtry
          </button>
        </div>
        <div className="operation-date-row">
          <label>
            Od dnia (UTC)
            <input
              aria-label="Operacje od dnia"
              type="date"
              value={range.from}
              onChange={(e) => {
                setRange({ ...range, from: e.target.value });
                setPeriod("custom");
              }}
            />
          </label>
          <label>
            Do dnia (UTC)
            <input
              aria-label="Operacje do dnia"
              type="date"
              value={range.to}
              min={range.from || undefined}
              onChange={(e) => {
                setRange({ ...range, to: e.target.value });
                setPeriod("custom");
              }}
            />
          </label>
          <div
            className="segmented operation-periods"
            aria-label="Szybki zakres operacji"
          >
            {[
              ["30d", "30 dni"],
              ["3m", "3 mies."],
              ["ytd", "Ten rok"],
              ["1y", "Rok"],
              ["all", "Całość"],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={period === key}
                className={period === key ? "on" : ""}
                onClick={() => choosePeriod(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {invalidDates && (
          <p className="operation-error" role="alert">
            Data początkowa nie może być późniejsza niż końcowa.
          </p>
        )}
        <div className="operation-category-row">
          <span className="operation-filter-caption">RODZAJ</span>
          <button
            className={`operation-filter-chip ${categories.length === allCategories.length ? "selected" : ""}`}
            aria-pressed={categories.length === allCategories.length}
            onClick={() => setCategories(allCategories)}
          >
            Wszystkie
          </button>
          {OPERATION_CATEGORIES.map(([key, label]) => (
            <button
              className={`operation-filter-chip ${categories.includes(key) ? "selected" : ""}`}
              key={key}
              aria-pressed={categories.includes(key)}
              onClick={() => setCategories(toggle(categories, key))}
            >
              {label}
            </button>
          ))}
          <button
            className="operation-filter-preset"
            onClick={() => setCategories(["deposit", "withdrawal"])}
          >
            Wpłaty i wypłaty
          </button>
        </div>
        <div className="operation-bottom-filters">
          <fieldset className="operation-accounts">
            <legend>Konta w tabeli</legend>
            {accounts.map((a) => (
              <label key={a.id}>
                <input
                  type="checkbox"
                  checked={accountIds.includes(a.id)}
                  onChange={() => setAccountIds(toggle(accountIds, a.id))}
                />
                <span>
                  {a.label} <small>•••• {a.id.slice(-4)}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="operation-direction">
            Kierunek
            <select
              aria-label="Kierunek operacji"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="all">Wpływy i wypływy</option>
              <option value="incoming">Tylko wpływy (+)</option>
              <option value="outgoing">Tylko wypływy (−)</option>
            </select>
          </label>
          <label className="search-box">
            <Search size={16} />
            <input
              aria-label="Szukaj w operacjach"
              placeholder="Instrument, typ lub opis…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="operation-summary-caption">
        PODSUMOWANIE WYBRANYCH OPERACJI{" "}
        <span>
          {summary.count} operacji • {base} •{" "}
          {onlineMode ? "FX z dnia operacji" : "stały kurs referencyjny"}
        </span>
      </div>
      <div
        className="operation-summary-cards"
        aria-label="Podsumowanie operacji"
      >
        {[
          [
            "Wpływy (+)",
            "incoming",
            "Wszystkie dodatnie kwoty po filtrach",
            "positive",
          ],
          [
            "Wypływy (−)",
            "outgoing",
            "Wartość wszystkich ujemnych kwot",
            "negative",
          ],
          ["Saldo operacji", "net", "Wpływy pomniejszone o wypływy", ""],
          [
            "Wpłaty zewnętrzne",
            "deposits",
            "Deposit • bez transferów własnych",
            "positive",
          ],
          [
            "Wypłaty zewnętrzne",
            "withdrawals",
            "Withdrawal • bez transferów własnych",
            "negative",
          ],
        ].map(([label, key, description, color]) => (
          <div key={key} className="stat-card operation-summary-card">
            <span>{label}</span>
            <strong className={color}>
              {format(summary.converted?.[key], base)}
            </strong>
            <small>{description}</small>
          </div>
        ))}
      </div>
      {!!summary.missingRates && (
        <div className="info-strip" role="status">
          <Info size={15} />
          Brakuje kursu dla {summary.missingRates} operacji. Suma w {base} jest
          ukryta, aby nie pokazywać częściowego wyniku. Pełne sumy w walutach
          kont znajdują się poniżej.
        </div>
      )}
      {!!summary.native.length && (
        <div className="panel operation-native-summary">
          <div className="panel-heading">
            <div>
              <h2>Sumy w walutach kont</h2>
              <p>
                Bez przeliczania i łączenia różnych walut. Uwzględniają te same
                filtry co tabela.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>WALUTA</th>
                  <th>OPERACJE</th>
                  <th>WPŁYWY</th>
                  <th>WYPŁYWY</th>
                  <th>SALDO</th>
                  <th>WPŁATY ZEWNĘTRZNE</th>
                  <th>WYPŁATY ZEWNĘTRZNE</th>
                </tr>
              </thead>
              <tbody>
                {summary.native.map((s) => (
                  <tr key={s.currency}>
                    <td>
                      <b>{s.currency}</b>
                    </td>
                    <td>{s.count}</td>
                    <td className="positive">
                      {format(s.incoming, s.currency)}
                    </td>
                    <td className="negative">
                      {format(s.outgoing, s.currency)}
                    </td>
                    <td className="bold">{format(s.net, s.currency)}</td>
                    <td>{format(s.deposits, s.currency)}</td>
                    <td>{format(s.withdrawals, s.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="info-strip">
        <Info size={15} />
        Wpłaty i wypłaty zewnętrzne to operacje Deposit i Withdrawal. Transfery
        IKE i wymiany walut są osobną kategorią; zakup oraz sprzedaż papierów są
        transakcjami.
      </div>
      <section className="panel operation-table-panel">
        <div className="panel-heading">
          <div>
            <h2>
              Operacje <span className="count">{filtered.length}</span>
            </h2>
            <p>
              {range.from || "Początek historii"} —{" "}
              {range.to || "Koniec historii"} • daty UTC
            </p>
          </div>
          <button
            className="secondary"
            disabled={!filtered.length}
            onClick={exportCSV}
          >
            <Download size={15} />
            Eksport CSV
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>DATA</th>
                <th>OPERACJA</th>
                <th>INSTRUMENT / OPIS</th>
                <th>KONTO</th>
                <th>KWOTA W WALUCIE KONTA</th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice((currentPage - 1) * 20, currentPage * 20)
                .map((o, i) => (
                  <tr key={`${o.accountId}:${o.id}:${o.time}:${i}`}>
                    <td>
                      {formatDay(o.time)}
                      <small>{o.time.slice(11, 19)} UTC</small>
                    </td>
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
                      {o.name || o.ticker || "—"}
                      {o.ticker && <small>{o.ticker}</small>}
                      {o.comment && (
                        <small className="operation-comment" title={o.comment}>
                          {o.comment}
                        </small>
                      )}
                    </td>
                    <td>
                      <span className="tag">{o.account}</span>
                    </td>
                    <td
                      className={
                        o.amount >= 0 ? "positive bold" : "negative bold"
                      }
                    >
                      {o.amount > 0 ? "+" : ""}
                      {format(o.amount, o.currency)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="empty-state">
              Brak operacji spełniających wybrane filtry.
            </div>
          )}
        </div>
        <div className="pagination">
          <span>
            {filtered.length
              ? `${(currentPage - 1) * 20 + 1}–${Math.min(currentPage * 20, filtered.length)} z ${filtered.length} operacji`
              : "0 operacji"}
          </span>
          <button
            className="secondary"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            Poprzednia
          </button>
          <button
            className="secondary"
            disabled={currentPage >= pages}
            onClick={() => setPage(currentPage + 1)}
          >
            Następna
          </button>
        </div>
      </section>
    </section>
  );
}
