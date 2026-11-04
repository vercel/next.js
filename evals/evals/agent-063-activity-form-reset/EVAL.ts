import { chromium, expect as browserExpect } from '@playwright/test'
import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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
  test(`preserves drafts and resets completed forms on leaving in ${mode}`, async () => {
    if (mode === 'start') await buildNextApp()
    const server = await startNextServer({
      mode,
      detached: true,
      logFile: join(tmpdir(), `activity-${randomUUID()}.log`),
    })
    const browser = await chromium.launch({ headless: true })
    try {
      for (const exit of ['link', 'back', 'done']) {
        const context = await browser.newContext()
        try {
          const page = await context.newPage()
          await page.goto(`${server.url}/about`)
          await page.getByRole('link', { name: 'Contact', exact: true }).click()
          await page.waitForURL('**/contact')
          const message = page.getByRole('textbox', { name: 'Message' })
          await message.fill('Keep my unfinished draft')
          await page.getByRole('button', { name: 'Increment' }).click()
          await browserExpect(page.getByTestId('count')).toHaveText('1')
          await page.getByRole('link', { name: 'About', exact: true }).click()
          await page.waitForURL('**/about')
          await browserExpect(page.locator('[name="message"]')).toHaveCount(1)
          await page.goBack({ waitUntil: 'commit' })
          await page.waitForURL('**/contact')
          await browserExpect(message).toHaveValue('Keep my unfinished draft')
          await page.getByRole('button', { name: 'Send', exact: true }).click()
          await browserExpect(
            page.getByText('Message sent!', { exact: true })
          ).toBeVisible()
          if (exit === 'back') await page.goBack({ waitUntil: 'commit' })
          else
            await page
              .getByRole('link', {
                name: exit === 'done' ? 'Done' : 'About',
                exact: true,
              })
              .click()
          await browserExpect(page).not.toHaveURL(/\/contact$/)
          await page.getByRole('link', { name: 'Contact', exact: true }).click()
          await page.waitForURL('**/contact')
          await browserExpect(message).toHaveValue('')
          await browserExpect(
            page.getByText('Message sent!', { exact: true })
          ).not.toBeVisible()
          await browserExpect(page.getByTestId('count')).toHaveText('1')
        } finally {
          await context.close()
        }
      }
    } finally {
      await browser.close()
      await server.stop()
    }
  }, 240_000)
}
