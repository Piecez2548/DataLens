import { expect, test } from "@playwright/test";
import path from "node:path";

test("analyzes a real CSV with governance, rules, and signed review", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good insights/ })).toBeVisible();

  const incomplete = page.getByRole("button", {
    name: "Complete required details",
  });
  await expect(incomplete).toBeDisabled();
  await page.getByLabel("Data owner").fill("Data Operations");
  await page.getByLabel("Purpose").fill("Release verification");
  await page.getByLabel(/I am authorized to process this file/).check();
  await expect(
    page.getByRole("button", { name: "Choose a CSV file" }),
  ).toBeEnabled();
  await page
    .getByLabel("Upload CSV file")
    .setInputFiles(path.resolve("../samples/demo.csv"));

  await expect(page.getByText("Analysis complete")).toBeVisible();
  await expect(page.getByText("164 rows · 6 columns")).toBeVisible();
  await expect(page.getByText("Request only")).toBeVisible();
  await expect(page.getByText("Data Operations")).toBeVisible();

  await page.getByText("Configure business validity rules").click();
  const revenueRule = page.locator(".rule-row").filter({ hasText: "revenue" });
  await revenueRule.getByLabel("Min").fill("0");
  await page.getByRole("button", { name: /Apply rules/ }).click();
  await expect(page.getByText("All configured business rules passed.")).toBeVisible();

  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByText(/2 event\(s\).*analysis.reviewed/)).toBeVisible();

  await page.getByRole("button", { name: "Clear dataset" }).click();
  await expect(page.getByRole("heading", { name: /next discovery/ })).toBeVisible();
  await expect(incomplete).toBeDisabled();
});
