import { fetch as proxyFetch, EnvHttpProxyAgent } from "undici";
import { symbolFor } from "./market.js";
// Yahoo calendar pages return large cache/content-security headers. Keep a
// bounded header allowance while preserving proxy routing and TLS verification.
const dispatcher = new EnvHttpProxyAgent({ maxHeaderSize: 128 * 1024 });
const defaultFetch = (url, options) =>
  proxyFetch(url, { ...options, dispatcher });
const DAY = 86400000;
export function validateCompanyUpdatesRequest(body) {
  if (!body || !Array.isArray(body.tickers) || body.tickers.length > 50)
    throw new Error("Wymagana lista do 50 posiadanych instrumentów.");
  if (
    !body.tickers.every(
      (t) => typeof t === "string" && /^[A-Z0-9][A-Z0-9.\-]{0,29}$/.test(t),
    )
  )
    throw new Error("Nieprawidłowy ticker.");
  if (
    body.symbols != null &&
    (typeof body.symbols !== "object" || Array.isArray(body.symbols))
  )
    throw new Error("Nieprawidłowa mapa symboli.");
  const tickers = [...new Set(body.tickers)].sort();
  return {
    tickers,
    symbols: Object.fromEntries(
      tickers.map((t) => [t, symbolFor(t, body.symbols || {})]),
    ),
  };
}
function decode(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(?:amp|lt|gt|quot|apos|#39|#x[\da-f]+|#\d+);/gi, (entity) => {
      const known = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&apos;": "'",
        "&#39;": "'",
      };
      if (known[entity.toLowerCase()]) return known[entity.toLowerCase()];
      const hex = entity.toLowerCase().startsWith("&#x");
      const code = Number.parseInt(
        entity.slice(hex ? 3 : 2, -1),
        hex ? 16 : 10,
      );
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/<[^>]*>/g, "")
    .trim();
}
export function safeNewsUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname === "finance.yahoo.com" && url.protocol === "http:")
      url.protocol = "https:";
    if (url.protocol !== "https:" || url.username || url.password) return null;
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|\.tsrc$)/i.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch {
    return null;
  }
}
export function parseNewsRss(
  xml,
  now = Date.now(),
  fallbackSource = "Yahoo Finance",
) {
  const items = [];
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const text = match[1];
    const field = (name) =>
      decode(
        new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(
          text,
        )?.[1] || "",
      );
    const title = field("title"),
      url = safeNewsUrl(field("link")),
      time = Date.parse(field("pubDate"));
    if (
      !title ||
      !url ||
      !Number.isFinite(time) ||
      time > now + DAY ||
      now - time > 30 * DAY
    )
      continue;
    items.push({
      id: field("guid") || url,
      title,
      url,
      publishedAt: new Date(time).toISOString(),
      source: field("source") || fallbackSource,
    });
  }
  return [...new Map(items.map((item) => [item.url, item])).values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 8);
}
function isoDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const parsed = new Date(value);
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}
export function parseCompanyCalendar(html, symbol, now = Date.now()) {
  let summary = null;
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const outer = JSON.parse(match[1]);
      const inner =
        typeof outer.body === "string" ? JSON.parse(outer.body) : outer;
      const candidate = inner.quoteSummary?.result?.[0];
      if (
        candidate?.price?.symbol &&
        candidate.price.symbol.toUpperCase() !== symbol.toUpperCase()
      )
        continue;
      if (candidate && (candidate.calendarEvents || candidate.price)) {
        summary = candidate;
        if (candidate.calendarEvents) break;
      }
    } catch {
      /* Public page may contain unrelated application/json blocks. */
    }
  }
  const name =
    typeof summary?.price?.longName === "string"
      ? summary.price.longName
      : typeof summary?.price?.shortName === "string"
        ? summary.price.shortName
        : null;
  const earnings = summary?.calendarEvents?.earnings;
  const today = new Date(now).toISOString().slice(0, 10);
  const dates = (earnings?.earningsDate || [])
    .map(
      (d) =>
        isoDay(d?.fmt) ||
        (typeof d?.raw === "number" &&
        Number.isFinite(d.raw) &&
        Number.isFinite(+new Date(d.raw * 1000))
          ? new Date(d.raw * 1000).toISOString().slice(0, 10)
          : null),
    )
    .filter(Boolean)
    .sort();
  const unique = [...new Set(dates)];
  const events =
    unique.length &&
    unique.at(-1) >= today &&
    Date.parse(unique[0]) <= now + 366 * DAY
      ? [
          {
            date: unique[0],
            ...(unique.length > 1 ? { dateEnd: unique.at(-1) } : {}),
            status:
              earnings.isEarningsDateEstimate === false
                ? "confirmed"
                : "estimated",
            source: "Yahoo Finance",
            url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/calendar/`,
          },
        ]
      : [];
  return { name, earnings: events, calendarAvailable: !!earnings };
}
export function createCompanyUpdatesService({
  fetchFn = defaultFetch,
  now = () => Date.now(),
} = {}) {
  const cache = new Map();
  let inFlight = 0;
  const waiters = [];
  async function boundedFetch(url, maxBytes) {
    if (inFlight >= 6) await new Promise((resolve) => waiters.push(resolve));
    else inFlight++;
    try {
      const response = await fetchFn(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 Folio/0.3",
          Accept: "application/rss+xml,text/xml,text/html,*/*",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(`Źródło zwróciło HTTP ${response.status}.`);
      let text = "",
        size = 0;
      if (response.body && Symbol.asyncIterator in response.body) {
        const decoder = new TextDecoder();
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > maxBytes)
            throw new Error("Odpowiedź źródła jest za duża.");
          text += decoder.decode(chunk, { stream: true });
        }
        return text + decoder.decode();
      }
      text = await response.text();
      if (Buffer.byteLength(text) > maxBytes)
        throw new Error("Odpowiedź źródła jest za duża.");
      return text;
    } finally {
      if (waiters.length) waiters.shift()();
      else inFlight--;
    }
  }
  async function company(symbol) {
    const existing = cache.get(symbol);
    if (existing?.expires > now()) return existing.promise;
    const promise = (async () => {
      const warnings = [];
      const rssUrl = new URL(
        "https://feeds.finance.yahoo.com/rss/2.0/headline",
      );
      rssUrl.searchParams.set("s", symbol);
      rssUrl.searchParams.set("region", "US");
      rssUrl.searchParams.set("lang", "en-US");
      const [rss, calendar] = await Promise.allSettled([
        boundedFetch(rssUrl, 2 * 1024 * 1024),
        boundedFetch(
          new URL(
            `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/calendar/`,
          ),
          8 * 1024 * 1024,
        ),
      ]);
      let news =
        rss.status === "fulfilled" ? parseNewsRss(rss.value, now()) : [];
      const details =
        calendar.status === "fulfilled"
          ? parseCompanyCalendar(calendar.value, symbol, now())
          : { name: null, earnings: [], calendarAvailable: false };
      if (rss.status === "rejected")
        warnings.push(
          `Nie udało się pobrać wiadomości Yahoo: ${rss.reason.message}`,
        );
      if (calendar.status === "rejected")
        warnings.push(
          `Nie udało się pobrać kalendarza: ${calendar.reason.message}`,
        );
      if (!news.length && details.name) {
        // A verified company name is necessary: ticker-only search can be ambiguous.
        const name = details.name
          .replace(
            /(?:\b(?:Inc|Corporation|AB|plc|Company|Limited)\.?\b|\bS\.A\.)/gi,
            "",
          )
          .replace(/[,()."]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120);
        if (name.length >= 3) {
          const google = new URL("https://news.google.com/rss/search");
          google.searchParams.set("q", `"${name}" when:30d`);
          google.searchParams.set("hl", "pl");
          google.searchParams.set("gl", "PL");
          google.searchParams.set("ceid", "PL:pl");
          try {
            news = parseNewsRss(
              await boundedFetch(google, 2 * 1024 * 1024),
              now(),
              "Google News",
            );
            if (news.length)
              warnings.push(
                "Wiadomości z Google News — wyszukiwanie po nazwie spółki, gdy brak bieżących artykułów w kanale Yahoo.",
              );
          } catch (e) {
            warnings.push(`Wyszukiwanie wiadomości niedostępne: ${e.message}`);
          }
        }
      }
      return {
        symbol,
        name: details.name || symbol,
        news,
        earnings: details.earnings,
        warnings,
        ...(rss.status === "rejected" && calendar.status === "rejected"
          ? { error: "Źródła wiadomości i kalendarza są chwilowo niedostępne." }
          : {}),
      };
    })();
    cache.set(symbol, { promise, expires: now() + 15 * 60000 });
    if (cache.size > 150) cache.delete(cache.keys().next().value);
    try {
      return await promise;
    } catch (e) {
      cache.delete(symbol);
      throw e;
    }
  }
  return {
    async getUpdates(body) {
      const request = validateCompanyUpdatesRequest(body);
      const companies = await Promise.all(
        request.tickers.map(async (ticker) => {
          try {
            return { ticker, ...(await company(request.symbols[ticker])) };
          } catch (e) {
            return {
              ticker,
              symbol: request.symbols[ticker],
              name: ticker,
              news: [],
              earnings: [],
              warnings: [],
              error: e.message,
            };
          }
        }),
      );
      return {
        fetchedAt: new Date(now()).toISOString(),
        companies,
        sources: [
          "Yahoo Finance",
          "Google News (gdy brak bieżącego kanału Yahoo)",
        ],
        cacheMinutes: 15,
      };
    },
  };
}
