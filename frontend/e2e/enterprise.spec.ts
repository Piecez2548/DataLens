import { expect, test } from "@playwright/test";
import path from "node:path";

test("analyzes a real CSV with governance, rules, and signed review", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good insights/ })).toBeVisible();

  const choose = page.getByRole("button", { name: "Choose a CSV file" });
  await expect(choose).toBeDisabled();
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await expect(choose).toBeEnabled();
  await page
    .getByLabel("Upload CSV file")
    .setInputFiles(path.resolve("../samples/demo.csv"));

  await expect(page.getByText("Analysis complete")).toBeVisible();
  await expect(page.getByText("164 rows · 6 columns")).toBeVisible();

  await page.getByText("Prepare an executive report").click();
  await page.getByLabel(/Data owner/).fill("Data Operations");
  await page.getByLabel(/Data classification/).selectOption("internal");
  await page.getByLabel(/Report purpose/).fill("Release verification");
  await expect(page.getByLabel(/I am allowed to use this non-personal file/)).toBeChecked();
  await page.getByRole("button", { name: "Add report details" }).click();
  await expect(page.getByText("Details added")).toBeVisible();

  await page.getByText("Advanced checks and approval").click();
  await page.getByText("Set business rules", { exact: true }).click();
  const revenueRule = page.locator(".rule-row").filter({ hasText: "revenue" });
  await revenueRule.getByLabel("Minimum").fill("0");
  await page.getByRole("button", { name: "Check these rules" }).click();
  await expect(page.getByText("All business rules passed.")).toBeVisible();

  await page.getByRole("button", { name: "Mark as reviewed" }).click();
  await expect(page.getByText(/2 event\(s\).*analysis.reviewed/)).toBeVisible();

  await page.getByRole("button", { name: "Clear dataset" }).click();
  await expect(page.getByRole("heading", { name: /next discovery/ })).toBeVisible();
  await expect(choose).toBeDisabled();
});

test("supports a mobile browser workflow without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("link", { name: /Nexus/ })).toBeVisible();
  const choose = page.getByRole("button", { name: "Choose a CSV file" });
  await expect(choose).toBeDisabled();
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles(path.resolve("../samples/demo.csv"));
  await expect(page.getByText("164 rows · 6 columns")).toBeVisible();

  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    minButtonHeight: Math.min(
      ...Array.from(document.querySelectorAll("button")).map((button) => button.getBoundingClientRect().height),
    ),
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport);
  expect(layout.minButtonHeight).toBeGreaterThanOrEqual(44);

});
