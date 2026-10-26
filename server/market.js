import { fetch as proxyFetch, EnvHttpProxyAgent } from "undici";
const dispatcher = new EnvHttpProxyAgent();
const defaultFetch = (url, options) =>
  proxyFetch(url, { ...options, dispatcher });
const DAY = 86400000;
export const DEFAULT_SYMBOLS = {
  "HY9H.DE": "HY9H.F",
  "GOOGC.US": "GOOG",
  "AMZN.DE": "AMZ.DE",
};
export function symbolFor(ticker, overrides = {}) {
  const symbol =
    overrides[ticker] ||
    DEFAULT_SYMBOLS[ticker] ||
    ticker
      .replace(/\.US$/, "")
      .replace(/\.PL$/, ".WA")
      .replace(/\.SE$/, ".ST")
      .replace(/\.UK$/, ".L");
  if (
    typeof symbol !== "string" ||
    !/^[A-Za-z0-9^][A-Za-z0-9.^=\-]{0,39}$/.test(symbol)
  )
    throw new Error("Nieprawidłowy symbol dostawcy.");
  return symbol;
}
export function validateRequest(body, now = new Date()) {
  if (!body || !Array.isArray(body.tickers) || body.tickers.length > 100)
    throw new Error("Wymagana lista do 100 instrumentów.");
  if (
    !body.tickers.every(
      (t) => typeof t === "string" && /^[A-Z0-9][A-Z0-9.\-]{0,29}$/.test(t),
    )
  )
    throw new Error("Nieprawidłowy ticker.");
  const from = new Date(body.from),
    today = now.toISOString().slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(body.from) ||
    !Number.isFinite(+from) ||
    from.toISOString().slice(0, 10) !== body.from ||
    from > now ||
    from.getUTCFullYear() < 2000
  )
    throw new Error(
      "Nieprawidłowa data początkowa (zakres od 2000 do dzisiaj).",
    );
  if (
    body.activeTickers &&
    (!Array.isArray(body.activeTickers) ||
      !body.activeTickers.every((t) => body.tickers.includes(t)))
  )
    throw new Error("Nieprawidłowa lista aktywnych instrumentów.");
  const overrides = body.symbols || {};
  if (typeof overrides !== "object" || Array.isArray(overrides))
    throw new Error("Nieprawidłowa mapa symboli.");
  return {
    tickers: [...new Set(body.tickers)].sort(),
    activeTickers: body.activeTickers || body.tickers,
    from: body.from,
    to: today,
    symbols: Object.fromEntries(
      body.tickers.map((t) => [t, symbolFor(t, overrides)]),
    ),
  };
}
function tradingDay(timestamp, zone = "UTC") {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp * 1000));
  return ["year", "month", "day"]
    .map((k) => p.find((x) => x.type === k).value)
    .join("-");
}
export function normalizeChart(chart) {
  const r = chart.chart?.result?.[0];
  if (!r) throw new Error(chart.chart?.error?.description || "Brak notowań.");
  const m = r.meta,
    scale = ["GBp", "GBX", "ILA"].includes(m.currency) ? 0.01 : 1;
  const currency = ["GBp", "GBX"].includes(m.currency)
    ? "GBP"
    : m.currency === "ILA"
      ? "ILS"
      : m.currency;
  if (!currency || !(m.regularMarketPrice > 0) || !m.regularMarketTime)
    throw new Error("Brak ostatniej ceny lub waluty.");
  const history = (r.timestamp || [])
    .map((time, i) => ({
      day: tradingDay(time, m.exchangeTimezoneName),
      close: r.indicators?.quote?.[0]?.close?.[i] * scale,
    }))
    .filter((q) => Number.isFinite(q.close) && q.close > 0);
  const splits = Object.values(r.events?.splits || {})
    .map((s) => ({
      day: tradingDay(s.date, m.exchangeTimezoneName),
      ratio: Number(s.numerator) / Number(s.denominator),
    }))
    .filter((s) => s.ratio > 0);
  return {
    symbol: m.symbol,
    name: m.longName || m.shortName || m.symbol,
    currency,
    exchange: m.fullExchangeName || m.exchangeName,
    price: m.regularMarketPrice * scale,
    priceTime: new Date(m.regularMarketTime * 1000).toISOString(),
    history,
    splits,
  };
}
export function createMarketService({
  fetchFn = defaultFetch,
  now = () => Date.now(),
} = {}) {
  const cache = new Map();
  async function chart(symbol, from, recent = false) {
    const key = JSON.stringify([symbol, recent ? "recent" : from]);
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return hit.promise;
    const promise = (async () => {
      let failure;
      for (const host of [
        "query1.finance.yahoo.com",
        "query2.finance.yahoo.com",
      ]) {
        const url = new URL(
          `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`,
        );
        url.searchParams.set("interval", "1d");
        url.searchParams.set("events", "splits");
        if (recent) url.searchParams.set("range", "5d");
        else {
          url.searchParams.set(
            "period1",
            String(Math.floor((Date.parse(from) - 10 * DAY) / 1000)),
          );
          url.searchParams.set(
            "period2",
            String(Math.floor(now() / 1000) + 86400),
          );
        }
        try {
          const response = await fetchFn(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 Folio/0.2",
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok)
            throw new Error(`Dostawca zwrócił HTTP ${response.status}`);
          return normalizeChart(await response.json());
        } catch (e) {
          failure = e;
        }
      }
      throw new Error(
        failure?.name === "TimeoutError"
          ? "Przekroczono czas pobierania."
          : failure?.message || "Nie można pobrać notowań.",
      );
    })();
    cache.set(key, {
      promise,
      expires: now() + (recent ? 30000 : 6 * 3600000),
    });
    if (cache.size > 400) cache.delete(cache.keys().next().value);
    try {
      return await promise;
    } catch (e) {
      cache.delete(key);
      throw e;
    }
  }
  async function load(symbol, from, needLive = true) {
    if (!needLive) return chart(symbol, from);
    const [past, live] = await Promise.allSettled([
      chart(symbol, from),
      chart(symbol, from, true),
    ]);
    if (past.status === "rejected" && live.status === "rejected")
      throw live.reason;
    let a = past.status === "fulfilled" ? past.value : null;
    const b = live.status === "fulfilled" ? live.value : null;
    if (
      a &&
      b?.splits.some(
        (s) =>
          !a.splits.some((old) => old.day === s.day && old.ratio === s.ratio),
      )
    ) {
      // A new split invalidates old, split-adjusted historical prices.
      cache.delete(JSON.stringify([symbol, from]));
      a = await chart(symbol, from);
    }
    const h = new Map(
      [...(a?.history || []), ...(b?.history || [])].map((q) => [q.day, q]),
    );
    return {
      ...(b || a),
      history: [...h.values()].sort((x, y) => x.day.localeCompare(y.day)),
      splits: [
        ...new Map(
          [...(a?.splits || []), ...(b?.splits || [])].map((s) => [s.day, s]),
        ).values(),
      ],
      warning:
        past.status === "rejected"
          ? "Nie udało się pobrać pełnej historii."
          : live.status === "rejected"
            ? "Odświeżenie ostatniej ceny nie powiodło się. Użyto wcześniejszej odpowiedzi."
            : null,
    };
  }
  async function limited(items, fn) {
    const result = {};
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, items.length) }, async () => {
        while (next < items.length) {
          const key = items[next++];
          try {
            result[key] = await fn(key);
          } catch (e) {
            result[key] = { error: e.message };
          }
        }
      }),
    );
    return result;
  }
  return {
    async getMarket(body) {
      const request = validateRequest(body, new Date(now()));
      const instruments = await limited(request.tickers, async (t) => ({
        ...(await load(
          request.symbols[t],
          request.from,
          request.activeTickers.includes(t),
        )),
        ticker: t,
        mappingNote:
          t === "HY9H.DE" && request.symbols[t] === "HY9H.F"
            ? "SK hynix: notowanie z Frankfurtu zamiast Xetra. Zweryfikuj instrument; symbol można zmienić w ustawieniach."
            : null,
      }));
      const currencies = [
        ...new Set([
          "USD",
          "EUR",
          ...Object.values(instruments)
            .map((i) => i.currency)
            .filter(Boolean),
        ]),
      ];
      const supported = new Set([
        "PLN",
        "USD",
        "EUR",
        "SEK",
        "GBP",
        "CHF",
        "NOK",
        "DKK",
        "CAD",
        "JPY",
        "HKD",
        "AUD",
        "CZK",
        "ILS",
      ]);
      const legs = await limited(
        currencies.filter((c) => c !== "PLN" && supported.has(c)),
        (c) => load(c === "USD" ? "PLN=X" : `${c}=X`, request.from),
      );
      const fx = {
        PLN: {
          currency: "PLN",
          price: 1,
          priceTime: new Date(now()).toISOString(),
          history: [],
          source: "PLN",
        },
      };
      for (const c of currencies.filter((c) => c !== "PLN")) {
        const usd = legs.USD,
          leg = legs[c];
        if (!supported.has(c) || usd?.error || leg?.error) {
          fx[c] = {
            error: leg?.error || usd?.error || `Nieobsługiwana waluta ${c}`,
          };
          continue;
        }
        const price = c === "USD" ? usd.price : usd.price / leg.price;
        const dates = [
          ...new Set([...usd.history, ...leg.history].map((q) => q.day)),
        ].sort();
        let i = 0,
          j = 0,
          up = null,
          cp = null;
        const history = [];
        for (const day of dates) {
          while (i < usd.history.length && usd.history[i].day <= day)
            up = usd.history[i++];
          while (j < leg.history.length && leg.history[j].day <= day)
            cp = leg.history[j++];
          if (up && cp)
            history.push({
              day,
              close: c === "USD" ? up.close : up.close / cp.close,
            });
        }
        fx[c] = {
          currency: c,
          price,
          priceTime:
            c === "USD"
              ? usd.priceTime
              : [usd.priceTime, leg.priceTime].sort()[0],
          history,
          source: c === "USD" ? "USD/PLN" : `USD/PLN ÷ USD/${c}`,
          warning: usd.warning || leg.warning,
        };
      }
      return {
        fetchedAt: new Date(now()).toISOString(),
        from: request.from,
        to: request.to,
        provider: "Yahoo Finance",
        instruments,
        fx,
      };
    },
  };
}
