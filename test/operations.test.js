import { test } from "node:test";
import assert from "node:assert/strict";
import {
  operationCategory,
  flattenOperations,
  filterOperations,
  summarizeOperations,
  operationsCSV,
  quickOperationRange,
} from "../src/operations.js";
const accounts = [
  {
    id: "one",
    label: "EUR",
    currency: "EUR",
    operations: [
      { id: "1", type: "Deposit", amount: 100, time: "2025-01-01T00:00:00Z" },
      {
        id: "2",
        type: "Withdrawal",
        amount: -10,
        time: "2025-01-31T23:59:59Z",
      },
      { id: "3", type: "Transfer", amount: -40, time: "2025-02-01T00:00:00Z" },
      {
        id: "4",
        type: "Stock purchase",
        amount: -30,
        time: "2025-02-02T12:00:00Z",
        name: "Example",
        ticker: "TEST.US",
      },
      { id: "5", type: "Dividend", amount: 5, time: "2025-02-03T12:00:00Z" },
    ],
  },
  {
    id: "two",
    label: "IKE",
    currency: "PLN",
    operations: [
      {
        id: "6",
        type: "IKE deposit",
        amount: 160,
        time: "2025-02-01T00:00:00Z",
      },
      {
        id: "7",
        type: "Free funds interest",
        amount: 1,
        time: "2025-02-03T12:00:00Z",
      },
    ],
  },
];
test("inclusive UTC interval, category/account/direction and search filters compose", () => {
  const all = flattenOperations(accounts);
  assert.equal(
    filterOperations(all, { from: "2025-01-01", to: "2025-01-31" }).length,
    2,
  );
  assert.equal(
    filterOperations(all, {
      categories: ["transfer"],
      accountIds: ["two"],
      direction: "incoming",
    })[0].type,
    "IKE deposit",
  );
  assert.equal(filterOperations(all, { search: "zakup" }).length, 1);
  assert.equal(filterOperations(all, { search: "example" }).length, 1);
  assert.equal(
    filterOperations(all, { from: "2025-02-01", to: "2025-01-01" }).length,
    0,
  );
  assert.equal(filterOperations(all, { categories: [] }).length, 0);
});
test("deposits and withdrawals do not count internal IKE transfers as bank flows", () => {
  assert.equal(operationCategory({ type: "IKE deposit" }), "transfer");
  assert.equal(operationCategory({ type: "Withdrawal" }), "withdrawal");
  const summary = summarizeOperations(flattenOperations(accounts), "PLN", {
    rates: { EUR: 4 },
  });
  assert.equal(summary.converted.deposits, 400);
  assert.equal(summary.converted.withdrawals, 40);
  assert.equal(summary.converted.incoming, 581);
  assert.equal(summary.converted.outgoing, 320);
  assert.equal(summary.converted.net, 261);
  assert.equal(summary.native.find((s) => s.currency === "EUR").net, 25);
});
test("summary uses per-operation historical FX without a future rate and hides incomplete converted sums", () => {
  const operations = flattenOperations(accounts);
  const fx = {
    EUR: {
      history: [
        { day: "2025-01-01", close: 4 },
        { day: "2025-02-01", close: 5 },
      ],
    },
  };
  const summary = summarizeOperations(operations, "PLN", {
    onlineMode: true,
    marketData: { fx },
  });
  assert.equal(summary.converted.net, 196);
  assert.equal(summary.converted.deposits, 400);
  const missing = summarizeOperations(operations, "PLN", {
    onlineMode: true,
    marketData: {
      fx: { EUR: { history: [{ day: "2025-03-01", close: 10 }] } },
    },
  });
  assert.equal(missing.converted, null);
  assert.equal(missing.native.length, 2);
  assert.equal(missing.missingRates, 5);
});
test("CSV includes exactly filtered rows and protects text cells from spreadsheet formulas", () => {
  const operations = filterOperations(flattenOperations(accounts), {
    categories: ["withdrawal"],
  });
  const csv = operationsCSV([
    { ...operations[0], ticker: '=HYPERLINK("bad")', comment: "+formula" },
  ]);
  assert.equal(csv.split("\r\n").length, 2);
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes("'+formula"));
  assert.ok(csv.includes('"-10"'));
});
test("quick date ranges use UTC today and all clears both date endpoints", () => {
  assert.deepEqual(
    quickOperationRange("30d", new Date("2025-03-30T23:00:00Z")),
    { from: "2025-03-01", to: "2025-03-30" },
  );
  assert.deepEqual(
    quickOperationRange("ytd", new Date("2025-03-30T23:00:00Z")),
    { from: "2025-01-01", to: "2025-03-30" },
  );
  assert.deepEqual(quickOperationRange("all"), { from: "", to: "" });
});

test("calendar-month presets clamp month-end and leap-day dates instead of overflowing", () => {
  assert.deepEqual(
    quickOperationRange("3m", new Date("2025-05-31T10:00:00Z")),
    { from: "2025-02-28", to: "2025-05-31" },
  );
  assert.deepEqual(
    quickOperationRange("1y", new Date("2024-02-29T10:00:00Z")),
    { from: "2023-02-28", to: "2024-02-29" },
  );
});
