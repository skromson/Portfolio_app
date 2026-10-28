import { at, rebaseHistory } from "./online.js";
const DAY = 86400000;
function priceInBase(instrument, data, base, day) {
  const quote =
    day === data.to && instrument?.price > 0
      ? {
          close: instrument.price,
          day: instrument.priceTime?.slice(0, 10) || day,
        }
      : at(instrument?.history, day);
  if (!(quote?.close > 0) || !instrument?.currency) return null;
  const fx = (currency) =>
    currency === "PLN"
      ? { close: 1, day }
      : day === data.to
        ? {
            close: data.fx[currency]?.price,
            day: data.fx[currency]?.priceTime?.slice(0, 10) || day,
          }
        : at(data.fx[currency]?.history, day);
  const from =
      instrument.currency === base
        ? { close: 1, day }
        : fx(instrument.currency),
    to = instrument.currency === base ? { close: 1, day } : fx(base);
  if (!(from?.close > 0 && to?.close > 0)) return null;
  const observedDays = [quote.day, from.day, to.day];
  return {
    price: (quote.close * from.close) / to.close,
    observedDay: quote.day,
    carried: observedDays.some((observed) => observed < day),
    estimated: observedDays.some(
      (observed) => Date.parse(day) - Date.parse(observed) > 10 * DAY,
    ),
    source: `Cena: ${quote.day}; FX: ${from.day} / ${to.day}`,
  };
}
/** Price-return comparison, plus fractional units bought with the same dated
 * boundary cash flows. No costs/taxes/dividend reinvestment are simulated. */
export function compareBenchmarks(history, data, base = "PLN", symbols = []) {
  const rows = rebaseHistory(history).map((d) => ({ ...d }));
  symbols.forEach((symbol, index) => {
    const instrument = data?.instruments?.[symbol];
    let initial = null,
      units = null,
      exhausted = false,
      unavailable = false,
      cumulativeFlow = 0,
      gap = false,
      simulationEstimated = false;
    for (const [rowIndex, row] of rows.entries()) {
      const prefix = `benchmark${index}`,
        point = data && priceInBase(instrument, data, base, row.day);
      row[`${prefix}Percent`] = null;
      row[`${prefix}Value`] = null;
      row[`${prefix}Estimated`] = Boolean(
        row.estimatedReturn || simulationEstimated || point?.estimated,
      );
      row[`${prefix}Source`] = point?.source || null;
      row[`${prefix}Status`] = null;
      if (!instrument || instrument.error) {
        row[`${prefix}Status`] = instrument?.error || "Brak danych benchmarku";
        continue;
      }
      if (initial === null) {
        // A later listing must not silently start on another date.
        if (rowIndex !== 0 || !point || !(row.value >= 0)) {
          unavailable = true;
          row[`${prefix}Status`] =
            "Brak ceny lub FX na wspólną datę początkową";
          continue;
        }
        initial = point.price;
        units = row.value / point.price;
        simulationEstimated = Boolean(row.estimated || point.estimated);
        row[`${prefix}Value`] = row.value;
        row[`${prefix}Percent`] = 0;
        continue;
      }
      cumulativeFlow += Number.isFinite(row.flow) ? row.flow : 0;
      if (!point) {
        gap = true;
        row[`${prefix}Status`] = "Brak historycznej ceny lub FX";
        row[`${prefix}Estimated`] = true;
        continue;
      }
      row[`${prefix}Percent`] = (point.price / initial - 1) * 100;
      if (exhausted || unavailable) {
        row[`${prefix}Status`] = exhausted
          ? "Wypłata przekroczyła wartość symulowanego benchmarku; bez pożyczki dalsza symulacja jest niedostępna"
          : "Brak ceny wykonania przepływu w poprzednim przedziale";
        continue;
      }
      // Same convention as the portfolio: interval-start flows, bought at
      // the previous day's price, never at a future closing price.
      const execution = priceInBase(
        instrument,
        data,
        base,
        rows[rowIndex - 1]?.day,
      );
      if (!execution) {
        unavailable = true;
        row[`${prefix}Status`] = "Brak ceny wykonania przepływu";
        continue;
      }
      simulationEstimated ||= Boolean(
        gap || execution.estimated || point.estimated,
      );
      if (gap) {
        row[`${prefix}Source`] +=
          "; przepływy z luki przypisano do początku dostępnego przedziału";
        gap = false;
      }
      row[`${prefix}Estimated`] = Boolean(
        row.estimatedReturn || simulationEstimated,
      );
      const proposed = units + cumulativeFlow / execution.price;
      cumulativeFlow = 0;
      if (proposed < -1e-9) {
        exhausted = true;
        row[`${prefix}Status`] =
          "Wypłata przekroczyła wartość symulowanego benchmarku; brak pożyczki";
        continue;
      }
      units = Math.max(0, proposed);
      row[`${prefix}Value`] = units * point.price;
    }
  });
  return rows;
}
