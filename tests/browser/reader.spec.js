import { test, expect } from "@playwright/test";
test("built Pages reader loads at project subpath with no external requests", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const external = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:4174/")) external.push(r.url());
  });
  await page.goto("http://127.0.0.1:4174/macronic/prototype/");
  await expect(page.locator("#reading")).toContainText(
    "In a castle of Westphalia",
  );
  await expect(page.locator(".word")).toHaveCount(0);
  await page.getByRole("button", { name: "More French", exact: true }).click();
  expect(await page.locator(".word").count()).toBeGreaterThan(0);
  const first = page.locator(".word").first();
  await first.focus();
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await first.click();
  await expect(first).toHaveAttribute("aria-expanded", "true");
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("corrupt reader data has an explicit error state", async ({ page }) => {
  await page.route("**/reader.json", (route) =>
    route.fulfill({ body: "{}", contentType: "application/json" }),
  );
  await page.goto("/src/reader/");
  await expect(page.locator("#status")).toContainText("could not be loaded");
});
test("workshop exports rejection, imports it and rejects stale files", async ({
  page,
}) => {
  await page.goto("/src/review/");
  await expect(page.locator("#message")).toContainText(
    "Automatic alignments loaded",
  );
  await page
    .locator(".link-row button")
    .filter({ hasText: "castle" })
    .first()
    .click();
  await page.locator("#editor").fill("Browser test");
  await page.locator("#note").fill("Regression test rejection");
  await page.locator("#decision").selectOption("rejected");
  await page.locator("#safe").uncheck();
  await page.locator("#save").click();
  await expect(page.locator("#message")).toContainText(
    "Session correction saved",
  );
  const download = page.waitForEvent("download");
  await page.locator("#export").click();
  const file = await (await download).path();
  await page.locator("#import").setInputFiles(file);
  await expect(page.locator("#message")).toContainText("imported");
  await page.locator("#import").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        schema_version: 1,
        base_fingerprint: "stale",
        operations: [],
      }),
    ),
  });
  await expect(page.locator("#message")).toContainText("Stale");
});
test("mobile reader fits viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/src/reader/");
  await expect(page.locator("#reading")).toContainText("castle");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("chapter navigation reaches ending and retains selected density", async ({
  page,
}) => {
  await page.goto("/src/reader/");
  await expect(page.locator("#page-status")).toContainText("Section 1 of 4");
  await expect(page.locator("#previous")).toBeDisabled();
  await page.getByRole("button", { name: "More French", exact: true }).click();
  await page.locator("#gradual").uncheck();
  for (let i = 0; i < 3; i++) await page.locator("#next").click();
  await expect(page.locator("#reading")).toContainText("all possible");
  await expect(page.locator("#next")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "More French", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator("#previous").click();
  await expect(page.locator("#page-status")).toContainText("Section 3 of 4");
});
test("workshop reading export opens in separate reader", async ({ page }) => {
  await page.goto("/src/review/");
  await expect(page.locator("#message")).toContainText(
    "Automatic alignments loaded",
  );
  const pending = page.waitForEvent("download");
  await page.locator("#export-reader").click();
  const file = await (await pending).path();
  await page.goto("/src/reader/");
  await page.locator("#import-reader").setInputFiles(file);
  await expect(page.locator("#import-status")).toContainText(
    "Reading file opened",
  );
  await expect(page.locator("#page-status")).toContainText("Section 1 of 4");
});

test("phone controls stay inside viewport after scrolling, progression caps and toggle works", async ({
  page,
}) => {
  // A long reading fixture exercises the cap beyond this short chapter's four sections.
  const fs = await import("node:fs/promises");
  const bundle = JSON.parse(
    await fs.readFile("data/reader/reader.json", "utf8"),
  );
  bundle.passages.forEach((p) => {
    p.text += " Context".repeat(170);
    p.sentences = [];
  });
  await page.route("**/reader.json", (route) =>
    route.fulfill({ json: bundle }),
  );
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/src/reader/");
  await expect(page.locator("#levels button")).toHaveCount(6);
  const visible = async () => {
    for (const id of ["previous", "next"]) {
      const b = await page.locator("#" + id).boundingBox();
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(360);
      expect(b.y + b.height).toBeLessThanOrEqual(640);
    }
  };
  await visible();
  for (let i = 0; i < 3; i++) await page.locator("#next").click();
  await expect(page.locator('[data-stage="1"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await visible();
  await page.locator("#gradual").uncheck();
  for (let i = 0; i < 3; i++) await page.locator("#next").click();
  await expect(page.locator('[data-stage="1"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#gradual").check();
  for (let i = 0; i < 12; i++) await page.locator("#next").click();
  await expect(page.locator('[data-stage="4"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await visible();
  await page.locator('[data-stage="5"]').click();
  await expect(page.locator("#reading p").first()).toHaveAttribute(
    "lang",
    "fr",
  );
  await page.locator("#next").click();
  await expect(page.locator('[data-stage="5"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
test("Yiddish file uses language-aware labels, checkbox and RTL text", async ({
  page,
}) => {
  const fs = await import("node:fs/promises");
  const r = JSON.parse(await fs.readFile("data/reader/reader.json", "utf8"));
  r.languages = { base: "en", learning: "yi" };
  r.title = "RTL fixture";
  r.passages = [
    {
      id: "yi1",
      text: "Test",
      translation: "טעסט",
      replacements: [],
      sentences: [],
    },
  ];
  await page.goto("/src/reader/");
  await page.locator("#import-reader").setInputFiles({
    name: "yiddish.reader.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(r)),
  });
  await expect(
    page.getByRole("button", { name: "Even more Yiddish", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#gradual-label")).toContainText(
    "Gradually add more Yiddish",
  );
  await page.getByRole("button", { name: "Yiddish", exact: true }).click();
  await expect(page.locator("#reading p")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("#reading")).toContainText("טעסט");
});
test("whole sentence appears only from So much and can be excluded in workshop", async ({
  page,
}) => {
  await page.goto("/src/review/");
  await page.locator("#passage").selectOption("17");
  await page.locator("#stage").selectOption("3");
  await expect(page.locator("#preview .sentence")).toHaveCount(0);
  await page.locator("#stage").selectOption("4");
  await expect(page.locator("#preview .sentence")).toHaveCount(1);
  await page.locator("#editor").fill("Browser tester");
  await page.locator("#note").fill("Checking exclusion round trip");
  await page.getByText("Whole sentence at “So much”", { exact: true }).click();
  await page.locator("#sentence-reject").click();
  await expect(page.locator("#preview .sentence")).toHaveCount(0);
});

test("guide is linked from reader and hosted preparation explains local worker", async ({
  page,
}) => {
  await page.goto("/src/reader/");
  await page
    .getByRole("link", { name: "How Macronic works · Beginner’s guide" })
    .click();
  await expect(
    page.getByRole("heading", { name: "From two texts to a bilingual reader" }),
  ).toBeVisible();
  await page.goto("/src/prepare/");
  await expect(page.locator("#connection")).toContainText(
    "This hosted page cannot run the Python models",
  );
  await expect(page.locator("#inputs")).toBeDisabled();
});
