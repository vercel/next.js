import type * as Playwright from 'playwright'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

describe('dev Cache-Control', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('sends no-store for an app router document', async () => {
    const res = await next.fetch('/')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('sends no-store for a pages router document', async () => {
    const res = await next.fetch('/pages-route')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('keeps serving static assets from the browser cache', async () => {
    const browser = await next.browser('/')
    const assetStatusCodes: number[] = []

    browser.on('response', (response: Playwright.Response) => {
      const url = new URL(response.url())

      // The webpack dev bundler adds a `v` query to some of its own chunks to
      // bust the browser cache on every page load. Those are never cache hits
      // by design.
      if (
        url.pathname.startsWith('/_next/static/') &&
        !url.searchParams.has('v')
      ) {
        assetStatusCodes.push(response.status())
      }
    })

    // Only the responses of the second page load are of interest.
    assetStatusCodes.length = 0
    await browser.refresh()

    await retry(async () => {
      expect(assetStatusCodes.length).toBeGreaterThan(0)
    })

    // The dev server answers the revalidation of an unchanged asset with 304,
    // so the browser reuses the body from its cache instead of downloading it
    // again. `no-store` would force a full download on every page load.
    expect([...new Set(assetStatusCodes)]).toEqual([304])
  })

  // Runs last because it edits a file that the other test cases rely on.
  it('serves an edited page after a back navigation', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#value').text()).toBe('Value A')

    // A plain anchor triggers a document navigation, so the browser can keep
    // the page it navigates away from in its HTTP cache.
    await browser.elementByCss('#to-about').click()
    await browser.waitForElementByCss('#about')

    const valueFile = join(next.testDir, 'app/value.ts')
    const value = await readFile(valueFile, 'utf8')
    await writeFile(valueFile, value.replace('Value A', 'Value B'))

    // The dev server must serve the edited value before going back, so that a
    // stale page can only come from the browser.
    await retry(async () => {
      const $ = await next.render$('/')
      expect($('#value').text()).toBe('Value B')
    })

    await browser.back({ waitUntil: 'commit' })

    await retry(async () => {
      expect(await browser.elementByCss('#value').text()).toBe('Value B')
    })
  })
})
