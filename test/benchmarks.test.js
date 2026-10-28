import { test } from "node:test";
import assert from "node:assert/strict";
import { compareBenchmarks } from "../src/benchmarks.js";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const series = [
  { day: "2025-01-01", value: 1000, flow: 1000 },
  { day: "2025-01-02", value: 1100, flow: 0 },
  { day: "2025-01-03", value: 1400, flow: 200 },
  { day: "2025-01-04", value: 1100, flow: -300 },
];
function dataset() {
  return {
    to: "2025-01-04",
    instruments: {
      "^TEST": {
        currency: "PLN",
        price: 12,
        history: [
          { day: "2025-01-01", close: 10 },
          { day: "2025-01-02", close: 11 },
          { day: "2025-01-03", close: 12 },
          { day: "2025-01-04", close: 12 },
        ],
      },
    },
    fx: { PLN: { price: 1 } },
  };
}
test("benchmark percent shares the portfolio start; same-flow simulation buys/sells fractional units without double counting first deposit", () => {
  const result = compareBenchmarks(series, dataset(), "PLN", ["^TEST"]);
  near(result[0].benchmark0Value, 1000);
  near(result[0].benchmark0Percent, 0);
  near(result[1].benchmark0Value, 1100);
  near(result[1].benchmark0Percent, 10);
  near(result[2].benchmark0Value, (100 + 200 / 11) * 12);
  near(result[3].benchmark0Value, (100 + 200 / 11 - 300 / 12) * 12);
  near(result[3].benchmark0Percent, 20);
});
test("FX changes affect price return and simulation when benchmark uses another currency", () => {
  const d = dataset();
  d.instruments["^TEST"].currency = "USD";
  d.instruments["^TEST"].price = 10;
  d.instruments["^TEST"].history = d.instruments["^TEST"].history.map((q) => ({
    ...q,
    close: 10,
  }));
  d.fx.USD = {
    price: 5,
    history: [
      { day: "2025-01-01", close: 3 },
      { day: "2025-01-02", close: 4 },
      { day: "2025-01-03", close: 5 },
      { day: "2025-01-04", close: 5 },
    ],
  };
  const result = compareBenchmarks(series, d, "PLN", ["^TEST"]);
  near(result[1].benchmark0Percent, 100 / 3);
  near(result[1].benchmark0Value, 4000 / 3);
  near(result.at(-1).benchmark0Percent, 200 / 3);
});
test("missing initial quote or FX cannot be filled from future data", () => {
  const d = dataset();
  d.instruments["^TEST"].history = d.instruments["^TEST"].history.slice(1);
  const result = compareBenchmarks(series, d, "PLN", ["^TEST"]);
  assert.ok(
    result.every(
      (r) => r.benchmark0Value === null && r.benchmark0Percent === null,
    ),
  );
  assert.match(result[0].benchmark0Status, /wspólną datę/);
});
test("withdrawal above available benchmark equity halts simulation rather than inventing leverage; percent comparison remains available", () => {
  const rows = [series[0], { ...series[1], flow: -2000 }, series[2]];
  const result = compareBenchmarks(rows, dataset(), "PLN", ["^TEST"]);
  assert.equal(result[1].benchmark0Value, null);
  assert.match(result[1].benchmark0Status, /Wypłata/);
  assert.equal(result[2].benchmark0Value, null);
  near(result[2].benchmark0Percent, 20);
});
test("comparison from a zoomed range resets both portfolio and benchmark starts", () => {
  const result = compareBenchmarks(series.slice(1), dataset(), "PLN", [
    "^TEST",
  ]);
  near(result[0].percent, 0);
  near(result[0].benchmark0Percent, 0);
  near(result[0].benchmark0Value, 1100);
  near(result[1].benchmark0Percent, (12 / 11 - 1) * 100);
});
test("unavailable benchmark never becomes a zero-return line and symbols remain independent", () => {
  const d = dataset();
  d.instruments.BAD = { error: "Missing symbol" };
  const result = compareBenchmarks(series, d, "PLN", ["BAD", "^TEST"]);
  assert.equal(result[2].benchmark0Percent, null);
  assert.equal(result[2].benchmark0Value, null);
  near(result[2].benchmark1Percent, 20);
});
test("stale benchmark quote or FX is explicitly estimated with observation dates", () => {
  const d = dataset();
  d.to = "2025-02-01";
  d.instruments["^TEST"].history = [{ day: "2025-01-01", close: 10 }];
  const result = compareBenchmarks(
    [series[0], { day: "2025-01-20", value: 1100, flow: 0 }],
    d,
    "PLN",
    ["^TEST"],
  );
  assert.equal(result[1].benchmark0Estimated, true);
  assert.match(result[1].benchmark0Source, /2025-01-01/);
});
