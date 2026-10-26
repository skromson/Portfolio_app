import { isFlow, stats } from "./portfolio.js";
const DAY = 86400000;
export function marketRequest(accounts, symbols = {}) {
  const times = accounts
    .flatMap((a) => [
      ...a.operations.map((o) => o.time),
      ...a.lots.map((l) => l.open),
      ...a.closed.map((l) => l.open),
    ])
    .filter(Boolean)
    .sort();
  return {
    activeTickers: [
      ...new Set(accounts.flatMap((a) => a.holdings.map((h) => h.ticker))),
    ].sort(),
    tickers: [
      ...new Set(
        accounts.flatMap((a) =>
          [...a.holdings, ...a.closed, ...a.lots].map((h) => h.ticker),
        ),
      ),
    ].sort(),
    from: times[0]?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    symbols,
  };
}
export function at(series, day) {
  let lo = 0,
    hi = (series?.length || 0) - 1,
    found = null;
  while (lo <= hi) {
    const i = (lo + hi) >> 1;
    if (series[i].day <= day) {
      found = series[i];
      lo = i + 1;
    } else hi = i - 1;
  }
  return found;
}
// Yahoo's close prices are split-adjusted, but not dividend-adjusted. Normalize
// an exported quantity from its report/close-date share basis to today's basis.
export function quantityNow(quantity, reference, splits = []) {
  return (
    quantity *
    splits
      .filter((s) => s.day > reference?.slice(0, 10))
      .reduce((f, s) => f * s.ratio, 1)
  );
}
export function onlinePortfolio(accounts, data, base = "PLN") {
  const empty = {
    missing: [],
    holdings: [],
    history: [],
    totals: {},
    accountHoldings: {},
    warnings: [],
  };
  if (!data) return { ...empty, missing: ["Trwa pobieranie notowań."] };
  const errors = new Set(),
    warnings = new Set(),
    today = data.to;
  function fx(currency, day = null) {
    if (currency === "PLN") return 1;
    const rate = data.fx[currency];
    const p = day ? at(rate?.history, day)?.close : rate?.price;
    return p > 0 ? p : null;
  }
  function convert(value, from, to, day = null) {
    if (from === to) return value;
    const f = fx(from, day),
      t = fx(to, day);
    return f && t ? (value * f) / t : null;
  }
  const totals = {
    cash: 0,
    assets: 0,
    profit: 0,
    inflows: 0,
    outflows: 0,
    dividends: 0,
    realized: 0,
  };
  const holdings = new Map(),
    accountHoldings = {};
  const instruments = [
    ...new Set(accounts.flatMap((a) => a.holdings.map((h) => h.ticker))),
  ];
  for (const ticker of instruments) {
    const i = data.instruments[ticker];
    if (!i || i.error) errors.add(`${ticker}: ${i?.error || "brak notowań"}`);
  }
  for (const a of accounts) {
    accountHoldings[a.id] = [];
    const cash = convert(stats(a).cash, a.currency, base);
    if (cash === null) errors.add(`Brak kursu ${a.currency}/${base}`);
    else totals.cash += cash;
    for (const h of a.holdings) {
      const i = data.instruments[h.ticker];
      if (!i || i.error) continue;
      const quantity = quantityNow(h.quantity, a.asOf, i.splits),
        value = convert(quantity * i.price, i.currency, base);
      let cost = 0;
      const lots = a.lots.filter((l) => l.ticker === h.ticker);
      if (!lots.length)
        errors.add(
          `${h.ticker}: brak partii zakupu — wgraj ponownie pełny raport.`,
        );
      for (const lot of lots) {
        const c = convert(lot.cost, a.currency, base, lot.open.slice(0, 10));
        if (c === null)
          errors.add(
            `Brak historycznego FX ${a.currency}/${base} na ${lot.open.slice(0, 10)}`,
          );
        else cost += c;
      }
      if (value === null) {
        errors.add(`Brak kursu ${i.currency}/${base}`);
        continue;
      }
      const current = {
        ...h,
        quantity,
        value,
        cost,
        profit: value - cost,
        accounts: [a.label],
        quote: i,
      };
      const prev = holdings.get(h.ticker);
      if (prev) {
        for (const k of ["quantity", "value", "cost", "profit"])
          prev[k] += current[k];
        prev.accounts.push(a.label);
      } else holdings.set(h.ticker, current);
      const nativeValue = convert(quantity * i.price, i.currency, a.currency);
      accountHoldings[a.id].push({
        ...h,
        quantity,
        value: nativeValue,
        quote: i,
      });
      if (i.warning) warnings.add(`${h.ticker}: ${i.warning}`);
      if (i.mappingNote) warnings.add(i.mappingNote);
      if (Date.parse(data.fetchedAt) - Date.parse(i.priceTime) > 4 * DAY)
        warnings.add(`${h.ticker}: ostatnia cena ma ponad 4 dni.`);
    }
    for (const o of a.operations) {
      const amount = convert(o.amount, a.currency, base, o.time.slice(0, 10));
      if (amount === null) continue;
      if (isFlow(o)) {
        if (amount > 0) totals.inflows += amount;
        else totals.outflows -= amount;
      }
      if (o.type === "Dividend") totals.dividends += amount;
    }
    for (const c of a.closed) {
      const value = convert(c.profit, a.currency, base, c.close.slice(0, 10));
      if (value !== null) totals.realized += value;
    }
  }
  for (const [currency, rate] of Object.entries(data.fx)) {
    if (rate.warning) warnings.add(`${currency}: ${rate.warning}`);
    if (
      currency !== "PLN" &&
      Date.parse(data.fetchedAt) - Date.parse(rate.priceTime) > 4 * DAY
    )
      warnings.add(`${currency}: kurs FX ma ponad 4 dni.`);
  }
  for (const h of holdings.values()) {
    totals.assets += h.value;
    totals.profit += h.profit;
  }
  totals.value = totals.assets + totals.cash;
  const first = marketRequest(accounts).from;
  const history = [];
  let previous = null,
    index = 1,
    chain = true;
  const cashBalances = accounts.map(() => 0),
    operationLists = accounts.map((a) =>
      [...a.operations].sort((a, b) => a.time.localeCompare(b.time)),
    ),
    indices = accounts.map(() => 0);
  for (
    let stamp = Date.parse(first);
    stamp <= Date.parse(today);
    stamp += DAY
  ) {
    const day = new Date(stamp).toISOString().slice(0, 10);
    let value = 0,
      flow = 0,
      missing = 0,
      stale = 0;
    for (let ai = 0; ai < accounts.length; ai++) {
      const a = accounts[ai],
        ops = operationLists[ai];
      while (
        indices[ai] < ops.length &&
        ops[indices[ai]].time.slice(0, 10) <= day
      ) {
        const o = ops[indices[ai]++];
        cashBalances[ai] += o.amount;
        if (o.time.slice(0, 10) === day && isFlow(o)) {
          const f = convert(o.amount, a.currency, base, day);
          if (f === null) missing++;
          else flow += f;
        }
      }
      const cash =
        day === today
          ? convert(cashBalances[ai], a.currency, base)
          : convert(cashBalances[ai], a.currency, base, day);
      if (cash === null && Math.abs(cashBalances[ai]) > 0.000001) missing++;
      else value += cash || 0;
      for (const l of [...a.lots, ...a.closed]) {
        if (
          l.open.slice(0, 10) > day ||
          (l.close && l.close.slice(0, 10) <= day)
        )
          continue;
        const i = data.instruments[l.ticker];
        if (!i || i.error) {
          missing++;
          continue;
        }
        const q = at(i.history, day);
        const price = day === today ? i.price : q?.close;
        if (!(price > 0)) {
          missing++;
          continue;
        }
        const quantity = quantityNow(l.quantity, l.close || a.asOf, i.splits);
        const v = convert(
          quantity * price,
          i.currency,
          base,
          day === today ? null : day,
        );
        if (v === null) {
          missing++;
          continue;
        }
        value += v;
        if (q && stamp - Date.parse(q.day) > 10 * DAY) stale++;
      }
    }
    if (missing) {
      chain = false;
      previous = null;
      history.push({ day, value: null, percent: null, missing, stale, flow });
      continue;
    }
    if (previous !== null && chain) {
      const denominator = previous + flow;
      if (denominator > 0) index *= value / denominator;
      else if (Math.abs(value) > 0.01) chain = false;
    }
    history.push({
      day,
      value,
      percent: chain ? (index - 1) * 100 : null,
      missing: 0,
      stale,
      flow,
    });
    previous = value;
  }
  const sorted = [...holdings.values()].sort((a, b) => b.value - a.value);
  return {
    missing: [...errors],
    holdings: sorted,
    history,
    totals,
    accountHoldings,
    warnings: [...warnings],
  };
}

export function windowHistory(series, period) {
  if (!series.length || period === "ALL") return series;
  const cutoff = new Date(series.at(-1).day);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - Number(period));
  const selected = series.filter((d) => new Date(d.day) >= cutoff);
  let previous = null,
    index = 1,
    complete = true;
  return selected.map((d) => {
    if (d.value === null) {
      complete = false;
      previous = null;
      return { ...d, percent: null };
    }
    if (previous !== null && complete) {
      const denominator = previous + (d.flow || 0);
      if (denominator > 0) index *= d.value / denominator;
      else if (Math.abs(d.value) > 0.01) complete = false;
    }
    previous = d.value;
    return { ...d, percent: complete ? (index - 1) * 100 : null };
  });
}
