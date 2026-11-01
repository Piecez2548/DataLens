import { expect, test } from "@playwright/test";
import path from "node:path";

test("analyzes a real CSV and checks business rules", async ({
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

  await page.getByText("Business rules", { exact: true }).click();
  const revenueRule = page.locator(".rule-row").filter({ hasText: "revenue" });
  await revenueRule.getByLabel("Minimum").fill("0");
  await page.getByRole("button", { name: "Check these rules" }).click();
  await expect(page.getByText("All business rules passed.")).toBeVisible();

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

test("has no sign-in or approval step and says when a file is ready to send", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /sign in|sign out/i })).toHaveCount(0);

  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles({
    name: "clean.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("region,amount" + String.fromCharCode(10) + "TH,10" + String.fromCharCode(10) + "US,20" + String.fromCharCode(10) + "JP,30" + String.fromCharCode(10)),
  });
  await expect(page.getByText("Analysis complete")).toBeVisible();
  await page.getByRole("button", { name: "This is correct" }).click();
  await expect(page.getByRole("heading", { name: "Ready to send" })).toBeVisible();
  await expect(page.getByText(/Mark as reviewed|Record internal approval|Data owner/)).toHaveCount(0);

  const [summary] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export summary for sharing" }).click(),
  ]);
  expect(summary.suggestedFilename()).toBe("clean-data-check.html");
});

test("tells the user to fix a file before sending it", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles({
    name: "gaps.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,team,amount" + String.fromCharCode(10) + "1,North,10" + String.fromCharCode(10) + "2,,20" + String.fromCharCode(10) + "3,South," + String.fromCharCode(10)),
  });
  await expect(page.getByRole("heading", { name: /Check before sending|Fix before sending/ })).toBeVisible();
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

  await page.getByText("Business rules", { exact: true }).click();
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

test("opens the summary for printing as PDF", async ({ page }) => {
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
  await expect(popup.getByRole("heading", { name: /Data check summary/ })).toBeVisible();
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

const messyCsv = {
  name: "messy.csv",
  mimeType: "text/csv",
  buffer: Buffer.from("id,team,amount\n1,North,10\n2,,20\n3,South,\n4,South,40\n"),
};

test("follow-ups and a saved snapshot reach someone who only has the snapshot file", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles(messyCsv);
  await expect(page.getByText("4 rows · 3 columns")).toBeVisible();

  const views = page.getByRole("navigation", { name: "Dataset views" });
  await views.getByRole("button", { name: "Issues" }).click();
  await page.getByLabel("Owner").fill("Somchai");
  await page.getByLabel("Due date").fill("2030-01-31");
  await page.getByLabel("Note").fill("Ask the branch to fill the blanks");

  const [brief] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Export summary for sharing/ }).click(),
  ]);
  await brief.saveAs("test-results/followup-brief.html");
  const html = (await import("node:fs")).readFileSync("test-results/followup-brief.html", "utf8");
  expect(html).toContain("Follow-up plan");
  expect(html).toContain("Somchai");

  const [snapshot] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save snapshot" }).click(),
  ]);
  expect(snapshot.suggestedFilename()).toBe("messy.datalens.json");
  await snapshot.saveAs("test-results/messy.datalens.json");

  await page.getByRole("button", { name: "Clear dataset" }).click();
  await page.getByLabel("Upload CSV file").setInputFiles("test-results/messy.datalens.json");
  await expect(page.getByText("Opened from a saved snapshot")).toBeVisible();
  await expect(page.getByText("4 rows · 3 columns")).toBeVisible();
  await views.getByRole("button", { name: "Issues" }).click();
  await expect(page.getByLabel("Owner")).toHaveValue("Somchai");
  await expect(page.getByLabel("Note")).toHaveValue("Ask the branch to fill the blanks");
});

test("rejects a file that is not a snapshot", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Upload CSV file").setInputFiles({
    name: "other.datalens.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"hello": 1}'),
  });
  await expect(page.getByRole("alert")).toContainText("not a DataLens snapshot");
});

