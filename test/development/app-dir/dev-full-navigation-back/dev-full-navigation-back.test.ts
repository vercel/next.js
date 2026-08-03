import { nextTestSetup, Playwright } from 'e2e-utils'
import { assertNoConsoleErrors, retry } from 'next-test-utils'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { Page } from 'playwright'

describe('dev-full-navigation-back', () => {
  const { next } = nextTestSetup({
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

  /**
   * The debug channel for the current document is persisted to IndexedDB from an
   * idle callback. Navigating before it commits aborts the transaction, so wait
   * for the flag the page sets once the write landed.
   */
  async function waitForDebugChannelPersisted(browser: Playwright) {
    await retry(async () => {
      expect(
        await browser.eval(() => (self as any).__NEXT_DEBUG_CHANNEL_PERSISTED)
      ).toBe(true)
    })
  }

  async function editFile(relativePath: string, from: string, to: string) {
    const file = join(next.testDir, relativePath)
    const content = await readFile(file, 'utf8')
    await writeFile(file, content.replace(from, to))
  }

  it('shows an edit after full navigation and back navigation', async () => {
    const loads = countLoads('/')
    const browser = await next.browser('/', {
      beforePageLoad: loads.beforePageLoad,
    })
    expect(await browser.elementByCss('#value').text()).toBe('Value A')

    await waitForDebugChannelPersisted(browser)

    await browser.elementByCss('#to-about').click()
    await browser.waitForElementByCss('#about')

    await editFile('app/value.ts', 'Value A', 'Value B')
    await retry(async () => {
      const $ = await next.render$('/')
      expect($('#value').text()).toBe('Value B')
    })

    const loadsBeforeBack = loads.state.count
    await browser.back({ waitUntil: 'commit' })
    await retry(async () => {
      expect(await browser.elementByCss('#value').text()).toBe('Value B')
    })

    // The back navigation restored the document from the browser's HTTP cache
    // (one load) and the recovery reloaded it once more, and it stays there —
    // the reloaded document is rendered with the current generation, so it must
    // not reload again.
    expect(loads.state.count - loadsBeforeBack).toBe(2)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    expect(loads.state.count - loadsBeforeBack).toBe(2)

    await assertNoConsoleErrors(browser)
  })

  it('runs edited client component code after full navigation and back navigation', async () => {
    const loads = countLoads('/client')
    const browser = await next.browser('/client', {
      beforePageLoad: loads.beforePageLoad,
    })
    expect(await browser.elementByCss('#server-value').text()).toBe('Client A')
    expect(await browser.elementByCss('#client-value').text()).toBe('Client A')

    await waitForDebugChannelPersisted(browser)

    await browser.elementByCss('#to-about').click()
    await browser.waitForElementByCss('#about')

    await editFile('app/client-value.ts', 'Client A', 'Client B')
    await retry(async () => {
      const $ = await next.render$('/client')
      expect($('#server-value').text()).toBe('Client B')
    })

    const loadsBeforeBack = loads.state.count

    await browser.back({ waitUntil: 'commit' })

    // The client bundle is restored from the HTTP cache too, and dev chunk URLs
    // are not content-hashed, so the client component would keep rendering the
    // old value if the page recovered by refetching data instead of reloading.
    await retry(async () => {
      expect(await browser.elementByCss('#client-value').text()).toBe(
        'Client B'
      )
    })
    expect(await browser.elementByCss('#server-value').text()).toBe('Client B')

    // Still interactive after the recovery.
    await browser.elementByCss('#increment').click()
    await retry(async () => {
      expect(await browser.elementByCss('#increment').text()).toBe('Count: 1')
    })

    expect(loads.state.count - loadsBeforeBack).toBe(2)

    await assertNoConsoleErrors(browser)
  })

  it('does not reload on back navigation when the code did not change', async () => {
    const outputIndex = next.cliOutput.length
    const loads = countLoads('/stable')
    const browser = await next.browser('/stable', {
      beforePageLoad: loads.beforePageLoad,
    })
    expect(await browser.elementByCss('#stable-value').text()).toBe('Stable A')

    await waitForDebugChannelPersisted(browser)

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
    await editFile('app/stable-value.ts', 'Stable A', 'Stable B')
    await retry(async () => {
      expect(await browser.elementByCss('#stable-value').text()).toBe(
        'Stable B'
      )
    })
    expect(loads.state.count - loadsBeforeBack).toBe(1)

    await assertNoConsoleErrors(browser)
  })

  // A render in the edge runtime is rebuilt from HTTP data alone, so the
  // generation reaches it through a sandbox global rather than request metadata.
  it('shows an edit to a page rendered in the edge runtime after full navigation and back navigation', async () => {
    const loads = countLoads('/edge')
    const browser = await next.browser('/edge', {
      beforePageLoad: loads.beforePageLoad,
    })
    expect(await browser.elementByCss('#edge-value').text()).toBe('Edge A')

    // The debug channel isn't persisted for an edge render, so there is no
    // `__NEXT_DEBUG_CHANNEL_PERSISTED` flag to await here. Recovery doesn't
    // depend on it — it is driven by the HMR socket — so just let the page
    // settle before navigating away.
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(await browser.eval('typeof self.__next_r')).toBe('string')

    await browser.elementByCss('#to-about').click()
    await browser.waitForElementByCss('#about')

    await editFile('app/edge-value.ts', 'Edge A', 'Edge B')
    await retry(async () => {
      const $ = await next.render$('/edge')
      expect($('#edge-value').text()).toBe('Edge B')
    })

    const loadsBeforeBack = loads.state.count

    await browser.back({ waitUntil: 'commit' })
    await retry(async () => {
      expect(await browser.elementByCss('#edge-value').text()).toBe('Edge B')
    })

    expect(loads.state.count - loadsBeforeBack).toBe(2)

    await assertNoConsoleErrors(browser)
  })
})
