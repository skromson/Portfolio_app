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

// Never suppress a boundary flow from a comment alone: both ledger legs must
// actually be present in the selected reports.
export function classifyInternalTransfers(accounts) {
  const selected = new Set(accounts.map((a) => String(a.id)));
  const entries = accounts.flatMap((a) => a.operations.map((o) => ({ a, o })));
  const internal = new Set(),
    unmatched = new Set();
  const transfer = (o) =>
    ["Transfer", "IKE deposit", "IKE withdrawal"].includes(o.type);
  const peerIds = (o) =>
    [
      ...String(o.comment || "").matchAll(
        /(?:from(?:\s+TA)?|to)\s*:\s*(\d+)/gi,
      ),
    ].map((m) => m[1]);
  for (const entry of entries) {
    const { a, o } = entry;
    if (!transfer(o)) continue;
    const ids = [...new Set(peerIds(o))];
    if (
      ids.length !== 2 ||
      !ids.every((id) => selected.has(id)) ||
      !ids.includes(String(a.id))
    )
      continue;
    const peer = ids.find((id) => id !== String(a.id));
    const matches = entries.filter(
      (other) =>
        String(other.a.id) === peer &&
        transfer(other.o) &&
        Math.sign(other.o.amount) === -Math.sign(o.amount) &&
        Math.abs(Date.parse(other.o.time) - Date.parse(o.time)) <= 2500 &&
        ids.every((id) => peerIds(other.o).includes(id)),
    );
    if (matches.length === 1) {
      internal.add(o);
      internal.add(matches[0].o);
    } else unmatched.add(o);
  }
  for (const e of entries) {
    if (internal.has(e.o) || unmatched.has(e.o) || !transfer(e.o)) continue;
    const matches = entries.filter(
      (other) =>
        other.a.id !== e.a.id &&
        !internal.has(other.o) &&
        !unmatched.has(other.o) &&
        transfer(other.o) &&
        other.a.currency === e.a.currency &&
        Math.abs(other.o.amount + e.o.amount) < 0.005 &&
        Math.abs(Date.parse(other.o.time) - Date.parse(e.o.time)) <= 2500,
    );
    if (matches.length === 1) {
      internal.add(e.o);
      internal.add(matches[0].o);
    }
  }
  return { internal, unmatched };
}
export function internalTransferOperations(accounts) {
  return classifyInternalTransfers(accounts).internal;
}

