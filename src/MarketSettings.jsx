import React, { useState } from "react";
export default function MarketSettings({ accounts, mapping, data, onApply }) {
  const [draft, setDraft] = useState(mapping),
    [message, setMessage] = useState("");
  const tickers = [
    ...new Set(
      accounts.flatMap((a) =>
        [...a.holdings, ...a.closed].map((h) => h.ticker),
      ),
    ),
  ].sort();
  return (
    <section className="quotes-section">
      <h3>Symbole notowań online</h3>
      <p>
        Yahoo Finance, odświeżanie co 60 sekund. Część giełd publikuje dane z
        opóźnieniem. Raporty, numery kont i salda nie są wysyłane — serwer
        otrzymuje tylko tickery, symbole oraz początek historii.
      </p>
      <p>
        Domyślnie .US → symbol USA, .PL → .WA, .SE → .ST, .UK → .L, .DE
        pozostaje .DE. GOOGC.US → GOOG (akcja klasy C). HY9H.DE → HY9H.F
        (Frankfurt zamiast Xetra; zweryfikuj zgodność instrumentu).
      </p>
      <div className="mapping-list">
        {tickers.map((t) => (
          <label key={t}>
            <span>
              {t}
              <small>
                {data?.instruments[t]?.name ||
                  data?.instruments[t]?.error ||
                  "Instrument z raportu"}
              </small>
            </span>
            <input
              aria-label={`Symbol dla ${t}`}
              placeholder={data?.instruments[t]?.symbol || "Automatycznie"}
              value={draft[t] || ""}
              onChange={(e) => setDraft({ ...draft, [t]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <button
        className="secondary"
        onClick={() => {
          if (
            Object.values(draft).some(
              (v) => v && !/^[A-Za-z0-9^][A-Za-z0-9.^=\-]{0,39}$/.test(v),
            )
          ) {
            setMessage(
              "Nieprawidłowy symbol. Dozwolone litery, cyfry oraz . ^ = -",
            );
            return;
          }
          onApply(
            Object.fromEntries(Object.entries(draft).filter(([, v]) => v)),
          );
          setMessage("Zapisano mapowanie. Pobieramy nowe dane.");
        }}
      >
        Zapisz symbole
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
