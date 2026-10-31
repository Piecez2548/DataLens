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
  await expect(page.getByText(/not an audit opinion, legal approval/i)).toBeVisible();

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

test("keeps product identity and the Nexus return path on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const home = page.getByRole("link", { name: "Back to Nexus All" });
  await expect(home).toBeVisible();
  await expect(home).toHaveAttribute(
    "href",
    "https://nexus-lemon-eight-32.vercel.app/projects",
  );
  await expect(page.getByRole("heading", { name: /Good insights/ })).toBeVisible();
});

test("has no sign-in step and lets anyone review and approve a clean dataset", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /sign in|sign out/i })).toHaveCount(0);
  await expect(page.getByText(/Sign in with your Nexus account/)).toHaveCount(0);

  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles({
    name: "clean.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("region,amount\nTH,10\nUS,20\nJP,30\n"),
  });
  await expect(page.getByText("Analysis complete")).toBeVisible();
  await page.getByRole("button", { name: "This is correct" }).click();
  await expect(page.getByText("Confirm how row 1 was read")).toHaveCount(0);

  await page.getByText("Prepare an executive report").click();
  await page.getByLabel(/Data owner/).fill("Data Operations");
  await page.getByLabel(/Data classification/).selectOption("internal");
  await page.getByLabel(/Report purpose/).fill("Approval check");
  await page.getByRole("button", { name: "Add report details" }).click();
  await expect(page.getByText("Details added")).toBeVisible();

  await page.getByText("Advanced checks and approval").click();
  await page.getByText("Set business rules", { exact: true }).click();
  await page.locator(".rule-row").filter({ hasText: "amount" }).getByLabel("Minimum").fill("0");
  await page.getByRole("button", { name: "Check these rules" }).click();
  await expect(page.getByText("All business rules passed.")).toBeVisible();

  await page.getByRole("button", { name: "Mark as reviewed" }).click();
  await expect(page.getByText(/2 event\(s\).*analysis.reviewed/)).toBeVisible();
  await page.getByRole("button", { name: "Record internal approval" }).click();
  await expect(page.getByText(/3 event\(s\).*analysis.approved/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Export approved brief" })).toBeVisible();
});
test("compares two files in one session", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page
    .getByLabel("Upload CSV file")
    .setInputFiles(path.resolve("../samples/demo.csv"));
  await expect(page.getByText("164 rows · 6 columns")).toBeVisible();

  await page.getByLabel("Choose a file to compare").setInputFiles({
    name: "next.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name;amount;when\nA;10;31/12/2024\nB;N/A;01/01/2025\n"),
  });
  await expect(page.getByRole("heading", { name: "Compare files" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Rows", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close comparison" }).click();
  await expect(page.getByRole("button", { name: "Compare" , exact: true })).toHaveCount(0);
});

test("applies missing markers and saves a rule template", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles({
    name: "gaps.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,amount\nA,10\nB,N/A\nC,-\nD,20\n"),
  });
  await expect(page.getByText("4 rows · 2 columns")).toBeVisible();
  await page.getByText("Dataset setup", { exact: true }).click();
  await page.getByLabel(/Treat these values as missing/).fill("N/A, -");
  await page.getByRole("button", { name: "Apply dataset setup" }).click();
  await expect(page.getByText("2 missing cells need review")).toBeVisible();

  await page.getByText("Advanced checks and approval").click();
  await page.getByText("Set business rules", { exact: true }).click();
  const rule = page.locator(".rule-row").filter({ hasText: "amount" });
  await rule.getByLabel("Minimum").fill("0");
  await page.getByLabel("Template name").fill("Amounts");
  await page.getByRole("button", { name: "Save current rules" }).click();
  await expect(page.getByText(/Saved “Amounts”/)).toBeVisible();
});

test("reads every sheet of a workbook and locates issues for export", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page
    .getByLabel("Upload CSV file")
    .setInputFiles(path.resolve("e2e/fixtures/two-sheets.xlsx"));
  await expect(page.getByText("This workbook has 2 sheets")).toBeVisible();
  await page.getByLabel("Worksheet").selectOption("Orders");
  await expect(page.getByText("4 rows · 2 columns")).toBeVisible();

  await page.getByRole("navigation", { name: "Dataset views" }).getByRole("button", { name: "Issues" }).click();
  await expect(page.getByRole("heading", { name: "Issue locations" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Blank or marked as missing" })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Export issue list \(CSV\)/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("two-sheets-issues.csv");

  const [workbook] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Export issue list \(Excel\)/ }).click(),
  ]);
  expect(workbook.suggestedFilename()).toBe("two-sheets-issues.xlsx");
  await workbook.saveAs("test-results/issues-export.xlsx");
});

