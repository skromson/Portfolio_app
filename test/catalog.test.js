import { test } from "node:test";
import assert from "node:assert/strict";
import { createCatalogService, validateBenchmarks } from "../server/catalog.js";
test("benchmark validation allows indices and stocks but rejects arbitrary destinations and excessive symbols", () => {
  assert.deepEqual(
    validateBenchmarks({ symbols: ["^GSPC", "AAPL"], from: "2025-01-01" })
      .symbols,
    ["^GSPC", "AAPL"],
  );
  assert.throws(() =>
    validateBenchmarks({ symbols: ["https://evil/"], from: "2025-01-01" }),
  );
  assert.throws(() =>
    validateBenchmarks({
      symbols: Array.from({ length: 9 }, (_, i) => "B" + i),
      from: "2025-01-01",
    }),
  );
});
test("benchmark request remaps output to user-selected original symbols without portfolio details", async () => {
  let request;
  const c = createCatalogService({
    getMarket: async (body) => {
      request = body;
      return {
        instruments: { B0: { price: 100 }, B1: { price: 200 } },
        fx: { USD: { price: 4 } },
        to: "2025-01-02",
      };
    },
  });
  const d = await c.getBenchmarks({
    symbols: ["^GSPC", "AAPL"],
    from: "2025-01-01",
  });
  assert.equal(d.instruments["^GSPC"].price, 100);
  assert.equal(d.instruments.AAPL.price, 200);
  assert.deepEqual(request.symbols, { B0: "^GSPC", B1: "AAPL" });
  assert.ok(!("accounts" in request));
});
test("search filters unsupported assets and caches repeated queries", async () => {
  let calls = 0;
  const c = createCatalogService(
    {},
    {
      fetchFn: async () => {
        calls++;
        return {
          ok: true,
          json: async () => ({
            quotes: [
              {
                symbol: "^GSPC",
                longname: "S&P500",
                quoteType: "INDEX",
                exchDisp: "Index",
              },
              { symbol: "AAPL", shortname: "Apple", quoteType: "EQUITY" },
              { symbol: "ES=F", quoteType: "FUTURE" },
              { symbol: "https://bad", quoteType: "EQUITY" },
            ],
          }),
        };
      },
    },
  );
  const d = await c.search("S&P500");
  assert.equal(d.quotes.length, 2);
  await c.search("S&P500");
  assert.equal(calls, 1);
  await assert.rejects(() => c.search(""));
});
