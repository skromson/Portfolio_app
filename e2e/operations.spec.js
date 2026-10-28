import { test, expect } from "@playwright/test";
const account = {
  id: "demo",
  label: "PLN",
  currency: "PLN",
  asOf: "2025-02-04T12:00:00Z",
  warnings: [],
  holdings: [],
  lots: [],
  closed: [],
  operations: [
    { id: "1", type: "Deposit", amount: 100, time: "2025-01-01T00:00:00Z" },
    { id: "2", type: "Withdrawal", amount: -10, time: "2025-01-31T23:59:59Z" },
    { id: "3", type: "Transfer", amount: -40, time: "2025-02-01T00:00:00Z" },
    {
      id: "4",
      type: "Stock purchase",
      amount: -30,
      time: "2025-02-02T12:00:00Z",
      name: "Example",
      ticker: "TEST.US",
    },
    { id: "5", type: "Dividend", amount: 5, time: "2025-02-03T12:00:00Z" },
  ],
};
test("cash filters update native and converted sums, account selection and CSV rows", async ({
  page,
}) => {
  await page.addInitScript(
    (a) => localStorage.setItem("folio-v1", JSON.stringify([a])),
    account,
  );
  await page.route("**/api/market", (route) =>
    route.fulfill({ status: 503, json: { error: "offline test" } }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Raport / koszt historyczny", exact: true })
    .click();
  await page.getByRole("button", { name: "Operacje", exact: true }).click();
  await expect(page.locator(".operation-table-panel tbody tr")).toHaveCount(5);
  await expect(
    page
      .locator(".operation-summary-card")
      .filter({ hasText: "Saldo operacji" }),
  ).toContainText("25,00 zł");
  await page.getByLabel("Operacje od dnia").fill("2025-01-01");
  await page.getByLabel("Operacje do dnia").fill("2025-01-31");
  await expect(page.locator(".operation-table-panel tbody tr")).toHaveCount(2);
  await expect(
    page
      .locator(".operation-summary-card")
      .filter({ hasText: "Saldo operacji" }),
  ).toContainText("90,00 zł");
  await page
    .getByRole("button", { name: "Wpłaty i wypłaty", exact: true })
    .click();
  await page.getByLabel("Kierunek operacji").selectOption("outgoing");
  await expect(page.locator(".operation-table-panel tbody tr")).toHaveCount(1);
  await expect(
    page
      .locator(".operation-summary-card")
      .filter({ hasText: "Wypłaty zewnętrzne" }),
  ).toContainText("10,00 zł");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Eksport CSV" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let csv = "";
  for await (const chunk of stream) csv += chunk.toString();
  expect(csv.split("\r\n")).toHaveLength(2);
  expect(csv).toContain("Wypłata");
  expect(csv).not.toContain("Stock purchase");
  await page
    .getByRole("button", { name: "Wyczyść filtry", exact: true })
    .click();
  await expect(page.locator(".operation-table-panel tbody tr")).toHaveCount(5);
  await page.getByRole("checkbox", { name: /PLN/ }).uncheck();
  await expect(page.locator(".operation-table-panel tbody tr")).toHaveCount(0);
  await page.getByRole("checkbox", { name: /PLN/ }).check();
  await page.getByLabel("Szukaj w operacjach").fill("Example");
  await expect(page.locator(".operation-table-panel tbody tr")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
