/**
 * Activity popover state
 *
 * Based on confirmed feedback that Activity-preserved routes can retain
 * browser-managed overlays and duplicate fixed IDs across hidden and visible
 * pages. The agent must make the shared popover safe without disabling route
 * preservation or replacing the native interaction.
 */

import { chromium, expect as playwrightExpect } from '@playwright/test'
import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  buildNextApp,
  startNextServer,
} from './__agent_eval__/next-test-utils.mjs'

const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

test('keeps Cache Components enabled', () => {
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
})

test('keeps native popovers unique and closed across preserved routes', async () => {
  await buildNextApp()
  const server = await startNextServer()
  const browser = await chromium.launch({ headless: true })

  try {
    const page = await browser.newPage()
    await page.goto(`${server.url}/settings`)

    const settingsTrigger = page.getByRole('button', {
      name: 'Settings options',
    })
    await settingsTrigger.click()
    await playwrightExpect(page.locator('[popover]:popover-open')).toHaveCount(
      1
    )

    await page.getByRole('link', { name: 'Switch section' }).click()
    await page.waitForURL('**/profile')

    const popovers = page.locator('[popover]')
    await playwrightExpect(popovers).toHaveCount(2)

    const ids = await popovers.evaluateAll((elements) =>
      elements.map((element) => element.id)
    )
    const targets = await page
      .locator('[popovertarget]')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('popovertarget'))
      )

    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(targets)).toEqual(new Set(ids))
    await playwrightExpect(page.locator('[popover]:popover-open')).toHaveCount(
      0
    )

    await page.goBack({ waitUntil: 'commit' })
    await page.waitForURL('**/settings')
    await playwrightExpect(page.locator('[popover]:popover-open')).toHaveCount(
      0
    )
  } finally {
    await browser.close()
    await server.stop()
  }
}, 240_000)
