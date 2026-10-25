import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ExcelJS from "exceljs";
import {
  parseWorkbook,
  stats,
  portfolio,
  inferRates,
  mergeReports,
} from "../src/portfolio.js";
const close = (a, b) => assert.ok(Math.abs(a - b) < 0.011, `${a} != ${b}`);
async function fixture() {
  const w = new ExcelJS.Workbook();
  w.addWorksheet("Cash Operations").addRows([
    ["Account number", "42"],
    ["Date from (UTC)", new Date("2025-01-01")],
    [
      "Type",
      "Instrument",
      "Ticker",
      "Category",
      "Time",
      "Amount",
      "ID",
      "Comment",
      "Product",
    ],
    ["Deposit", "", "", "", new Date("2025-01-01"), 100, 1, "", "My Trades"],
    [
      "Stock purchase",
      "Test",
      "TEST.PL",
      "STOCK",
      new Date("2025-01-02"),
      -60,
      2,
      "",
      "My Trades",
    ],
    [
      "Dividend",
      "Test",
      "TEST.PL",
      "STOCK",
      new Date("2025-02-01"),
      5,
      3,
      "",
      "My Trades",
    ],
    ["Total", "", "", "", "", 45],
  ]);
  w.addWorksheet("Open Positions").addRows([
    ["Account number", "42"],
    ["Data as of report generated", new Date("2025-03-01")],
    ["My Trades", "Open position value", 80, "PLN"],
    [
      "Product",
      "Instrument/Position",
      "Ticker",
      "Category",
      "Type",
      "Volume",
      "Value",
      "Current price",
      "Open price",
      "Open time (UTC)",
      "Net Profit",
    ],
    ["My Trades", "Test", "TEST.PL", "STOCK", "", 2, 80, "", 30, "", 20],
    [
      "My Trades",
      "12",
      "TEST.PL",
      "",
      "BUY",
      2,
      80,
      40,
      30,
      new Date("2025-01-02"),
      20,
    ],
  ]);
  w.addWorksheet("Closed Positions").addRows([
    [
      "Instrument",
      "Ticker",
      "Category",
      "Type",
      "Volume",
      "Open Price",
      "Open Time (UTC)",
      "Close Price",
      "Close Time (UTC)",
      "Profit/Loss",
      "Purchase Value",
    ],
    ["Profit/loss"],
  ]);
  return w.xlsx.writeBuffer();
}
test("parses snapshot and lots separately; excludes cash summary; reconstructs cost history", async () => {
  const a = await parseWorkbook(await fixture(), "PLN_test.xlsx");
  assert.equal(a.holdings.length, 1);
  assert.equal(a.lots.length, 1);
  assert.equal(a.operations.length, 3);
  close(stats(a).cash, 45);
  const p = portfolio([a], { PLN: 1 });
  close(p.totals.value, 125);
  close(p.history.at(-1).value, 105);
  close(p.history.at(-1).percent, 5);
});
test("rejects incomplete and unrecognized files", async () => {
  await assert.rejects(() => parseWorkbook(new Uint8Array([0, 1]), "bad.xlsx"));
  const w = new ExcelJS.Workbook();
  w.addWorksheet("Other");
  const incomplete = await w.xlsx.writeBuffer();
  await assert.rejects(() => parseWorkbook(incomplete, "bad.xlsx"));
});
test("same account is replaced without duplicates; old reports do not roll back snapshot", () => {
  const a = { id: "42", asOf: "2025-01-01" },
    b = { id: "42", asOf: "2025-02-01" };
  assert.equal(mergeReports([a], [b, b]).accounts.length, 1);
  assert.equal(mergeReports([b], [a]).accounts[0].asOf, b.asOf);
});
test("requires rates for mixed currencies and preserves native currency totals", () => {
  const a = {
    id: "1",
    currency: "USD",
    holdings: [],
    lots: [],
    closed: [],
    operations: [],
    asOf: null,
  };
  assert.deepEqual(portfolio([a], { PLN: 1 }).missing, ["USD"]);
  assert.equal(portfolio([a], { PLN: 1 }, "USD").missing.length, 0);
});
const path = "public/local-reports";
if (fs.existsSync(path))
  test("validates all four original XTB exports without committing personal data", async () => {
    const files = fs.readdirSync(path).filter((f) => f.endsWith(".xlsx"));
    const as = await Promise.all(
      files.map((f) => parseWorkbook(fs.readFileSync(path + "/" + f), f)),
    );
    assert.equal(as.length, 4);
    for (let i = 0; i < as.length; i++) {
      const a = as[i];
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fs.readFileSync(path + "/" + files[i]));
      const open = workbook.getWorksheet("Open Positions");
      const cash = workbook.getWorksheet("Cash Operations");
      let expectedAssets, expectedCash;
      open.eachRow((row) => {
        if (row.getCell(2).value === "Open position value")
          expectedAssets = row.getCell(3).value;
      });
      cash.eachRow((row) => {
        if (row.getCell(1).value === "Total")
          expectedCash = row.getCell(6).value;
      });
      assert.equal(a.id, String(cash.getCell("B1").value));
      close(stats(a).assets, expectedAssets);
      close(stats(a).cash, expectedCash);
      close(
        a.lots.reduce((sum, lot) => sum + lot.cost, 0),
        stats(a).assets - stats(a).profit,
      );
      assert.equal(
        a.warnings.some((w) => w.startsWith("Arkusz Open Positions")),
        String(open.getCell("B1").value) !== a.id,
      );
    }
    const rates = inferRates(as);
    assert.ok(rates.EUR > 0 && rates.USD > 0);
    const p = portfolio(as, rates);
    assert.equal(
      p.holdings.length,
      new Set(as.flatMap((a) => a.holdings.map((h) => h.ticker))).size,
    );
    close(p.history.at(-1).value, p.totals.value - p.totals.profit);
  });

test("quote CSV validates calendar dates, prices and duplicates", async () => {
  const { parseQuotes } = await import("../src/portfolio.js");
  assert.throws(() =>
    parseQuotes("date,ticker,currency,price\n2026-02-30,MU.US,USD,10"),
  );
  assert.throws(() =>
    parseQuotes("date,ticker,currency,price\n2026-02-28,MU.US,USD,-10"),
  );
  assert.throws(() => parseQuotes("bad"));
  const q = parseQuotes(
    "date;ticker;currency;price\n2026-02-28;MU.US;USD;10,25\n2026-02-28;MU.US;USD;12,5",
  );
  assert.equal(q.length, 1);
  assert.equal(q[0].price, 12.5);
});
test("market history never uses future prices, exposes missing coverage, adjusts cash flows", async () => {
  const { marketHistory } = await import("../src/portfolio.js");
  const a = await parseWorkbook(await fixture(), "PLN_test.xlsx");
  const rates = { PLN: 1 };
  const gap = marketHistory([a], rates, "PLN", [
    { day: "2025-03-01", ticker: "TEST.PL", currency: "PLN", price: 40 },
  ]);
  assert.equal(gap.find((d) => d.day === "2025-01-02").value, null);
  close(gap.at(-1).value, 125);
  assert.equal(gap.at(-1).percent, null);
  const full = marketHistory([a], rates, "PLN", [
    { day: "2025-01-02", ticker: "TEST.PL", currency: "PLN", price: 40 },
  ]);
  close(full.at(-1).value, 125);
  close(full.at(-1).percent, 25);
});
