import { expect, test } from '@playwright/test'

test('opens the reports page', async ({ page }) => {
  await page.goto('/reports')
  await expect(
    page.getByRole('heading', { name: 'Quarterly report' })
  ).toBeVisible()
})
