import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium, expect as browserExpect } from '@playwright/test'
import { expect, test } from 'vitest'
import {
  buildNextApp,
  startNextServer,
} from './__agent_eval__/next-test-utils.mjs'

test('keeps Cache Components enabled', () => {
  expect(readFileSync('next.config.ts', 'utf8')).toMatch(
    /cacheComponents\s*:\s*true/
  )
})

for (const mode of ['dev', 'start'] as const) {
  test(`preserves new hidden notifications and clears previous ones in ${mode}`, async () => {
    if (mode === 'start') await buildNextApp()
    const server = await startNextServer({
      mode,
      detached: true,
      logFile: join(tmpdir(), `activity-${randomUUID()}.log`),
    })
    const browser = await chromium.launch({ headless: true })
    const checks: { scenario: string; passed: boolean; error?: string }[] = []
    try {
      for (const hiddenDelivery of [false, true]) {
        const context = await browser.newContext()
        const scenario = hiddenDelivery
          ? 'new message delivered while hidden'
          : 'clear previous message on leave'
        try {
          const page = await context.newPage()
          await page.goto(`${server.url}/kept`)
          await browserExpect(page.locator('#kept-heading')).toBeVisible()
          await page.locator('#increment').click()
          await browserExpect(page.locator('#count')).toHaveText('1')
          if (!hiddenDelivery) {
            await page.locator('#set-visible').click()
            await browserExpect(page.locator('#message')).toHaveText(
              'old notification'
            )
          }
          await page.locator('#to-other').click()
          await browserExpect(page.locator('#other-heading')).toBeVisible()
          await browserExpect(page.locator('#kept-heading')).toHaveCount(1)
          if (hiddenDelivery) await page.locator('#set-message').click()
          await page.locator('#to-kept').click()
          await browserExpect(page.locator('#kept-heading')).toBeVisible()
          await browserExpect(page.locator('#message')).toHaveText(
            hiddenDelivery ? 'new notification' : '(no message)'
          )
          await browserExpect(page.locator('#count')).toHaveText('1')
          checks.push({ scenario, passed: true })
        } catch (error) {
          checks.push({ scenario, passed: false, error: String(error) })
        } finally {
          await context.close()
        }
      }
    } finally {
      await browser.close()
      await server.stop()
    }
    expect(
      checks.filter((check) => !check.passed),
      JSON.stringify(checks)
    ).toEqual([])
  }, 240_000)
}
