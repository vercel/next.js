import { NextInstance, nextTestSetup } from 'e2e-utils'
import { links, locales } from './components/page'
import glob from 'glob'
import { promisify } from 'node:util'

const globp = promisify(glob)

async function getDotNextFiles(next: NextInstance): Promise<Array<string>> {
  const files = await globp('**/.next/**/*', {
    cwd: next.testDir,
    absolute: true,
  })

  return files
}

describe('ppr-navigations incremental', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  // Skip this test in dev mode and deploy since it's not relevant.
  if (isNextDev) return it.skip('skipped in dev mode', () => {})
  if (skipped) return it.skip('skipped', () => {})

  it('can navigate between all the links and back without writing to disk', async () => {
    const before = await getDotNextFiles(next)
    const browser = await next.browser('/')

    try {
      for (const { href } of links) {
        // Find the link element for the href and click it.
        await browser.elementByCss(`a[href="${href}"]`).click()

        // Wait for that page to load.
        if (href === '/') {
          // The root page redirects to the first locale.
          await browser.waitForElementByCss(`[data-value="/${locales[0]}"]`)
        } else {
          await browser.waitForElementByCss(`[data-value="${href}"]`)
        }

        await browser.elementByCss('#dynamic')
      }
    } finally {
      await browser.close()
    }

    const after = await getDotNextFiles(next)

    // Ensure that no new files were written to disk. If this test fails, it's
    // likely that there was a change to the incremental cache or file system
    // cache that resulted in information like the ppr state not being properly
    // propagated.
    expect(after).toEqual(before)
  })
})
