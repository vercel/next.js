import { instant } from "@next/playwright";
import { expect, test } from "@playwright/test";

test.describe("Dashboard (/)", () => {
  // The heading is in the static shell, so the page commits instantly while per-user sections stream in.
  test("shell commits instantly", async ({ page }) => {
    await page.goto("/login");

    await instant(page, async () => {
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "Overview" }),
      ).toBeVisible();
    });
  });
});
