export const n = (x) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const date = (x) =>
  x instanceof Date
    ? x.toISOString()
    : typeof x === "string" && !Number.isNaN(Date.parse(x))
      ? new Date(x).toISOString()
      : null;
function table(rows, first) {
  const i = rows.findIndex((r) => r[0] === first && r.includes("Ticker"));
  if (i < 0) throw new Error(`Brak nagłówka: ${first}`);
  const keys = rows[i];
  return rows
    .slice(i + 1)
    .map((r) => Object.fromEntries(keys.map((k, j) => [k, r[j] ?? ""])));
}
export async function parseWorkbook(buffer, filename) {
  const { default: ExcelJS } = await import("exceljs");
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(buffer);
  const rows = (name) => {
    const sheet = w.getWorksheet(name);
    if (!sheet)
      throw new Error(`Brak arkusza „${name}”. Wymagany pełny eksport XTB.`);
    const data = [];
    sheet.eachRow({ includeEmpty: true }, (row) =>
      data.push(
        Array.from({ length: sheet.columnCount }, (_, i) => {
          const c = row.getCell(i + 1).value;
          return c && typeof c === "object" && !(c instanceof Date)
            ? (c.result ?? c.text ?? "")
            : (c ?? "");
        }),
      ),
    );
    return data;
  };
  const cashRows = rows("Cash Operations"),
    openRows = rows("Open Positions"),
    closedRows = rows("Closed Positions");
  const id = String(cashRows.find((r) => r[0] === "Account number")?.[1] || "");
  if (!id) throw new Error("Brak numeru konta.");
  const operations = table(cashRows, "Type")
    .filter((r) => r.ID && date(r.Time))
    .map((r) => ({
      id: String(r.ID),
      type: r.Type,
      ticker: r.Ticker,
      name: r.Instrument,
      time: date(r.Time),
      amount: n(r.Amount),
      comment: r.Comment,
      product: r.Product,
    }));
  const ike =
    operations.some((r) => r.product === "IKE") || /^IKE_/i.test(filename);
  const currency =
    openRows.find((r) => r[1] === "Open position value" && r[3])?.[3] ||
    /^(USD|EUR|PLN)_/i.exec(filename)?.[1]?.toUpperCase() ||
    (ike ? "PLN" : null);
  if (!["USD", "EUR", "PLN"].includes(currency))
    throw new Error(
      "Nie rozpoznano waluty konta (obsługiwane: PLN, EUR, USD).",
    );
  const open = table(openRows, "Product").filter((r) => r.Ticker);
  if (
    open.some((r) => (r.Type && r.Type !== "BUY") || r.Category === "CFD") ||
    table(closedRows, "Instrument").some(
      (r) => r.Ticker && (r.Type !== "BUY" || r.Category === "CFD"),
    )
  )
    throw new Error(
      "Ten raport zawiera CFD lub pozycje krótkie. Obsługiwane są długie pozycje akcyjne i ETF.",
    );
  const holdings = open
    .filter((r) => r.Category && !r.Type)
    .map((r) => ({
      ticker: r.Ticker,
      name: r["Instrument/Position"],
      category: r.Category,
      quantity: n(r.Volume),
      value: n(r.Value),
      profit: n(r["Net Profit"]),
      cost: n(r.Value) - n(r["Net Profit"]),
    }));
  const lots = open
    .filter((r) => r.Type && date(r["Open time (UTC)"]))
    .map((r) => ({
      ticker: r.Ticker,
      quantity: n(r.Volume),
      cost: n(r.Value) - n(r["Net Profit"]),
      open: date(r["Open time (UTC)"]),
      close: null,
    }));
  const closed = table(closedRows, "Instrument")
    .filter((r) => r.Ticker && date(r["Close Time (UTC)"]))
    .map((r) => ({
      ticker: r.Ticker,
      name: r.Instrument,
      quantity: n(r.Volume),
      cost: n(r["Purchase Value"]),
      open: date(r["Open Time (UTC)"]),
      close: date(r["Close Time (UTC)"]),
      profit: n(r["Profit/Loss"]),
    }));
  const warnings = [];
  const snapshotId = String(
    openRows.find((r) => r[0] === "Account number")?.[1] || "",
  );
  if (snapshotId !== id)
    warnings.push(
      `Arkusz Open Positions wskazuje konto ${snapshotId}, a operacje ${id}. Użyto konta operacji i produktu ${ike ? "IKE" : "My Trades"}; sprawdź eksport.`,
    );
  const reported = n(openRows.find((r) => r[1] === "Open position value")?.[2]);
  if (Math.abs(holdings.reduce((s, h) => s + h.value, 0) - reported) > 0.1)
    warnings.push("Suma pozycji różni się od podsumowania raportu.");
  return {
    id,
    label: ike ? "IKE" : currency,
    currency,
    filename,
    asOf: date(
      openRows.find((r) => r[0] === "Data as of report generated")?.[1],
    ),
    from: date(cashRows.find((r) => r[0] === "Date from (UTC)")?.[1]),
    operations,
    holdings,
    lots,
    closed,
    warnings,
  };
}
export function inferRates(accounts) {
  const found = { PLN: 1 };
  const stamps = {};
  const ops = accounts
    .flatMap((a) => a.operations)
    .sort((a, b) => a.time.localeCompare(b.time));
  for (const o of ops) {
    const m =
      /Currency conversion, (\w+) to (\w+).*Exchange rate:\s*([\d.]+)/i.exec(
        o.comment,
      );
    if (m && Number(m[3]) > 0) {
      found[`${m[1]}_${m[2]}`] = Number(m[3]);
      stamps[`${m[1]}_${m[2]}`] = o.time;
    }
  }
  if (found.EUR_PLN) found.EUR = found.EUR_PLN;
  if (found.USD_PLN) found.USD = found.USD_PLN;
  else if (found.EUR_PLN && found.EUR_USD)
    found.USD = found.EUR_PLN / found.EUR_USD;
  return {
    PLN: 1,
    EUR: found.EUR || null,
    USD: found.USD || null,
    source: Object.keys(stamps).length
      ? "Ostatnie kursy wymian w raportach; różne daty, bez notowań na żywo."
      : "Wpisz kursy przeliczeniowe do PLN.",
  };
}
export const isFlow = (o) =>
  [
    "Deposit",
    "Withdrawal",
    "Transfer",
    "IKE deposit",
    "IKE withdrawal",
  ].includes(o.type);
