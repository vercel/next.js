import { instant } from "@next/playwright";
import { expect, test } from "@playwright/test";

test.describe("Home page (/)", () => {
  // Prerendered cached list ships in the App Shell, so a client nav reveals it instantly.
  test("app shell prefetch — post list revealed", async ({ page }) => {
    await page.goto("/blog/hello-world");
    const link = page.locator('header a[href="/"]').first();
    await link.waitFor({ state: "visible", timeout: 15000 });

    await instant(page, async () => {
      await link.click();
      await expect(
        page.locator('main a[href^="/blog/"]').first(),
      ).toBeVisible();
    });
  });
});
