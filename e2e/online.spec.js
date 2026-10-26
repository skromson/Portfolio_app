import { test, expect } from "@playwright/test";
const account = {
  id: "demo",
  label: "EUR",
  currency: "EUR",
  asOf: "2025-01-02T12:00:00Z",
  warnings: [],
  holdings: [
    {
      ticker: "TEST.US",
      name: "Test Company",
      category: "STOCK",
      quantity: 2,
      value: 60,
      cost: 50,
      profit: 10,
    },
  ],
  lots: [
    {
      ticker: "TEST.US",
      quantity: 2,
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
const payload = () => ({
  fetchedAt: "2025-01-03T20:00:00Z",
  from: "2025-01-01",
  to: "2025-01-03",
  provider: "Yahoo Finance",
  instruments: {
    "TEST.US": {
      symbol: "TEST",
      name: "Test Company",
      exchange: "Test exchange",
      price: 40,
      currency: "USD",
      priceTime: "2025-01-03T20:00:00Z",
      history: [
        { day: "2025-01-02", close: 30 },
        { day: "2025-01-03", close: 40 },
      ],
      splits: [],
    },
  },
  fx: {
    PLN: { price: 1, history: [] },
    USD: {
      price: 5,
      priceTime: "2025-01-03T20:00:00Z",
      history: [
        { day: "2025-01-01", close: 3 },
        { day: "2025-01-02", close: 4 },
        { day: "2025-01-03", close: 5 },
      ],
    },
    EUR: {
      price: 4.5,
      priceTime: "2025-01-03T20:00:00Z",
      history: [
        { day: "2025-01-01", close: 4 },
        { day: "2025-01-02", close: 4 },
        { day: "2025-01-03", close: 4.5 },
      ],
    },
  },
});
async function seed(page) {
  await page.clock.install({ time: new Date("2025-01-03T20:01:00Z") });
  await page.addInitScript(
    (a) => localStorage.setItem("folio-v1", JSON.stringify([a])),
    account,
  );
}
test("online is default; updates price every minute, uses native currency, rebases percentage, preserves privacy", async ({
  page,
}) => {
  await seed(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let count = 0;
  await page.route("**/api/market", async (route) => {
    const request = route.request().postDataJSON();
    expect(request.tickers).toEqual(["TEST.US"]);
    expect(JSON.stringify(request)).not.toContain("demo");
    const d = payload();
    if (count++) d.instruments["TEST.US"].price = 50;
    await route.fulfill({ json: d });
  });
  await page.goto("/");
  await expect(page.locator(".stat-value").first()).toHaveText("625,00 zł");
  await expect(page.locator(".market-toolbar")).toContainText("co 60 s");
  await page.getByRole("button", { name: "%", exact: true }).click();
  await expect(page.locator(".chart-note")).toContainText(
    "Historyczne ceny i FX",
  );
  await page.clock.runFor(61000);
  await expect(page.locator(".stat-value").first()).toHaveText("725,00 zł");
  await page.getByLabel("Waluta widoku").selectOption("USD");
  await expect(page.locator(".stat-value").first()).toHaveText("145,00 USD");
  await page.locator("tbody tr").first().click();
  await expect(page.getByRole("dialog")).toContainText("111,11 EUR");
  await page.getByRole("button", { name: "Zamknij szczegóły" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
test("outage keeps last successful dataset with visible error; missing symbols never become zero", async ({
  page,
}) => {
  await seed(page);
  let count = 0;
  await page.route("**/api/market", (route) => {
    if (count++)
      return route.fulfill({
        status: 503,
        json: { error: "Dostawca niedostępny" },
      });
    return route.fulfill({ json: payload() });
  });
  await page.goto("/");
  await expect(page.locator(".stat-value").first()).toHaveText("625,00 zł");
  await page
    .getByRole("button", { name: "Odśwież notowania", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Dostawca niedostępny");
  await expect(page.locator(".stat-value").first()).toHaveText("625,00 zł");
});
test("missing quote offers symbol settings and offline mode without presenting a fabricated live value", async ({
  page,
}) => {
  await seed(page);
  await page.route("**/api/market", (route) => {
    const d = payload();
    d.instruments["TEST.US"] = { error: "Brak symbolu" };
    return route.fulfill({ json: d });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Brak pełnej wyceny online" }),
  ).toBeVisible();
  await expect(page.locator(".stat-value")).toHaveCount(0);
  await page.getByRole("button", { name: "Symbole i ustawienia" }).click();
  await expect(page.getByLabel("Symbol dla TEST.US")).toBeVisible();
  await page.getByRole("button", { name: "Zamknij", exact: true }).click();
  await page.getByLabel("Waluta widoku").selectOption("EUR");
  await page
    .getByRole("button", { name: "Raport / koszt historyczny", exact: true })
    .click();
  await expect(page.locator(".stat-value").first()).toHaveText("110,00 EUR");
});
