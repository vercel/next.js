import { expect, test } from '@playwright/test'

test('edits the visible profile after visiting billing', async ({ page }) => {
  await page.goto('/billing')
  await page.getByLabel('Email').fill('billing@example.com')

  await page.getByRole('link', { name: 'Profile' }).click()
  await page.getByLabel('Email').fill('profile@example.com')
  await expect(page.getByLabel('Email')).toHaveValue('profile@example.com')
  await expect(page.getByTestId('account-status').last()).toHaveText(
    'Profile ready'
  )
})
