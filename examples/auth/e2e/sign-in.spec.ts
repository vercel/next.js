import { expect, test } from "@playwright/test";

const email = process.env.MOCK_EMAIL!;
const password = process.env.MOCK_PASSWORD!;

test("signs in with GitHub and out again", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in with GitHub" }).click();

  // Mockatoo's sign-in and consent pages stand in for GitHub's.
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in with password" }).click();
  await page.getByRole("button", { name: "Authorize" }).click();

  await expect(page.getByText(`Welcome ${email}`)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("You are not logged in")).toBeVisible();
});
