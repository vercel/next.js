/**
 * Activity form reset
 *
 * Based on the reproduced development behavior where an Effect cleanup can
 * run again as Activity reveals a route. The agent must reset completed form
 * state from the user action that owns the transition while preserving drafts
 * on unrelated navigation.
 */

import { chromium, expect as playwrightExpect } from '@playwright/test'
import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { startNextServer } from './__agent_eval__/next-test-utils.mjs'

const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

test('keeps Cache Components enabled', () => {
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
})

test('preserves unrelated state and resets only when the flow completes', async () => {
  process.env.__NEXT_TEST_MODE = '1'
  const server = await startNextServer({ mode: 'dev' })
  const browser = await chromium.launch({ headless: true })

  try {
    const page = await browser.newPage()
    await page.goto(`${server.url}/contact`)
    await page.waitForFunction(
      () =>
        (globalThis as { __NEXT_HYDRATED?: boolean }).__NEXT_HYDRATED === true
    )

    const message = 'Keep this message until the flow is complete'
    await page.getByLabel('Message').fill(message)
    await page.getByRole('link', { name: 'About' }).click()
    await page.waitForURL('**/about')
    await page.goBack({ waitUntil: 'commit' })
    await page.waitForURL('**/contact')
    await playwrightExpect(page.getByLabel('Message')).toHaveValue(message)

    await page.getByRole('button', { name: 'Send' }).click()
    await playwrightExpect(page.getByText('Message sent!')).toBeVisible()

    await page.getByRole('link', { name: 'About' }).click()
    await page.waitForURL('**/about')
    await page.goBack({ waitUntil: 'commit' })
    await page.waitForURL('**/contact')
    await playwrightExpect(page.getByLabel('Message')).toHaveValue(message)
    await playwrightExpect(page.getByText('Message sent!')).toBeVisible()

    await page.getByRole('link', { name: 'Done' }).click()
    await page.waitForURL('**/inbox')
    await page.goBack({ waitUntil: 'commit' })
    await page.waitForURL('**/contact')
    await playwrightExpect(page.getByLabel('Message')).toHaveValue('')
    await playwrightExpect(page.getByText('Message sent!')).toHaveCount(0)
  } finally {
    await browser.close()
    await server.stop()
    delete process.env.__NEXT_TEST_MODE
  }
}, 180_000)
