import { instant } from "@next/playwright";
import { expect, test } from "@playwright/test";

test.describe("Post page (/blog/[slug])", () => {
  // Prerendered by generateStaticParams, so navigating from the list reveals it instantly.
  test("prerendered — post revealed", async ({ page }) => {
    await page.goto("/");
    const link = page.locator('main a[href^="/blog/"]').first();
    await link.waitFor({ state: "visible", timeout: 15000 });

    await instant(page, async () => {
      await link.click();
      await expect(page.locator("main h1")).toBeVisible();
    });
  });
});
