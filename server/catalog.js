import { fetch as proxyFetch, EnvHttpProxyAgent } from "undici";
import { validateRequest } from "./market.js";
const dispatcher = new EnvHttpProxyAgent();
const SYMBOL = /^[A-Za-z0-9^][A-Za-z0-9.^=\-]{0,39}$/;
export function validateBenchmarks(body) {
  if (
    !body ||
    !Array.isArray(body.symbols) ||
    !body.symbols.length ||
    body.symbols.length > 8 ||
    !body.symbols.every((s) => typeof s === "string" && SYMBOL.test(s))
  )
    throw new Error("Podaj od 1 do 8 symboli indeksów lub spółek.");
  const symbols = [...new Set(body.symbols)];
  const tickers = symbols.map((_, i) => `B${i}`),
    overrides = Object.fromEntries(tickers.map((t, i) => [t, symbols[i]]));
  validateRequest({ tickers, from: body.from, symbols: overrides });
  return { symbols, tickers, overrides, from: body.from };
}
export function createCatalogService(
  market,
  {
    fetchFn = (url, options) => proxyFetch(url, { ...options, dispatcher }),
    now = () => Date.now(),
  } = {},
) {
  const searches = new Map();
  return {
    async getBenchmarks(body) {
      const { symbols, tickers, overrides, from } = validateBenchmarks(body);
      const data = await market.getMarket({
        tickers,
        activeTickers: tickers,
        symbols: overrides,
        from,
      });
      return {
        ...data,
        instruments: Object.fromEntries(
          symbols.map((s, i) => [s, data.instruments[tickers[i]]]),
        ),
      };
    },
    async search(query) {
      if (typeof query !== "string" || !query.trim() || query.length > 80)
        throw new Error("Wpisz nazwę lub symbol (do 80 znaków).");
      const key = query.trim().toUpperCase();
      const cached = searches.get(key);
      if (cached && cached.expires > now()) return cached.data;
      let failure;
      for (const host of [
        "query1.finance.yahoo.com",
        "query2.finance.yahoo.com",
      ]) {
        const url = new URL(`https://${host}/v1/finance/search`);
        url.searchParams.set("q", query.trim());
        url.searchParams.set("quotesCount", "12");
        url.searchParams.set("newsCount", "0");
        try {
          const response = await fetchFn(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 Folio/0.3",
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(12000),
          });
          if (!response.ok)
            throw new Error(`Wyszukiwarka zwróciła HTTP ${response.status}.`);
          const json = await response.json();
          const data = {
            quotes: (json.quotes || [])
              .filter(
                (q) =>
                  SYMBOL.test(q.symbol) &&
                  ["EQUITY", "ETF", "INDEX"].includes(q.quoteType),
              )
              .map((q) => ({
                symbol: q.symbol,
                name: q.longname || q.shortname || q.symbol,
                exchange: q.exchDisp || q.exchange,
                type: q.quoteType,
                currency: q.currency || null,
              })),
          };
          searches.set(key, { expires: now() + 15 * 60000, data });
          if (searches.size > 100)
            searches.delete(searches.keys().next().value);
          return data;
        } catch (e) {
          failure = e;
        }
      }
      throw new Error(
        failure?.message || "Wyszukiwanie jest chwilowo niedostępne.",
      );
    },
  };
}
