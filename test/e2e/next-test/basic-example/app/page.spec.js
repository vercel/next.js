const { test, expect } = require('next/experimental/testmode/playwright')

test('home page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Home')).toBeVisible()
})
