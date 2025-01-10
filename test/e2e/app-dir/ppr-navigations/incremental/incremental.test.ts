import { NextInstance, nextTestSetup } from 'e2e-utils'
import { links, locales } from './components/page'
import glob from 'glob'
import { promisify } from 'node:util'
import { waitForHydration } from 'development-sandbox'
import { setTimeout } from 'node:timers/promises'

const globp = promisify(glob)

async function getDotNextFiles(next: NextInstance): Promise<Array<string>> {
  const files = await globp('**/.next/**/*', {
    cwd: next.testDir,
    absolute: true,
  })

  return files
}

describe('ppr-navigations incremental', () => {
  const { next, isNextDev, isTurbopack, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('can navigate between all the links and back without writing to disk', async () => {
    const before =
      !isNextDev && !isTurbopack && !isNextDeploy
        ? await getDotNextFiles(next)
        : []

    const browser = await next.browser('/')

    await browser.waitForIdleNetwork()
    await waitForHydration(browser)
    await setTimeout(500)

    // Add a variable to the window so we can tell if it MPA navigated. If this
    // value is still true at the end of the test, then we know that the page
    // didn't MPA navigate.
    const random = Math.random().toString(36).substring(7)
    await browser.eval(`window.random = ${JSON.stringify(random)}`)

    try {
      for (const { href } of links) {
        // Find the link element for the href and click it.
        await browser.waitForElementByCss(`a[href="${href}"]`).click()

        await browser.waitForIdleNetwork()
        await waitForHydration(browser)
        await setTimeout(500)

        // Wait for that page to load.
        if (href === '/') {
          // The root page redirects to the first locale.
          await browser.waitForElementByCss(`[data-value="/${locales[0]}"]`)
        } else {
          await browser.waitForElementByCss(`[data-value="${href}"]`)
        }

        await browser.waitForElementByCss('#dynamic', 1500)

        // Check if the page navigated.
        expect(await browser.eval(`window.random`)).toBe(random)
      }
    } finally {
      await browser.close()
    }

    if (!isNextDev && !isTurbopack && !isNextDeploy) {
      const after = await getDotNextFiles(next)

      // Ensure that no new files were written to disk. If this test fails, it's
      // likely that there was a change to the incremental cache or file system
      // cache that resulted in information like the ppr state not being properly
      // propagated.
      expect(after).toEqual(before)
    }
  })
})
