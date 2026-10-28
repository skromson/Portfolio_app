import { test, expect } from "@playwright/test";
const account = {
  id: "private-demo",
  label: "PLN",
  currency: "PLN",
  asOf: "2026-10-01",
  warnings: [],
  holdings: [
    {
      ticker: "TEST.US",
      name: "Test Company",
      quantity: 1,
      value: 100,
      cost: 100,
      profit: 0,
    },
    {
      ticker: "CDR.PL",
      name: "CD Projekt",
      quantity: 1,
      value: 100,
      cost: 100,
      profit: 0,
    },
  ],
  lots: [],
  closed: [],
  operations: [],
};
test("news and confirmed/estimated calendar remain available without stock quote API; company filter and safe external links work", async ({
  page,
}) => {
  await page.addInitScript(
    (a) => localStorage.setItem("folio-v1", JSON.stringify([a])),
    account,
  );
  await page.route("**/api/market", (r) =>
    r.fulfill({ status: 503, json: { error: "Quotes unavailable" } }),
  );
  await page.route("**/api/company-updates", (route) => {
    const body = route.request().postDataJSON();
    expect(body.tickers).toEqual(["CDR.PL", "TEST.US"]);
    expect(JSON.stringify(body)).not.toContain("private-demo");
    return route.fulfill({
      json: {
        fetchedAt: new Date().toISOString(),
        companies: [
          {
            ticker: "TEST.US",
            name: "Test Company",
            news: [
              {
                id: "one",
                title: "Synthetic company news",
                url: "https://example.com/news",
                publishedAt: new Date().toISOString(),
                source: "Example News",
              },
            ],
            earnings: [
              {
                date: "2027-01-15",
                status: "estimated",
                source: "Example Calendar",
                url: "https://example.com/calendar",
              },
            ],
            warnings: [],
          },
          {
            ticker: "CDR.PL",
            name: "CD Projekt",
            news: [],
            earnings: [
              {
                date: "2027-02-15",
                status: "confirmed",
                source: "Example Calendar",
                url: "https://example.com/calendar",
              },
            ],
            warnings: [],
          },
        ],
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Wiadomości i wyniki", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Najnowsze wiadomości" }),
  ).toBeVisible();
  await expect(
    page.getByText("Termin szacowany", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Potwierdzony przez źródło", { exact: true }),
  ).toBeVisible();
  const link = page.getByRole("link", { name: "Synthetic company news" });
  await expect(link).toHaveAttribute("href", "https://example.com/news");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await page.getByLabel("Filtr spółki w wiadomościach").selectOption("CDR.PL");
  await expect(link).toHaveCount(0);
  await expect(page.locator(".earnings-event")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