export function rebaseHistory(series) {
  let previous = null,
    index = 1,
    pendingFlow = 0,
    uncertain = false,
    gap = false,
    invalidChain = false;
  return series.map((point) => {
    const d = { ...point };
    uncertain ||= Boolean(d.estimated);
    const flow = Number.isFinite(d.flow) ? d.flow : 0;
    if (d.value == null || !Number.isFinite(d.value)) {
      pendingFlow += flow;
      gap = true;
      uncertain = true;
      return { ...d, percent: null, estimatedReturn: true };
    }
    let returnUnavailable = false;
    if (previous !== null) {
      const denominator = previous + pendingFlow + flow;
      if (denominator > 0) index *= d.value / denominator;
      else if (Math.abs(d.value) > 0.01) {
        returnUnavailable = true;
        invalidChain = true;
        uncertain = true;
      }
    }
    previous = d.value;
    pendingFlow = 0;
    const returnEstimates = gap
      ? [
          {
            source:
              "Zmiana między dostępnymi wycenami; przepływy z luki przypisane do początku przedziału.",
          },
        ]
      : [];
    const answer = {
      ...d,
      percent: returnUnavailable || invalidChain ? null : (index - 1) * 100,
      estimatedReturn: uncertain,
      returnEstimates,
      returnUnavailable,
    };
    gap = false;
    return answer;
  });
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
  const { internal: internalTransfers, unmatched: unmatchedTransfers } =
    classifyInternalTransfers(accounts);
  if (unmatchedTransfers.size)
    warnings.add(
      "Nie znaleziono drugiej strony części transferów między wybranymi kontami. Traktujemy je jako przepływy graniczne, a wynik oznaczamy jako szacunkowy; sprawdź zakresy raportów.",
    );
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
    const flows = [],
      estimates = [];
    for (let ai = 0; ai < accounts.length; ai++) {
      const a = accounts[ai],
        ops = operationLists[ai];
      while (
        indices[ai] < ops.length &&
        ops[indices[ai]].time.slice(0, 10) <= day
      ) {
        const o = ops[indices[ai]++];
        cashBalances[ai] += o.amount;
        if (o.time.slice(0, 10) === day) {
          const f = convert(o.amount, a.currency, base, day);
          const internal = internalTransfers.has(o);
          if (unmatchedTransfers.has(o))
            estimates.push({
              ticker: o.ticker || "",
              source:
                "Brak drugiej strony transferu w wybranych raportach; przepływ graniczny jest szacunkowy",
              observedDay: day,
            });
          flows.push({
            type: o.type,
            amount: f,
            time: o.time,
            accountId: a.id,
            accountLabel: a.label,
            ticker: o.ticker || "",
            internal,
            nativeAmount: o.amount,
            currency: a.currency,
          });
          if (isFlow(o) && !internal) {
            if (f === null) missing++;
            else flow += f;
          }
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
        const q = at(i?.history, day);
        const price = day === today && i?.price > 0 ? i.price : q?.close;
        const quantity = quantityNow(l.quantity, l.close || a.asOf, i?.splits);
        let v = null;
        if (price > 0 && i?.currency) {
          v = convert(
            quantity * price,
            i.currency,
            base,
            day === today ? null : day,
          );
          if (q && stamp - Date.parse(q.day) > 10 * DAY) {
            stale++;
            estimates.push({
              ticker: l.ticker,
              source:
                "Przeniesiona ostatnia dostępna cena (starsza niż 10 dni)",
              observedDay: q.day,
            });
          }
        } else if (l.cost >= 0 && Number.isFinite(l.cost)) {
          // No historical quote exists yet. The opening transaction provides
          // an authentic observation; never use a later close to fill it.
          const openingDay = l.open.slice(0, 10);
          if (i?.currency) {
            const openingNative = convert(
              l.cost,
              a.currency,
              i.currency,
              openingDay,
            );
            if (openingNative !== null)
              v = convert(openingNative, i.currency, base, day);
          } else v = convert(l.cost, a.currency, base, day);
          if (v !== null)
            estimates.push({
              ticker: l.ticker,
              source: i?.currency
                ? "Koszt otwarcia partii i historyczny FX; brak ceny giełdowej"
                : "Koszt otwarcia partii w walucie konta; brak ceny i waluty notowania",
              observedDay: openingDay,
            });
        }
        if (v === null) {
          missing++;
          continue;
        }
        value += v;
      }
    }
    const boundary = flows.filter(
      (o) => isFlow(o) && !o.internal && o.amount !== null,
    );
    history.push({
      day,
      value: missing ? null : value,
      percent: null,
      missing,
      stale,
      flow,
      flows,
      inflow: boundary
        .filter((o) => o.amount > 0)
        .reduce((sum, o) => sum + o.amount, 0),
      outflow: -boundary
        .filter((o) => o.amount < 0)
        .reduce((sum, o) => sum + o.amount, 0),
      estimated: estimates.length > 0,
      estimates,
    });
  }
  const sorted = [...holdings.values()].sort((a, b) => b.value - a.value);
  return {
    missing: [...errors],
    holdings: sorted,
    history: rebaseHistory(history),
    totals,
    accountHoldings,
    warnings: [...warnings],
  };
}

export function windowHistory(series, period) {
  if (!series.length || period === "ALL") return rebaseHistory(series);
  const cutoff = new Date(series.at(-1).day);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - Number(period));
  return rebaseHistory(series.filter((d) => new Date(d.day) >= cutoff));
}
