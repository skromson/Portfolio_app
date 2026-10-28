import { test, expect } from "@playwright/test";
const days = Array.from({ length: 120 }, (_, i) =>
  new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
);
const account = {
  id: "chart-demo",
  label: "PLN",
  currency: "PLN",
  asOf: "2025-01-02T12:00:00Z",
  warnings: [],
  holdings: [
    {
      ticker: "TEST.PL",
      name: "Test Company",
      category: "STOCK",
      quantity: 1,
      value: 80,
      cost: 50,
      profit: 30,
    },
  ],
  lots: [
    {
      ticker: "TEST.PL",
      quantity: 1,
      cost: 50,
      open: "2025-01-02T12:00:00Z",
      close: null,
    },
  ],
  closed: [],
  operations: [
    { id: "1", type: "Deposit", amount: 100, time: "2025-01-01T12:00:00Z" },
    {
      id: "2",
      type: "Stock purchase",
      amount: -50,
      time: "2025-01-02T12:00:00Z",
    },
  ],
};
const market = () => ({
  provider: "Yahoo Finance",
  fetchedAt: new Date().toISOString(),
  from: days[0],
  to: days.at(-1),
  instruments: {
    "TEST.PL": {
      symbol: "TEST.WA",
      name: "Test Company",
      currency: "PLN",
      price: 80,
      priceTime: days.at(-1) + "T16:00:00Z",
      history: days.slice(3).map((day, i) => ({ day, close: 50.6 + i * 0.2 })),
      splits: [],
    },
  },
  fx: {
    PLN: { price: 1, history: [] },
    USD: {
      price: 4,
      priceTime: days.at(-1) + "T16:00:00Z",
      history: days.map((day) => ({ day, close: 4 })),
    },
    EUR: { price: 4.5, history: days.map((day) => ({ day, close: 4.5 })) },
  },
});
async function setup(page) {
  await page.addInitScript(
    (a) => localStorage.setItem("folio-v1", JSON.stringify([a])),
    account,
  );
  await page.route("**/api/market", (route) =>
    route.fulfill({ json: market() }),
  );
  await page.route("**/api/benchmarks", (route) => {
    const request = route.request().postDataJSON();
    return route.fulfill({
      json: {
        ...market(),
        instruments: Object.fromEntries(
          request.symbols.map((symbol) => [
            symbol,
            {
              symbol,
              name: symbol,
              currency: "USD",
              price: 200,
              priceTime: days.at(-1) + "T16:00:00Z",
              history: days.map((day, i) => ({
                day,
                close: 100 + (i * 100) / 119,
              })),
              splits: [],
            },
          ]),
        ),
      },
    });
  });
  await page.route("**/api/search?*", (route) =>
    route.fulfill({
      json: {
        quotes: [
          {
            symbol: "AAPL",
            name: "Apple Inc.",
            exchange: "Nasdaq",
            type: "EQUITY",
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Historia kapitału" }),
  ).toBeVisible();
}
test("chart keeps complete percentage series with labeled estimates; date range, zoom, pan and flow switches work", async ({
  page,
}) => {
  await setup(page);
  const chart = page.getByTestId("portfolio-chart");
  await chart.getByRole("button", { name: "Całość", exact: true }).click();
  await chart.getByRole("button", { name: "%", exact: true }).click();
  await expect(chart.locator(".folio-chart-summary strong")).toHaveText(
    /30,00%/,
  );
  await expect(chart.locator(".folio-chart-estimate")).toContainText("szacunk");
  await expect(chart).toHaveAttribute("data-visible-points", "120");
  const yLabel = chart.locator(".recharts-yAxis-tick-labels text").first();
  await expect(yLabel).toBeVisible();
  expect(Number(await yLabel.getAttribute("x"))).toBeGreaterThanOrEqual(0);
  expect(
    await chart.locator(".recharts-cartesian-grid-horizontal line").count(),
  ).toBeGreaterThan(0);

  await chart
    .getByRole("button", { name: "Przybliż wykres", exact: true })
    .click();
  const zoomed = Number(await chart.getAttribute("data-visible-points"));
  expect(zoomed).toBeLessThan(120);
  await chart
    .getByRole("button", { name: "Przesuń wykres w lewo", exact: true })
    .click();
  await expect(chart.getByLabel("Początek zakresu wykresu")).not.toHaveValue(
    days[0],
  );
  await chart
    .getByRole("button", { name: "Pokaż całą historię", exact: true })
    .click();
  await expect(chart).toHaveAttribute("data-visible-points", "120");
  await chart.getByLabel("Początek zakresu wykresu").fill("2025-03-01");
  await expect(chart.getByLabel("Początek zakresu wykresu")).toHaveValue(
    "2025-03-01",
  );
  await chart.getByLabel("Wpływy", { exact: true }).uncheck();
  await expect(chart.getByLabel("Wpływy", { exact: true })).not.toBeChecked();
  await chart.getByText("Rodzaje operacji (3)", { exact: true }).click();
  await chart.getByRole("button", { name: "Wszystkie typy operacji" }).click();
  await expect(
    chart.getByText("Rodzaje operacji (9)", { exact: true }),
  ).toBeVisible();
  const plot = chart.getByRole("region");
  await plot.focus();
  const before = Number(await chart.getAttribute("data-visible-points"));
  await page.keyboard.press("+");
  expect(Number(await chart.getAttribute("data-visible-points"))).toBeLessThan(
    before,
  );
});
test("benchmark presets, search, return comparison and same-cashflow simulation work", async ({
  page,
}) => {
  await setup(page);
  const chart = page.getByTestId("portfolio-chart");
  await chart.getByRole("button", { name: "Całość", exact: true }).click();
  await chart
    .getByRole("button", { name: "Dodaj benchmark", exact: true })
    .click();
  await chart.getByRole("button", { name: "+ S&P 500", exact: true }).click();
  await expect(chart.locator(".folio-benchmark-comparison")).toContainText(
    "S&P 500",
  );
  await expect(chart.locator(".folio-benchmark-comparison")).toContainText(
    "100,00%",
  );
  await chart.getByRole("button", { name: "Zmiana %", exact: true }).click();
  await expect(
    chart.getByRole("button", { name: "%", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await chart
    .getByRole("button", { name: "Te same przepływy", exact: true })
    .click();
  await expect(
    chart.getByRole("button", { name: "Kwota", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await chart.getByLabel("Wyszukaj benchmark").fill("Apple");
  await chart.getByRole("button", { name: /Apple Inc/ }).click();
  await expect(chart.locator(".folio-benchmark-comparison")).toContainText(
    "Apple Inc.",
  );
  await chart
    .getByRole("button", { name: "Usuń benchmark Apple Inc." })
    .click();
  await expect(chart.locator(".folio-benchmark-comparison")).not.toContainText(
    "Apple Inc.",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
