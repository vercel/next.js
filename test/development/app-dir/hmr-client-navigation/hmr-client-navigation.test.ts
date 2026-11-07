import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import type * as Playwright from 'playwright'

// Regression test for https://github.com/vercel/next.js/issues/98699
//
// In Turbopack dev, HMR for a page's client components is delivered through a
// page-specific chunk list. The script that registers that chunk list (and
// sends `turbopack-subscribe`) was only emitted into the server-rendered HTML,
// so a route reached by client-side navigation never subscribed and edits to
// its client components were silently dropped until a full reload.
describe('hmr-client-navigation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    patchFileDelay: 500,
  })

  async function openWithErrorTracking(url: string) {
    const pageErrors: string[] = []
    const browser = await next.browser(url, {
      beforePageLoad(page: Playwright.Page) {
        page.on('pageerror', (error) => pageErrors.push(String(error)))
      },
    })
    return { browser, pageErrors }
  }

  async function expectHotUpdate(
    browser: Awaited<ReturnType<typeof next.browser>>,
    {
      file,
      before,
      after,
      evaluationsKey,
    }: { file: string; before: string; after: string; evaluationsKey: string }
  ) {
    // Interact with the component so the edit has client state to preserve.
    // This also proves the route hydrated, i.e. loading its chunks did not
    // hang.
    await browser.elementByCss('#increment').click()
    await retry(async () => {
      expect(await browser.elementByCss('#increment').text()).toBe('1')
    })
    expect(await browser.eval(`window.${evaluationsKey}`)).toBe(1)

    // A full reload would clear this, so it tells a hot update apart from a
    // reload fallback that would also end up showing the new text.
    await browser.eval('window.__noReload = true')

    const source = await next.readFile(file)
    await next.patchFile(file, source.replace(before, after), async () => {
      await retry(async () => {
        expect(await browser.elementByCss('#label').text()).toBe(after)
      })
      expect(await browser.eval('window.__noReload')).toBe(true)
      expect(await browser.elementByCss('#increment').text()).toBe('1')

      // Give a duplicate application of the same update the chance to land
      // before checking that the module was re-evaluated exactly once.
      // `retry` can't be used here because this asserts that something does
      // not happen.
      await waitFor(1000)
      expect(await browser.eval(`window.${evaluationsKey}`)).toBe(2)
    })
  }

  it('applies edits to a client component on a route reached by client-side navigation', async () => {
    const { browser, pageErrors } = await openWithErrorTracking('/')
    await browser.elementByCss('#home')

    await browser.elementByCss('#to-plain').click()
    await retry(async () => {
      expect(await browser.elementByCss('#label').text()).toBe(
        'plain before edit'
      )
    })

    await expectHotUpdate(browser, {
      file: 'app/plain/label.tsx',
      before: 'plain before edit',
      after: 'plain after edit',
      evaluationsKey: '__plainEvaluations',
    })
    expect(pageErrors).toEqual([])
  })

  it('applies edits to a client component on a dynamic route reached by client-side navigation', async () => {
    const { browser, pageErrors } = await openWithErrorTracking('/')
    await browser.elementByCss('#home')

    await browser.elementByCss('#to-dynamic').click()
    await retry(async () => {
      expect(await browser.elementByCss('#label').text()).toBe(
        'dynamic before edit'
      )
    })

    await expectHotUpdate(browser, {
      file: 'app/dynamic/[slug]/label.tsx',
      before: 'dynamic before edit',
      after: 'dynamic after edit',
      evaluationsKey: '__dynamicEvaluations',
    })
    expect(pageErrors).toEqual([])
  })

  it('applies edits exactly once on a route that was loaded directly', async () => {
    const { browser, pageErrors } = await openWithErrorTracking('/plain')
    await retry(async () => {
      expect(await browser.elementByCss('#label').text()).toBe(
        'plain before edit'
      )
    })

    await expectHotUpdate(browser, {
      file: 'app/plain/label.tsx',
      before: 'plain before edit',
      after: 'plain after edit',
      evaluationsKey: '__plainEvaluations',
    })
    expect(pageErrors).toEqual([])
  })
})
