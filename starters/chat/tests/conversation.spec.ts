import { instant } from "@next/playwright";
import { expect, test } from "@playwright/test";

test.describe("Conversation (/chat/[id])", () => {
  // Static shell (goto): the sidebar is cached and ships in the shell, so it commits instantly while the conversation streams in.
  test("shell commits instantly", async ({ page }) => {
    await page.goto("/");

    await instant(page, async () => {
      await page.goto("/chat/getting-started");
      await expect(page.getByRole("link", { name: "New chat" })).toBeVisible();
    });
  });

  // Runtime prefetch (client nav): allow-runtime resolves the id, so the messages are present under instant().
  test("runtime prefetch — messages revealed", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("link", { name: "Getting started" });
    await link.waitFor({ state: "visible", timeout: 15000 });

    await instant(page, async () => {
      await link.click();
      await expect(page.getByText("What is this starter?")).toBeVisible();
    });
  });
});
