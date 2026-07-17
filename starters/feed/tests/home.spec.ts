import { instant } from "@next/playwright";
import { expect, test } from "@playwright/test";

test.describe("Feed (/)", () => {
  // The composer is in the static shell, so the feed commits instantly while the posts stream in.
  test("shell commits instantly", async ({ page }) => {
    await page.goto("/?page=2");

    await instant(page, async () => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Post" })).toBeVisible();
    });
  });
});
