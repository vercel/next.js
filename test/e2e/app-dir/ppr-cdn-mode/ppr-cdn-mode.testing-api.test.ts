import { nextTestSetup } from 'e2e-utils'
import { instant } from '@next/playwright'
import {
  expectHydrated,
  expectNoConsoleErrors,
  openPage,
  waitForHole,
} from './ppr-cdn-mode.util'

// The Instant Navigation Testing API shares its bootstrap and hydration code
// with ppr-cdn-mode, so it has to keep working with the mode on.
// @force-gate !dev && !vercel
describe('ppr-cdn-mode with the Instant Navigation Testing API', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      PPR_CDN_MODE_TESTING_API: 'true',
    },
  })

  it('holds the hole on a full page load until the lock is released', async () => {
    const { browser, page, documents } = await openPage(next, '/partial')
    await expectHydrated(browser)
    await waitForHole(browser)

    await instant(page, async () => {
      await page.reload()
      await page.locator('#fallback').waitFor({ state: 'visible' })
      expect(await page.locator('#dynamic').count()).toBe(0)
    })

    // Releasing the lock fills the hole without another reload.
    const documentsAtUnlock = documents.length
    await page.locator('#dynamic').waitFor({ state: 'visible' })
    expect(documents).toHaveLength(documentsAtUnlock)
    await expectNoConsoleErrors(browser)
  })
})