export function stats(a) {
  const sum = (f) => a.operations.filter(f).reduce((s, o) => s + o.amount, 0);
  const cash = sum(() => true);
  return {
    cash,
    assets: a.holdings.reduce((s, h) => s + h.value, 0),
    profit: a.holdings.reduce((s, h) => s + h.profit, 0),
    inflows: sum((o) => isFlow(o) && o.amount > 0),
    outflows: -sum((o) => isFlow(o) && o.amount < 0),
    dividends: sum((o) => o.type === "Dividend"),
    realized: a.closed.reduce((s, c) => s + c.profit, 0),
  };
}
export function portfolio(accounts, rates, base = "PLN") {
  const factor = (a) =>
    a.currency === base
      ? 1
      : rates[a.currency] && rates[base]
        ? rates[a.currency] / rates[base]
        : null;
  const missing = accounts
    .filter((a) => factor(a) === null)
    .map((a) => a.currency);
  if (missing.length)
    return {
      missing: [...new Set(missing)],
      holdings: [],
      history: [],
      totals: {},
    };
  const totals = {
    cash: 0,
    assets: 0,
    profit: 0,
    inflows: 0,
    outflows: 0,
    dividends: 0,
    realized: 0,
  };
  const holdings = new Map(),
    daily = new Map();
  const event = (time, value, flow = 0) => {
    if (!time) return;
    const day = time.slice(0, 10);
    const old = daily.get(day) || { delta: 0, flow: 0, inflow: 0 };
    old.delta += value;
    old.flow += flow;
    old.inflow += Math.max(flow, 0);
    daily.set(day, old);
  };
  for (const a of accounts) {
    const f = factor(a),
      s = stats(a);
    for (const k in totals) totals[k] += s[k] * f;
    for (const h of a.holdings) {
      const prev = holdings.get(h.ticker) || {
        ...h,
        value: 0,
        cost: 0,
        profit: 0,
        quantity: 0,
        accounts: [],
      };
      for (const k of ["value", "cost", "profit"]) prev[k] += h[k] * f;
      prev.quantity += h.quantity;
      prev.accounts.push(a.label);
      holdings.set(h.ticker, prev);
    }
    for (const o of a.operations)
      event(o.time, o.amount * f, isFlow(o) ? o.amount * f : 0);
    for (const l of [...a.lots, ...a.closed]) {
      event(l.open, l.cost * f);
      if (l.close) event(l.close, -l.cost * f);
    }
    if (a.asOf) event(a.asOf, 0);
  }
  let value = 0,
    net = 0,
    inflow = 0;
  const history = [...daily]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, e]) => {
      value += e.delta;
      net += e.flow;
      inflow += e.inflow;
      return {
        day,
        value,
        net,
        percent: inflow > 0 ? ((value - net) / inflow) * 100 : 0,
      };
    });
  return {
    missing: [],
    holdings: [...holdings.values()].sort((a, b) => b.value - a.value),
    history,
    totals: { ...totals, value: totals.cash + totals.assets },
  };
}
export function mergeReports(old, incoming) {
  const map = new Map(old.map((a) => [a.id, a]));
  const messages = [];
  for (const a of incoming) {
    const prev = map.get(a.id);
    if (prev && prev.asOf > a.asOf) {
      messages.push(`Konto ${a.id}: pominięto starszy raport.`);
      continue;
    }
    map.set(a.id, a);
  }
  return { accounts: [...map.values()], messages };
}
export const labels = {
  Deposit: "Wpłata",
  Withdrawal: "Wypłata",
  Transfer: "Wymiana / transfer",
  "IKE deposit": "Transfer IKE",
  "Stock purchase": "Zakup akcji",
  "Stock sell": "Sprzedaż akcji",
  Dividend: "Dywidenda",
  "Withholding tax": "Podatek od dywidendy",
  "Free funds interest": "Odsetki",
  "Free funds interest tax": "Podatek od odsetek",
  "SEC fee": "Opłata SEC",
};
export const companies = {
  "MU.US": [
    "Micron Technology",
    "Półprzewodniki",
    "USA",
    "Producent pamięci DRAM i NAND oraz rozwiązań pamięci masowej.",
  ],
  "MSTR.US": [
    "Strategy",
    "Oprogramowanie / aktywa cyfrowe",
    "USA",
    "Oprogramowanie analityczne dla firm; istotna ekspozycja na bitcoina.",
  ],
  "NOW.US": [
    "ServiceNow",
    "Oprogramowanie",
    "USA",
    "Platforma chmurowa do automatyzacji procesów i obsługi przedsiębiorstw.",
  ],
  "ORCL.US": [
    "Oracle",
    "Oprogramowanie i chmura",
    "USA",
    "Bazy danych, aplikacje biznesowe i infrastruktura chmurowa.",
  ],
  "HY9H.DE": [
    "SK hynix",
    "Półprzewodniki",
    "Korea Południowa",
    "Producent pamięci DRAM, NAND i HBM dla centrów danych.",
  ],
  "AMD.DE": [
    "Advanced Micro Devices",
    "Półprzewodniki",
    "USA",
    "Projektant procesorów CPU i GPU dla komputerów i centrów danych.",
  ],
  "NVD.DE": [
    "NVIDIA",
    "Półprzewodniki",
    "USA",
    "Projektant układów graficznych oraz platform obliczeniowych dla AI.",
  ],
  "SIVE.SE": [
    "Sivers Semiconductors",
    "Półprzewodniki",
    "Szwecja",
    "Rozwiązania fotoniczne i bezprzewodowe układy komunikacyjne.",
  ],
  "CDR.PL": [
    "CD Projekt",
    "Gry wideo",
    "Polska",
    "Producent serii Wiedźmin i Cyberpunk; grupa obejmuje platformę GOG.",
  ],
  "XTB.PL": [
    "XTB",
    "Usługi finansowe",
    "Polska",
    "Firma inwestycyjna oferująca platformę do handlu instrumentami finansowymi.",
  ],
  "CBF.PL": [
    "cyber_Folks",
    "Usługi internetowe",
    "Polska",
    "Hosting, domeny i narzędzia dla e-commerce oraz biznesu online.",
  ],
};
// CSV prices are unit values in the account currency (not necessarily the exchange's currency).
export function parseQuotes(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  const sep = lines[0]?.includes(";") ? ";" : ",";
  const headers = lines[0]?.split(sep).map((s) => s.trim().toLowerCase());
  if (headers?.join(",") !== "date,ticker,currency,price")
    throw new Error(
      "Nagłówek CSV musi mieć kolumny: date,ticker,currency,price.",
    );
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const [day, ticker, currency, raw] = lines[i]
      .split(sep)
      .map((s) => s.trim());
    const price = Number(raw?.replace(",", "."));
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !date(day) ||
      new Date(day).toISOString().slice(0, 10) !== day ||
      !ticker ||
      !["PLN", "EUR", "USD"].includes(currency) ||
      !(price > 0)
    )
      throw new Error(`Nieprawidłowe notowanie w wierszu ${i + 1}.`);
    map.set(`${day}|${ticker}|${currency}`, { day, ticker, currency, price });
  }
  if (!map.size) throw new Error("Plik nie zawiera notowań.");
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}
export function marketHistory(accounts, rates, base, quotes) {
  const cost = portfolio(accounts, rates, base);
  if (cost.missing.length) return [];
  const days = new Set(cost.history.map((h) => h.day));
  const first = cost.history[0]?.day,
    last = cost.history.at(-1)?.day;
  for (const q of quotes) if (q.day >= first && q.day <= last) days.add(q.day);
  const prices = new Map();
  for (const q of quotes) {
    const key = `${q.ticker}|${q.currency}`;
    const list = prices.get(key) || [];
    list.push(q);
    prices.set(key, list);
  }
  for (const list of prices.values())
    list.sort((a, b) => a.day.localeCompare(b.day));
  let previous = null,
    index = 1,
    completeChain = true;
  return [...days].sort().map((day) => {
    let value = 0,
      flow = 0,
      missing = 0,
      stale = 0;
    for (const a of accounts) {
      const f = a.currency === base ? 1 : rates[a.currency] / rates[base];
      for (const o of a.operations)
        if (o.time.slice(0, 10) <= day) {
          value += o.amount * f;
          if (o.time.slice(0, 10) === day && isFlow(o)) flow += o.amount * f;
        }
      for (const l of [...a.lots, ...a.closed])
        if (
          l.open?.slice(0, 10) <= day &&
          (!l.close || l.close.slice(0, 10) > day)
        ) {
          const list = prices.get(`${l.ticker}|${a.currency}`);
          const q = list?.findLast((q) => q.day <= day);
          if (!q) {
            missing++;
            continue;
          }
          value += l.quantity * q.price * f;
          if ((new Date(day) - new Date(q.day)) / 86400000 > 7) stale++;
        }
    }
    if (missing) {
      completeChain = false;
      previous = null;
      return { day, value: null, percent: null, missing, stale };
    }
    if (previous !== null && completeChain) {
      const denominator = previous + flow;
      if (denominator > 0) index *= value / denominator;
      else if (Math.abs(value) > 0.01) completeChain = false;
    }
    const percent = completeChain ? (index - 1) * 100 : null;
    previous = value;
    return { day, value, percent, missing: 0, stale };
  });
}
