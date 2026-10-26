import { test, expect } from "@playwright/test";
import fs from "node:fs";
import {
  parseWorkbook,
  inferRates,
  portfolio,
  stats,
} from "../src/portfolio.js";
const formatPLN = (value) =>
  new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: "always",
  }).format(value) + " zł";
const hasReports = fs.existsSync("public/local-reports/manifest.json");
test("empty state, invalid import and responsive layout", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Twoje inwestycje mają nowy dom." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Importuj raport" }).click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "invalid.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("invalid"),
    });
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Zamknij", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("imports actual reports, handles account selection, navigation, persistence and duplicate imports", async ({
  page,
}) => {
  test.skip(!hasReports, "User reports are local-only fixtures.");
  const files = fs
    .readdirSync("public/local-reports")
    .filter((name) => name.endsWith(".xlsx"));
  const accounts = await Promise.all(
    files.map((name) =>
      parseWorkbook(fs.readFileSync("public/local-reports/" + name), name),
    ),
  );
  const totals = portfolio(accounts, inferRates(accounts)).totals;
  const ikeStats = stats(accounts.find((a) => a.label === "IKE"));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/market", (route) =>
    route.fulfill({ status: 503, json: { error: "Offline test" } }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Wczytaj cztery załączone raporty" })
    .click();
  await page
    .getByRole("button", { name: "Raport / koszt historyczny", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Historia kapitału" }),
  ).toBeVisible();
  await expect(page.locator(".account-chip")).toHaveCount(4);
  await expect(page.locator(".stat-value").first()).toHaveText(
    formatPLN(totals.value),
  );
  await page.getByRole("button", { name: "Ceny CSV", exact: true }).click();
  await expect(page.locator(".market-warning")).toContainText(
    "Dodaj notowania CSV",
  );
  await page
    .getByRole("button", { name: "Raport / koszt historyczny", exact: true })
    .click();
  await page.getByRole("button", { name: "%", exact: true }).click();
  await expect(page.locator(".chart-note")).toContainText(
    "To nie jest rynkowa stopa zwrotu",
  );
  await page.getByRole("button", { name: "Odznacz wszystkie" }).click();
  await expect(
    page.getByText("Wybierz przynajmniej jedno konto powyżej."),
  ).toBeVisible();
  await page.getByRole("button", { name: /Konto IKE/ }).click();
  await expect(page.locator(".stat-value").first()).toHaveText(
    formatPLN(ikeStats.assets + ikeStats.cash),
  );
  await page.getByRole("button", { name: "Zaznacz wszystkie" }).click();
  await page.getByRole("button", { name: "Operacje", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(20);
  await page
    .getByRole("button", { name: "Wpłaty i wypłaty", exact: true })
    .click();
  await expect(page.locator("tbody")).not.toContainText("Zakup akcji");
  await page.getByRole("button", { name: "Spółki", exact: true }).click();
  await expect(page.locator(".company-card")).toHaveCount(11);
  await page.locator(".company-card").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Zamknij szczegóły" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Raport / koszt historyczny", exact: true })
    .click();
  await expect(page.locator(".account-chip")).toHaveCount(4);
  await page.getByRole("button", { name: "Importuj raport" }).click();
  await page
    .getByRole("button", { name: "Wczytaj cztery załączone raporty" })
    .click();
  await expect(page.locator(".account-chip")).toHaveCount(4);
  await page.getByRole("button", { name: "Aktywa 11" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(11);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "/tmp/folio-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
