import { test } from "node:test";
import assert from "node:assert/strict";
import { onlinePortfolio, quantityNow, marketRequest } from "../src/online.js";
const near = (x, y) => assert.ok(Math.abs(x - y) < 1e-8, `${x} != ${y}`);
const a = {
  id: "demo",
  label: "EUR",
  currency: "EUR",
  asOf: "2025-01-02T12:00:00Z",
  holdings: [
    {
      ticker: "TEST.US",
      name: "Test",
      quantity: 2,
      value: 60,
      cost: 50,
      profit: 10,
    },
  ],
  lots: [
    {
      ticker: "TEST.US",
      quantity: 2,
      cost: 50,
      open: "2025-01-02T12:00:00Z",
      close: null,
    },
  ],
  closed: [],
  operations: [
    { type: "Deposit", amount: 100, time: "2025-01-01T12:00:00Z" },
    { type: "Stock purchase", amount: -50, time: "2025-01-02T12:00:00Z" },
  ],
};
const data = () => ({
  from: "2025-01-01",
  to: "2025-01-03",
  fetchedAt: "2025-01-03T20:00:00Z",
  instruments: {
    "TEST.US": {
      price: 40,
      currency: "USD",
      priceTime: "2025-01-03T20:00:00Z",
      history: [
        { day: "2025-01-02", close: 30 },
        { day: "2025-01-03", close: 40 },
      ],
      splits: [],
    },
  },
  fx: {
    PLN: { price: 1, history: [] },
    USD: {
      price: 5,
      history: [
        { day: "2025-01-01", close: 3 },
        { day: "2025-01-02", close: 4 },
        { day: "2025-01-03", close: 5 },
      ],
    },
    EUR: {
      price: 4.5,
      history: [
        { day: "2025-01-01", close: 4 },
        { day: "2025-01-02", close: 4 },
        { day: "2025-01-03", close: 4.5 },
      ],
    },
  },
});
test("historical native asset prices and both FX currencies drive daily value; latest quote drives current value", () => {
  const p = onlinePortfolio([a], data(), "PLN");
  assert.deepEqual(p.missing, []);
  near(p.history[0].value, 400);
  near(p.history[1].value, 440);
  near(p.history[2].value, 625);
  near(p.history[2].percent, 56.25);
  near(p.totals.value, 625);
  near(p.totals.profit, 200);
  near(p.holdings[0].cost, 200);
  near(p.accountHoldings.demo[0].value, 400 / 4.5);
  const usd = onlinePortfolio([a], data(), "USD");
  near(usd.totals.value, 125);
  near(usd.holdings[0].cost, 50);
});
test("new cash deposit is not a return; price change still is", () => {
  const account = {
    ...a,
    currency: "PLN",
    operations: [
      { type: "Deposit", amount: 400, time: "2025-01-01T12:00:00Z" },
      { type: "Stock purchase", amount: -240, time: "2025-01-02T12:00:00Z" },
      { type: "Deposit", amount: 200, time: "2025-01-03T12:00:00Z" },
    ],
  };
  const p = onlinePortfolio([account], data());
  near(p.history[1].value, 400);
  near(p.history[2].value, 760);
  near(p.history[2].percent, (760 / 600 - 1) * 100);
});
test("future prices and FX never backfill history; missing live quotes block totals", () => {
  const d = data();
  d.instruments["TEST.US"].history = [{ day: "2025-01-03", close: 40 }];
  const p = onlinePortfolio([a], d);
  assert.equal(p.history[1].value, null);
  assert.equal(p.history[2].percent, null);
  d.instruments["TEST.US"] = { error: "unavailable" };
  assert.ok(onlinePortfolio([a], d).missing.some((e) => e.includes("TEST.US")));
});
test("split adjustment uses the quantity basis at report or closed-lot close date", () => {
  near(quantityNow(1, "2025-01-01", [{ day: "2025-01-03", ratio: 2 }]), 2);
  near(quantityNow(2, "2025-01-03", [{ day: "2025-01-03", ratio: 2 }]), 2);
  const d = data();
  d.instruments["TEST.US"].splits = [{ day: "2025-01-03", ratio: 2 }];
  const p = onlinePortfolio([a], d);
  near(p.totals.assets, 800);
  near(p.history.at(-1).value, p.totals.value);
});
test("cash-only accounts change value with FX every day; request excludes account IDs and balances", () => {
  const cash = {
    ...a,
    holdings: [],
    lots: [],
    operations: a.operations.slice(0, 1),
  };
  const p = onlinePortfolio([cash], data());
  near(p.history[0].value, 400);
  near(p.history.at(-1).value, 450);
  const r = marketRequest([a]);
  assert.ok(!JSON.stringify(r).includes("demo"));
  assert.ok(!("operations" in r));
  assert.deepEqual(r.activeTickers, ["TEST.US"]);
});
test("closed positions disappear at close and realized cash remains; selection changes all totals", () => {
  const account = {
    ...a,
    holdings: [],
    lots: [],
    closed: [{ ...a.lots[0], close: "2025-01-03T12:00:00Z", profit: 30 }],
    operations: [
      ...a.operations,
      { type: "Stock sell", amount: 80, time: "2025-01-03T12:00:00Z" },
    ],
  };
  const p = onlinePortfolio([account], data());
  near(p.history.at(-1).value, 130 * 4.5);
  near(p.totals.assets, 0);
  near(p.totals.value, 130 * 4.5);
  assert.deepEqual(onlinePortfolio([], data()).holdings, []);
});
test("return can be rebased to a selected interval after a historical gap", async () => {
  const { windowHistory } = await import("../src/online.js");
  const result = windowHistory(
    [
      { day: "2024-01-01", value: null, percent: null },
      { day: "2025-01-01", value: 100, percent: null, flow: 0 },
      { day: "2025-01-31", value: 120, percent: null, flow: 0 },
    ],
    "1",
  );
  near(result[0].percent, 0);
  near(result.at(-1).percent, 20);
});
