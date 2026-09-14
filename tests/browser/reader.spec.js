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
  await page
    .locator("#import")
    .setInputFiles({
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
