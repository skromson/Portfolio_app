import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCompanyUpdatesRequest,
  parseNewsRss,
  parseCompanyCalendar,
  safeNewsUrl,
  createCompanyUpdatesService,
} from "../server/news.js";
const now = Date.parse("2026-10-28T12:00:00Z");
const rss = (items = "") =>
  `<?xml version="1.0"?><rss><channel>${items}</channel></rss>`;
const item = (
  url = "https://finance.yahoo.com/news/demo?utm_source=test",
  date = "Wed, 28 Oct 2026 10:00:00 GMT",
) =>
  `<item><title><![CDATA[Company &amp; results]]></title><guid>demo</guid><link>${url.replaceAll("&", "&amp;")}</link><pubDate>${date}</pubDate><source>Publisher</source></item>`;
const html = (
  earnings = {
    earningsDate: [{ fmt: "2026-11-24", raw: 1795536300 }],
    isEarningsDateEstimate: false,
  },
  name = "Example Company",
) =>
  `<script type="application/json" data-sveltekit-fetched>${JSON.stringify({ body: JSON.stringify({ quoteSummary: { result: [{ price: { longName: name }, calendarEvents: { earnings } }] } }) })}</script>`;
test("RSS keeps recent dated articles, decodes text, deduplicates and rejects unsafe links/future news", () => {
  const data = parseNewsRss(
    rss(
      item() +
        item() +
        item("javascript:alert(1)") +
        item("https://example.com/old", "Mon, 01 Jun 2026 10:00:00 GMT") +
        item("https://example.com/future", "Mon, 30 Nov 2026 10:00:00 GMT"),
    ),
    now,
  );
  assert.equal(data.length, 1);
  assert.equal(data[0].title, "Company & results");
  assert.equal(data[0].url, "https://finance.yahoo.com/news/demo");
  assert.equal(data[0].source, "Publisher");
  assert.equal(safeNewsUrl("https://user:password@example.com"), null);
  assert.equal(safeNewsUrl("http://untrusted.example/"), null);
});
test("extracts only explicitly sourced future earnings; missing flag is estimated, ranges stay ranges", () => {
  const actual = parseCompanyCalendar(html(), "CDR.WA", now);
  assert.equal(actual.name, "Example Company");
  assert.deepEqual(actual.earnings[0], {
    date: "2026-11-24",
    status: "confirmed",
    source: "Yahoo Finance",
    url: "https://finance.yahoo.com/quote/CDR.WA/calendar/",
  });
  const estimated = parseCompanyCalendar(
    html({ earningsDate: [{ fmt: "2026-11-24" }, { fmt: "2026-11-26" }] }),
    "TEST",
    now,
  );
  assert.equal(estimated.earnings.length, 1);
  assert.equal(estimated.earnings[0].dateEnd, "2026-11-26");
  assert.equal(estimated.earnings[0].status, "estimated");
  assert.equal(
    parseCompanyCalendar(
      html({
        earningsDate: [{ fmt: "2026-01-01" }],
        isEarningsDateEstimate: false,
      }),
      "TEST",
      now,
    ).earnings.length,
    0,
  );
  assert.equal(
    parseCompanyCalendar("<html>No calendar available</html>", "TEST", now)
      .earnings.length,
    0,
  );
});
test("validates bounded symbols and uses existing XTB mapping", () => {
  assert.equal(
    validateCompanyUpdatesRequest({ tickers: ["GOOGC.US", "GOOGC.US"] })
      .symbols["GOOGC.US"],
    "GOOG",
  );
  assert.throws(() =>
    validateCompanyUpdatesRequest({ tickers: Array(51).fill("MU.US") }),
  );
  assert.throws(() =>
    validateCompanyUpdatesRequest({ tickers: ["https://evil.example"] }),
  );
  assert.throws(() =>
    validateCompanyUpdatesRequest({
      tickers: ["MU.US"],
      symbols: { "MU.US": "http://evil.example" },
    }),
  );
});
test("fetches current RSS and public calendar with cache, excludes account data and avoids unnecessary broad search", async () => {
  const calls = [];
  const service = createCompanyUpdatesService({
    now: () => now,
    fetchFn: async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        text: async () =>
          url.hostname === "finance.yahoo.com" ? html() : rss(item()),
      };
    },
  });
  const a = await service.getUpdates({ tickers: ["MU.US"], symbols: {} });
  const b = await service.getUpdates({ tickers: ["MU.US"], symbols: {} });
  assert.equal(a.companies[0].news.length, 1);
  assert.equal(a.companies[0].earnings[0].status, "confirmed");
  assert.equal(calls.length, 2);
  assert.ok(calls.every((u) => u.startsWith("https://")));
  assert.ok(calls.every((u) => !u.includes("news.google.com")));
  assert.deepEqual(a, b);
});
test("missing current RSS uses verified company name fallback with explicit warning; never invents earnings on failure", async () => {
  const calls = [];
  const service = createCompanyUpdatesService({
    now: () => now,
    fetchFn: async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        text: async () =>
          url.hostname === "finance.yahoo.com"
            ? html({ earningsDate: [] }, "CD Projekt S.A.")
            : url.hostname === "news.google.com"
              ? rss(item("https://example.com/article"))
              : rss(),
      };
    },
  });
  const data = await service.getUpdates({ tickers: ["CDR.PL"] });
  assert.equal(data.companies[0].news.length, 1);
  assert.equal(data.companies[0].earnings.length, 0);
  assert.ok(data.companies[0].warnings.some((w) => w.includes("Google News")));
  assert.ok(
    decodeURIComponent(
      calls.find((u) => u.includes("news.google.com")).replaceAll("+", " "),
    ).includes('"CD Projekt"'),
  );
  const down = createCompanyUpdatesService({
    now: () => now,
    fetchFn: async () => ({ ok: false, status: 503 }),
  });
  const failed = await down.getUpdates({ tickers: ["MU.US"] });
  assert.equal(failed.companies[0].news.length, 0);
  assert.equal(failed.companies[0].earnings.length, 0);
  assert.ok(failed.companies[0].error);
});