test("analyzes a JSON file of records", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles({
    name: "orders.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([{ id: 1, buyer: { name: "A" } }, { id: 2, buyer: { name: "B" } }]) ),
  });
  await expect(page.getByText("2 rows · 2 columns")).toBeVisible();
  await expect(page.getByText("JSON records").first()).toBeVisible();
});

test("reads a report-style file, summarizes by group and flags repeated keys", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel(/Header row/).fill("3");
  await page.getByLabel("Upload CSV file").setInputFiles({
    name: "report.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      'Monthly report,\nprepared by finance,\npo,team,amount\nA1,North,"1,200.50"\nA2,South,฿300\nA1,North,50%\nA3,North,(100)\n',
    ),
  });
  await expect(page.getByText("4 rows · 3 columns")).toBeVisible();

  await page.getByText("Dataset setup", { exact: true }).click();
  await page.locator(".key-options label").filter({ hasText: "po" }).getByRole("checkbox").check();
  await page.getByRole("button", { name: "Apply dataset setup" }).click();
  await expect(page.getByText(/1 rows repeat the business key \(po\)/)).toBeVisible();

  const views = page.getByRole("navigation", { name: "Dataset views" });
  await views.getByRole("button", { name: "Summary" }).click();
  await page.getByLabel("Group by").selectOption("team");
  await page.getByLabel("Measure").selectOption("amount");
  await page.getByRole("button", { name: "Show summary" }).click();
  await expect(page.getByRole("cell", { name: "North", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "1,150.5" })).toBeVisible();
});

test("switches the interface and executive brief to Thai", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "เปลี่ยนเป็นภาษาไทย" }).click();
  await expect(page.getByRole("heading", { name: "การค้นพบครั้งต่อไปเริ่มที่นี่" })).toBeVisible();
  await page.getByLabel(/ฉันได้รับอนุญาตให้วิเคราะห์ไฟล์นี้/).check();
  await page.getByLabel("อัปโหลดไฟล์ CSV").setInputFiles({
    name: "gaps.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,amount\nA,10\nB,\nC,20\n"),
  });
  await expect(page.getByText("วิเคราะห์เสร็จแล้ว")).toBeVisible();
  await expect(page.getByText(/ช่องที่ว่างและต้องตรวจสอบ/)).toBeVisible();
  await page.getByRole("button", { name: "ปัญหา" }).click();
  await expect(page.getByText("ว่างหรือถูกกำหนดให้เป็นค่าว่าง")).toBeVisible();
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.getByText("Analysis complete")).toBeVisible();
});

test("opens the executive brief for printing as PDF", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page
    .getByLabel("Upload CSV file")
    .setInputFiles(path.resolve("../samples/demo.csv"));
  await expect(page.getByText("164 rows · 6 columns")).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __printed: boolean }).__printed = false;
    const original = window.open.bind(window);
    window.open = (...args) => {
      const popup = original(...args);
      if (popup) popup.print = () => ((window as unknown as { __printed: boolean }).__printed = true);
      return popup;
    };
  });
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Print / Save as PDF" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState("load");
  await expect(popup.getByRole("heading", { name: /Draft structural profile/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: boolean }).__printed)).toBe(true);
});

test("sample files demonstrate every input type without uploading anything", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Orders workbook (Excel, 2 sheets)" }).click();
  await expect(page.getByText("This workbook has 2 sheets")).toBeVisible();
  await expect(page.getByText("Row 3 looks like the column names")).toBeVisible();
  await page.getByRole("button", { name: "Use row 3 as headers" }).click();
  await expect(page.getByText("30 rows · 6 columns")).toBeVisible();

  await page.getByRole("button", { name: "Clear dataset" }).click();
  await page.getByRole("button", { name: "Thai sales (CSV)" }).click();
  await expect(page.getByText("60 rows · 5 columns")).toBeVisible();
  await page.getByRole("button", { name: "Clear dataset" }).click();
  await page.getByRole("button", { name: "Orders records (JSON)" }).click();
  await expect(page.getByText("25 rows · 6 columns")).toBeVisible();
});