test("remembers the choices made for a file name in this browser", async ({ page }) => {
  const report = {
    name: "monthly.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("po,team,amount" + String.fromCharCode(10) + "A1,North,10" + String.fromCharCode(10) + "A1,South,20" + String.fromCharCode(10)),
  };
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles(report);
  await expect(page.getByText("2 rows · 3 columns")).toBeVisible();
  await page.getByText("Dataset setup", { exact: true }).click();
  await page.locator(".key-options label").filter({ hasText: "po" }).getByRole("checkbox").check();
  await page.getByRole("button", { name: "Apply dataset setup" }).click();
  await expect(page.getByText(/1 rows repeat the business key/)).toBeVisible();

  await page.getByRole("button", { name: "Clear dataset" }).click();
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles(report);
  await expect(page.getByText("Settings from last time were applied")).toBeVisible();
  await expect(page.getByText(/1 rows repeat the business key/)).toBeVisible();

  await page.getByRole("button", { name: "Don't remember these" }).click();
  await expect(page.getByText("Settings from last time were applied")).toBeHidden();
});

test("asks whether two-digit years are Buddhist or Christian Era", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles({
    name: "short-years.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,date\n1,05/06/67\n2,25/12/67\n3,01/01/68\n"),
  });
  await expect(page.getByText("3 dates have a two-digit year")).toBeVisible();
  await page.getByRole("button", { name: /Buddhist Era/ }).click();
  await expect(page.getByText("3 dates have a two-digit year")).toBeHidden();
  await expect(page.getByText("Analysis complete")).toBeVisible();
});

test("shows every sheet of a workbook side by side", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles(path.resolve("e2e/fixtures/two-sheets.xlsx"));
  await expect(page.getByText("This workbook has 2 sheets")).toBeVisible();
  await page.getByRole("button", { name: "Analyze all sheets" }).click();
  const table = page.locator(".sheet-overview");
  await expect(table.getByRole("heading", { name: "All sheets" })).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table.getByRole("cell", { name: "Orders", exact: true })).toBeVisible();

  await page.getByLabel("Worksheet", { exact: true }).first().selectOption("Orders");
  await expect(page.getByText("4 rows · 2 columns")).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(3);
});

test("the Upload file button still works after opening a snapshot", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Orders records (JSON)" }).click();
  await expect(page.getByText("25 rows · 6 columns")).toBeVisible();
  const [snap] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save snapshot" }).click(),
  ]);
  await snap.saveAs("test-results/again.datalens.json");
  await page.getByRole("button", { name: "Clear dataset" }).click();
  await page.getByLabel("Upload CSV file").setInputFiles("test-results/again.datalens.json");
  await expect(page.getByText("Opened from a saved snapshot")).toBeVisible();
  await page.getByRole("button", { name: "Upload file" }).click();
  await expect(page.getByRole("button", { name: "Choose a CSV file" })).toBeVisible();
});

test("exports the original rows that need fixing", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles(messyCsv);
  await expect(page.getByText("4 rows · 3 columns")).toBeVisible();
  await page.getByRole("navigation", { name: "Dataset views" }).getByRole("button", { name: "Issues" }).click();
  const [workbook] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Export rows to fix/ }).click(),
  ]);
  expect(workbook.suggestedFilename()).toBe("messy-rows-to-fix.xlsx");
  await workbook.saveAs("test-results/rows-to-fix.xlsx");
});

test("compares the current file with a saved snapshot", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles(messyCsv);
  await expect(page.getByText("4 rows · 3 columns")).toBeVisible();
  const [snapshot] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save snapshot" }).click(),
  ]);
  await snapshot.saveAs("test-results/before.datalens.json");

  await page.getByLabel("Upload CSV file").setInputFiles({
    name: "messy-fixed.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,team,amount" + String.fromCharCode(10) + "1,North,10" + String.fromCharCode(10) + "2,East,20" + String.fromCharCode(10) + "3,South,30" + String.fromCharCode(10) + "4,South,40" + String.fromCharCode(10)),
  });
  await expect(page.getByText("messy-fixed.csv", { exact: true })).toBeVisible();
  await page.getByLabel("Choose a file to compare").setInputFiles("test-results/before.datalens.json");
  await expect(page.getByRole("heading", { name: /Compare|comparison/i }).first()).toBeVisible();
  await expect(page.getByText("messy.csv").first()).toBeVisible();
});

test("offers a copy without personal-data columns", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  const nl = String.fromCharCode(10);
  await page.getByLabel("Upload CSV file").setInputFiles({
    name: "people.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(["id,phone,amount", "1,0812345678,10", "2,0898765432,20", "3,0823456789,30"].join(nl) + nl),
  });
  await expect(page.getByText("Personal data was found")).toBeVisible();
  const [copy] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Download a copy without these columns/ }).click(),
  ]);
  expect(copy.suggestedFilename()).toBe("people-without-personal-columns.csv");
  await copy.saveAs("test-results/people-clean.csv");
  const text = (await import("node:fs")).readFileSync("test-results/people-clean.csv", "utf8");
  expect(text).toContain("amount");
  expect(text).not.toContain("0812345678");
});

