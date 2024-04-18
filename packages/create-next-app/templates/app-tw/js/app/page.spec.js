const { test, expect } = require("next/experimental/testmode/playwright");

test("Home Page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Next.js")).toBeVisible();
});
