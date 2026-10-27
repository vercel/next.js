import { expect, test } from '@playwright/test'
import { instant } from '@next/playwright'

const baseURL = 'http://127.0.0.1:3010'

test('the prerendered response keeps useful deterministic UI', async ({
  request,
}) => {
  const response = await request.get(baseURL + '/activity')
  expect(response.ok()).toBe(true)
  const html = await response.text()

  expect(html).toContain('Deployment activity')
  expect(html).toContain('Production is healthy.')
  expect(html).toContain('Updated at')
  expect(html).toContain('Waiting for browser clock…')
  expect(html).toContain('Recent deployments')
  expect(html).toContain('Waiting for browser activity…')
  expect(html).toContain('Dashboard')
  expect(html).toContain('Docs')
  expect(html).toContain('Marketing')
  expect(html).toContain('Ready')
  expect(html).toContain('Building')
  expect(html).not.toContain('data-testid="live-time"')
  expect(html).not.toContain('data-testid="feed-time"')
})

test('client navigation keeps the route instant', async ({ page }) => {
  await page.goto(baseURL)

  await instant(page, async () => {
    await page.getByRole('link', { name: 'Activity' }).click()
    await expect(
      page.getByRole('heading', { name: 'Deployment activity' })
    ).toBeVisible()
    await expect(page.getByText('Production is healthy.')).toBeVisible()
  })

  await expect(page.getByTestId('live-time')).toBeVisible()
  await expect(page.getByTestId('feed-time')).toBeVisible()
})

test('the browser times update and the controls stay interactive', async ({
  page,
}) => {
  await page.goto(baseURL + '/activity')

  const clock = page.getByTestId('live-time')
  await expect(clock).toBeVisible()
  const first = Number(await clock.getAttribute('data-timestamp'))
  expect(first).toBeGreaterThan(0)

  await expect
    .poll(async () => Number(await clock.getAttribute('data-timestamp')), {
      timeout: 3000,
    })
    .toBeGreaterThan(first)

  const refresh = page.getByRole('button', { name: 'Refresh view (0)' })
  await refresh.click()
  await expect(
    page.getByRole('button', { name: 'Refresh view (1)' })
  ).toBeVisible()

  const feedTime = page.getByTestId('feed-time')
  const firstFeedTime = Number(await feedTime.getAttribute('data-timestamp'))
  await expect
    .poll(async () => Number(await feedTime.getAttribute('data-timestamp')), {
      timeout: 3000,
    })
    .toBeGreaterThan(firstFeedTime)

  await page.getByRole('button', { name: 'Show building only' }).click()
  await expect(page.getByText('Docs: Building')).toBeVisible()
  await expect(page.getByText('Dashboard: Ready')).toHaveCount(0)
  await expect(page.getByText('Marketing: Ready')).toHaveCount(0)
})