test("analyzes a text file larger than the plain upload limit by compressing it", async ({ page }) => {
  test.setTimeout(90_000);
  const nl = String.fromCharCode(10);
  const lines = ["id,team,note,amount"];
  for (let i = 0; i < 90_000; i++) lines.push(`${i},team${i % 7},some repeated descriptive text for padding some repeated descriptive text for padding some repeated descriptive text ${i % 50},${i % 997}`);
  const big = Buffer.from(lines.join(nl) + nl);
  expect(big.length).toBeGreaterThan(10 * 1024 * 1024);
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles({ name: "big.csv", mimeType: "text/csv", buffer: big });
  await expect(page.getByText("90,000 rows · 4 columns")).toBeVisible({ timeout: 60_000 });
});

test("flags spelling variants, negative amounts and future dates before sending", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  const nl = String.fromCharCode(10);
  await page.getByLabel("Upload CSV file").setInputFiles({
    name: "orders.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      ["id,city,order_date,amount", "1,Bangkok,2024-01-05,100", "2,bangkok ,2024-01-06,-5", "3,Bangkok,2099-01-01,50", "4,Chiang Mai,2024-02-01,50"].join(nl) + nl,
    ),
  });
  await expect(page.getByText("Same value spelled differently in city")).toBeVisible();
  await expect(page.getByText("negative values in amount")).toBeVisible();
  await expect(page.getByText("in order_date are in the future")).toBeVisible();
  await page.getByRole("navigation", { name: "Dataset views" }).getByRole("button", { name: "Issues" }).click();
  await expect(page.getByRole("tab", { name: /Spelling variants/ })).toBeVisible();
});

test("the Before you send checklist answers whether a file can go out", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles(messyCsv);
  const panel = page.getByRole("region", { name: "Before you send" });
  await expect(panel.getByText("Personal data")).toBeVisible();
  await expect(panel.getByText("2 empty cells")).toBeVisible();
  await expect(panel.getByRole("button", { name: /Export rows to fix/ })).toBeVisible();
});

test("a warning can be ignored, comes back on request, and is remembered for the file name", async ({ page }) => {
  const nl = String.fromCharCode(10);
  const file = {
    name: "refunds.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(["id,amount", "1,100", "2,-20", "3,50"].join(nl) + nl),
  };
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles(file);
  await expect(page.getByRole("heading", { name: "Check before sending" })).toBeVisible();
  await page.getByRole("button", { name: "Ignore this warning" }).click();
  await expect(page.getByRole("heading", { name: "Ready to send" })).toBeVisible();
  await expect(page.getByText("1 warning(s) ignored.")).toBeVisible();

  await page.getByRole("button", { name: "Clear dataset" }).click();
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles(file);
  await expect(page.getByRole("heading", { name: "Ready to send" })).toBeVisible();

  await page.getByRole("button", { name: "Show them again" }).click();
  await expect(page.getByRole("heading", { name: "Check before sending" })).toBeVisible();
});

test("tidies exported files with an empty trailing column and repeated names", async ({ page }) => {
  const nl = String.fromCharCode(10);
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles({
    name: "export.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(["id,total,total,", "1,2,3,", "", "4,5,6,"].join(nl) + nl),
  });
  await expect(page.getByText("The file was tidied before checking")).toBeVisible();
  await expect(page.getByText(/total → total_2/)).toBeVisible();
  await expect(page.getByText("2 rows · 3 columns")).toBeVisible();
});

test("warns about a totals row left in the file", async ({ page }) => {
  const nl = String.fromCharCode(10);
  await page.goto("/");
  await page.getByLabel(/I am allowed to analyze this file/).check();
  await page.getByLabel("Upload CSV file").setInputFiles({
    name: "with-total.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(["id,team,amount", "1,a,10", "2,b,20", "3,a,30", "Total,,60"].join(nl) + nl),
  });
  await expect(page.getByText("Row 5 looks like a totals row")).toBeVisible();
  await page.getByRole("navigation", { name: "Dataset views" }).getByRole("button", { name: "Issues" }).click();
  await expect(page.getByRole("tab", { name: /Totals row/ })).toBeVisible();
});
