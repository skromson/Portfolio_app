import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeChart,
  symbolFor,
  validateRequest,
  createMarketService,
} from "../server/market.js";
function chart(symbol = "TEST", currency = "USD", price = 20) {
  return {
    chart: {
      result: [
        {
          meta: {
            symbol,
            currency,
            regularMarketPrice: price,
            regularMarketTime: 1735905600,
            exchangeTimezoneName: "UTC",
            shortName: "Test",
            fullExchangeName: "Test exchange",
          },
          timestamp: [1735819200, 1735905600],
          indicators: { quote: [{ close: [10, 20] }] },
          events: {
            splits: { one: { date: 1735905600, numerator: 2, denominator: 1 } },
          },
        },
      ],
    },
  };
}
test("normalizes provider prices, pence, dates and splits; ignores null bars", () => {
  const c = chart("IQE.L", "GBp", 20);
  c.chart.result[0].indicators.quote[0].close = [null, 20];
  const n = normalizeChart(c);
  assert.equal(n.price, 0.2);
  assert.equal(n.currency, "GBP");
  assert.equal(n.history.length, 1);
  assert.equal(n.history[0].close, 0.2);
  assert.equal(n.splits[0].ratio, 2);
});
test("maps XTB listings explicitly; only accepts symbols, not arbitrary URLs", () => {
  assert.equal(symbolFor("GOOGC.US"), "GOOG");
  assert.equal(symbolFor("HY9H.DE"), "HY9H.F");
  assert.equal(symbolFor("IQE.UK"), "IQE.L");
  assert.equal(symbolFor("SIVE.SE"), "SIVE.ST");
  assert.equal(symbolFor("CDR.PL"), "CDR.WA");
  assert.throws(() => symbolFor("MU.US", { "MU.US": "http://evil/" }));
  assert.throws(() =>
    validateRequest({ tickers: ["MU.US"], from: "2025-02-30" }),
  );
  assert.throws(() =>
    validateRequest({ tickers: Array(101).fill("MU.US"), from: "2025-01-01" }),
  );
});
test("service derives FX cross rates, caches requests and falls back to second Yahoo host", async () => {
  const calls = [];
  const service = createMarketService({
    now: () => Date.parse("2025-01-04"),
    fetchFn: async (url) => {
      calls.push(String(url));
      if (url.hostname === "query1.finance.yahoo.com")
        return { ok: false, status: 503 };
      const symbol = decodeURIComponent(url.pathname.split("/").at(-1));
      return {
        ok: true,
        json: async () =>
          chart(
            symbol,
            symbol === "TEST" ? "SEK" : symbol === "PLN=X" ? "PLN" : "SEK",
            symbol === "PLN=X" ? 4 : symbol === "SEK=X" ? 10 : 20,
          ),
      };
    },
  });
  const request = { tickers: ["TEST.US"], from: "2025-01-01" };
  const data = await service.getMarket(request);
  assert.equal(data.instruments["TEST.US"].price, 20);
  assert.equal(data.fx.SEK.price, 0.4);
  const count = calls.length;
  await service.getMarket(request);
  assert.equal(calls.length, count);
  assert.ok(calls.some((u) => u.includes("query2")));
});
test("provider outage remains an explicit error, never a fabricated quote", async () => {
  const service = createMarketService({
    fetchFn: async () => ({ ok: false, status: 429 }),
  });
  const data = await service.getMarket({
    tickers: ["TEST.US"],
    from: "2025-01-01",
  });
  assert.match(data.instruments["TEST.US"].error, /429/);
  assert.equal(data.instruments["TEST.US"].price, undefined);
});
