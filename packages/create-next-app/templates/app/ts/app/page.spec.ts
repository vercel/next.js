import { test, expect } from "next/experimental/testmode/playwright";

test("Home Page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Next.js")).toBeVisible();
});
