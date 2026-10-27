import { expect, test } from '@playwright/test'
import { instant } from '@next/playwright'

const baseURL = 'http://127.0.0.1:3010'

async function expectInstantSettings(page: import('@playwright/test').Page) {
  await expect(
    page.getByRole('heading', { name: 'Acme settings' })
  ).toBeVisible()
  await expect(page.getByText('Loading viewer settings…')).toBeVisible()
  await expect(page.getByText(/visible to /)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'All projects' })).toBeVisible()
}

async function expectProjectNavigation(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'All projects' }).click()
  await expect(page).toHaveURL(`${baseURL}/projects`)
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
}

test('direct visit exposes useful settings UI immediately', async ({
  page,
}) => {
  await instant(
    page,
    async () => {
      await page.goto(`${baseURL}/projects/acme/settings`)
      await expectInstantSettings(page)
    },
    { baseURL }
  )

  await expect(page.getByText(/visible to Guest/)).toBeVisible()
  await expectProjectNavigation(page)
})

test('sibling navigation exposes the same instant UI', async ({ page }) => {
  await page.goto(`${baseURL}/projects`)

  await instant(page, async () => {
    await page.getByRole('link', { name: 'Configure Acme' }).click()
    await expectInstantSettings(page)
  })

  await expect(page.getByText(/visible to Guest/)).toBeVisible()
  await expectProjectNavigation(page)
})

test('viewer data remains request-specific', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-viewer': 'Aurora' })
  await page.goto(`${baseURL}/projects/acme/settings`)
  await expect(page.getByText(/visible to Aurora/)).toBeVisible()
})
