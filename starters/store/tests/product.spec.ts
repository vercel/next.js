import { instant } from "@next/playwright";
import { expect, test } from "@playwright/test";

test.describe("Product page (/products/[slug])", () => {
  // Prerendered by generateStaticParams, so navigating from the grid reveals it instantly.
  test("prerendered — product revealed", async ({ page }) => {
    await page.goto("/");
    const link = page.locator('main a[href^="/products/"]').first();
    await link.waitFor({ state: "visible", timeout: 15000 });

    await instant(page, async () => {
      await link.click();
      await expect(page.locator("main h1")).toBeVisible();
    });
  });
});
