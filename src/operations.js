import { labels } from "./portfolio.js";

export const OPERATION_CATEGORIES = [
  ["deposit", "Wpłaty"],
  ["withdrawal", "Wypłaty"],
  ["transfer", "Transfery"],
  ["dividend", "Dywidendy"],
  ["trade", "Transakcje"],
  ["other", "Pozostałe"],
];

export function operationCategory(operation) {
  if (operation.type === "Deposit") return "deposit";
  if (operation.type === "Withdrawal") return "withdrawal";
  if (
    operation.type === "Transfer" ||
    /^IKE (deposit|withdrawal)$/i.test(operation.type)
  )
    return "transfer";
  if (operation.type === "Dividend") return "dividend";
  if (["Stock purchase", "Stock sell"].includes(operation.type)) return "trade";
  return "other";
}

export function flattenOperations(accounts) {
  return accounts
    .flatMap((account) =>
      account.operations.map((operation) => ({
        ...operation,
        accountId: account.id,
        account: account.label,
        currency: account.currency,
        category: operationCategory(operation),
      })),
    )
    .sort(
      (a, b) =>
        b.time.localeCompare(a.time) ||
        String(a.id).localeCompare(String(b.id)),
    );
}

export function filterOperations(
  operations,
  {
    from = "",
    to = "",
    categories,
    accountIds,
    direction = "all",
    search = "",
  } = {},
) {
  if (from && to && from > to) return [];
  const categorySet = categories ? new Set(categories) : null;
  const accountSet = accountIds ? new Set(accountIds) : null;
  const query = search.trim().toLocaleLowerCase("pl-PL");
  return operations.filter((operation) => {
    const day = operation.time.slice(0, 10);
    return (
      (!from || day >= from) &&
      (!to || day <= to) &&
      (!categorySet ||
        categorySet.has(operation.category || operationCategory(operation))) &&
      (!accountSet || accountSet.has(operation.accountId)) &&
      (direction === "all" ||
        (direction === "incoming" && operation.amount > 0) ||
        (direction === "outgoing" && operation.amount < 0)) &&
      (!query ||
        [
          operation.type,
          labels[operation.type],
          operation.name,
          operation.ticker,
          operation.account,
          operation.comment,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pl-PL")
          .includes(query))
    );
  });
}

function rateAt(series, day) {
  let low = 0,
    high = (series?.length || 0) - 1,
    found = null;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (series[mid].day <= day) {
      found = series[mid].close;
      low = mid + 1;
    } else high = mid - 1;
  }
  return found > 0 ? found : null;
}

export function convertedOperationAmount(
  operation,
  base,
  { onlineMode = false, marketData, rates = {} } = {},
) {
  if (operation.currency === base || operation.amount === 0)
    return operation.amount;
  const day = operation.time.slice(0, 10);
  const rate = (currency) =>
    currency === "PLN"
      ? 1
      : onlineMode
        ? rateAt(marketData?.fx?.[currency]?.history, day)
        : rates[currency];
  const from = rate(operation.currency),
    to = rate(base);
  return from > 0 && to > 0 ? (operation.amount * from) / to : null;
}

function emptySummary() {
  return {
    incoming: 0,
    outgoing: 0,
    net: 0,
    deposits: 0,
    withdrawals: 0,
    count: 0,
  };
}
function add(summary, operation, amount) {
  summary.count++;
  summary.net += amount;
  if (amount > 0) summary.incoming += amount;
  if (amount < 0) summary.outgoing -= amount;
  const category = operation.category || operationCategory(operation);
  if (category === "deposit" && amount > 0) summary.deposits += amount;
  if (category === "withdrawal" && amount < 0) summary.withdrawals -= amount;
}

export function summarizeOperations(operations, base = "PLN", options = {}) {
  const native = new Map();
  const converted = emptySummary();
  let missingRates = 0;
  for (const operation of operations) {
    if (!native.has(operation.currency))
      native.set(operation.currency, {
        currency: operation.currency,
        ...emptySummary(),
      });
    add(native.get(operation.currency), operation, operation.amount);
    const amount = convertedOperationAmount(operation, base, options);
    if (amount === null) missingRates++;
    else add(converted, operation, amount);
  }
  return {
    native: [...native.values()].sort((a, b) =>
      a.currency.localeCompare(b.currency),
    ),
    converted: missingRates ? null : converted,
    missingRates,
    count: operations.length,
  };
}

export function operationsCSV(operations) {
  const cell = (value) => {
    const string =
      typeof value === "string" && /^[=+\-@\t\r]/.test(value)
        ? "'" + value
        : String(value ?? "");
    return '"' + string.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [
      [
        "Data UTC",
        "Konto",
        "Waluta",
        "Operacja",
        "Instrument",
        "Kwota",
        "Opis",
      ],
      ...operations.map((o) => [
        o.time,
        o.account,
        o.currency,
        labels[o.type] || o.type,
        o.ticker,
        o.amount,
        o.comment,
      ]),
    ]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n")
  );
}

export function quickOperationRange(period, now = new Date()) {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end);
  if (period === "all") return { from: "", to: "" };
  if (period === "30d") start.setUTCDate(start.getUTCDate() - 29);
  else if (period === "3m" || period === "1y") {
    const originalDay = start.getUTCDate();
    start.setUTCDate(1);
    if (period === "3m") start.setUTCMonth(start.getUTCMonth() - 3);
    else start.setUTCFullYear(start.getUTCFullYear() - 1);
    const lastDay = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
    ).getUTCDate();
    start.setUTCDate(Math.min(originalDay, lastDay));
  } else if (period === "ytd") start.setUTCMonth(0, 1);
  else throw new Error("Nieznany zakres operacji.");
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}
