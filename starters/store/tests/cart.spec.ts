import { instant } from "@next/playwright";
import { expect, test } from "@playwright/test";

test.describe("Cart page (/cart)", () => {
  // Static shell (goto): the cart reads cookies and streams in, so it's absent under instant().
  test("static shell — cart absent", async ({ page }) => {
    await page.goto("/");

    await instant(page, async () => {
      await page.goto("/cart");
      await expect(page.getByText("Your cart is empty")).toHaveCount(0);
    });
  });

  // Client nav: cookie data is included in the prefetch, so the cart is present under instant().
  test("client nav — cart revealed", async ({ page }) => {
    await page.goto("/");
    const link = page.locator('header a[href="/cart"]').first();
    await link.waitFor({ state: "visible", timeout: 15000 });

    await instant(page, async () => {
      await link.click();
      await expect(page.getByText("Your cart is empty")).toBeVisible();
    });
  });
});
