import { nextTestSetup, Playwright } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { Page } from 'playwright'

describe('pages dev-full-navigation-back', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  /**
   * Counts `load` events for a single pathname. A back navigation that restores
   * the document from the browser's HTTP cache fires one; a recovery reload
   * fires a second one. Anything above 2 would be a reload loop.
   */
  function countLoads(pathname: string) {
    const state = { count: 0 }
    return {
      state,
      beforePageLoad(page: Page) {
        page.on('load', () => {
          if (new URL(page.url()).pathname === pathname) {
            state.count++
          }
        })
      },
    }
  }

  async function editFile(relativePath: string, from: string, to: string) {
    const file = join(next.testDir, relativePath)
    const content = await readFile(file, 'utf8')
    await writeFile(file, content.replace(from, to))
  }

  /**
   * `assertNoConsoleErrors` rejects warnings as well as errors, but webpack
   * legitimately warns `[Fast Refresh] performing full reload` in these tests: the
   * edited module is imported from outside the React rendering tree, which Fast
   * Refresh cannot patch in place. Whether that warning lands before or after the
   * assertion runs is a race, so tolerate it and assert on everything else.
   */
  async function assertNoUnexpectedConsoleOutput(browser: Playwright) {
    const logs = await browser.log()
    const unexpected = logs.filter(
      (log) =>
        (log.source === 'warning' &&
          !log.message.includes('[Fast Refresh] performing full reload')) ||
        (log.source === 'error' &&
          !log.message.startsWith(
            'Failed to load resource: the server responded with a status of 404'
          ))
    )

    expect(unexpected).toEqual([])
  }

  /**
   * How the two bundlers recover differs, so the tests pin each shape rather
   * than accepting either.
   *
   * Turbopack has no staleness check of its own, so recovery is the reload this
   * change adds: the HTTP-cache restore plus one reload.
   *
   * webpack never advances the server-components generation for a Pages Router
   * edit, so that reload never fires. Its existing `handleSuccess` path notices
   * the loaded bundle is behind on the first `sync` and Fast Refreshes the
   * module in place instead, which is strictly nicer — the restore's own load is
   * the only one.
   */
  const expectedLoadsAfterStaleBack = isTurbopack ? 2 : 1

  it('shows an edit after full navigation and back navigation', async () => {
    const loads = countLoads('/')
    const browser = await next.browser('/', {
      beforePageLoad: loads.beforePageLoad,
    })
    expect(await browser.elementByCss('#value').text()).toBe('Value A')

    await browser.elementByCss('#to-about').click()
    await browser.waitForElementByCss('#about')

    await editFile('pages/value.ts', 'Value A', 'Value B')
    await retry(async () => {
      const $ = await next.render$('/')
      expect($('#value').text()).toBe('Value B')
    })

    const loadsBeforeBack = loads.state.count

    await browser.back({ waitUntil: 'commit' })
    await retry(async () => {
      expect(await browser.elementByCss('#value').text()).toBe('Value B')
    })

    // Whatever the recovery shape, it settles: a reloaded document is rendered
    // with the current generation, so it must not reload again.
    expect(loads.state.count - loadsBeforeBack).toBe(
      expectedLoadsAfterStaleBack
    )
    await new Promise((resolve) => setTimeout(resolve, 2000))
    expect(loads.state.count - loadsBeforeBack).toBe(
      expectedLoadsAfterStaleBack
    )

    await assertNoUnexpectedConsoleOutput(browser)
  })

  it('does not reload on back navigation when the code did not change', async () => {
    const outputIndex = next.cliOutput.length
    const loads = countLoads('/stable')
    const browser = await next.browser('/stable', {
      beforePageLoad: loads.beforePageLoad,
    })
    expect(await browser.elementByCss('#stable-value').text()).toBe('Stable A')

    await browser.elementByCss('#to-about').click()
    await browser.waitForElementByCss('#about')

    const loadsBeforeBack = loads.state.count

    await browser.back({ waitUntil: 'commit' })
    await retry(async () => {
      expect(await browser.elementByCss('#stable-value').text()).toBe(
        'Stable A'
      )
    })

    // Give a reload time to happen if it were going to.
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // The document was restored from the browser's HTTP cache and must be left
    // alone: only the restore's own load event, and no second request for it.
    expect(loads.state.count - loadsBeforeBack).toBe(1)
    const requests = next.cliOutput
      .slice(outputIndex)
      .match(/GET \/stable(?:\s|\?)/g)
    expect(requests).toHaveLength(1)

    // Fast Refresh still applies an edit in place, without a reload.
    await editFile('pages/stable-value.ts', 'Stable A', 'Stable B')
    await retry(async () => {
      expect(await browser.elementByCss('#stable-value').text()).toBe(
        'Stable B'
      )
    })
    expect(loads.state.count - loadsBeforeBack).toBe(1)

    await assertNoUnexpectedConsoleOutput(browser)
  })

  // A render in the edge runtime is rebuilt from HTTP data alone, so the
  // generation reaches it through a sandbox global rather than request metadata.
  it('shows an edit to a page rendered in the edge runtime after full navigation and back navigation', async () => {
    const loads = countLoads('/edge')
    const browser = await next.browser('/edge', {
      beforePageLoad: loads.beforePageLoad,
    })
    expect(await browser.elementByCss('#edge-value').text()).toBe('Edge A')

    await browser.elementByCss('#to-about').click()
    await browser.waitForElementByCss('#about')

    await editFile('pages/edge-value.ts', 'Edge A', 'Edge B')
    await retry(async () => {
      const $ = await next.render$('/edge')
      expect($('#edge-value').text()).toBe('Edge B')
    })

    const loadsBeforeBack = loads.state.count

    await browser.back({ waitUntil: 'commit' })
    await retry(async () => {
      expect(await browser.elementByCss('#edge-value').text()).toBe('Edge B')
    })

    expect(loads.state.count - loadsBeforeBack).toBe(
      expectedLoadsAfterStaleBack
    )

    await assertNoUnexpectedConsoleOutput(browser)
  })
})
