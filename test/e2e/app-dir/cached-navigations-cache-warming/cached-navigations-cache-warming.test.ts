import { randomUUID } from 'node:crypto'
import { nextTestSetup } from 'e2e-utils'
import type { Page } from 'playwright'
import { createRouterAct } from 'router-act'
import { UNEXPECTED_CACHE_MISS_MESSAGE } from 'next/dist/server/use-cache/use-cache-errors'

// @force-gate prod
describe('cached-navigations-cache-warming', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // This assertion needs next start and its local server logs.
  // @force-gate start
  it('does not report cache misses for children deferred by a large render', async () => {
    const cacheKey = `server-render-${randomUUID()}`
    const outputIndex = next.cliOutput.length

    const $ = await next.render$(`/?cacheKey=${cacheKey}`)
    expect($('#content').text()).toBe(`${cacheKey}:content`)
    expect($('#dynamic-content').text()).toBe(`${cacheKey}:dynamic`)

    expect(next.cliOutput.slice(outputIndex)).not.toContain(
      UNEXPECTED_CACHE_MISS_MESSAGE
    )
  })

  it('caches outlined elements but not content behind dynamic I/O', async () => {
    const cacheKey = `client-navigation-${randomUUID()}`
    let page: Page | undefined
    const browser = await next.browser(`/?cacheKey=${cacheKey}`, {
      beforePageLoad(browserPage: Page) {
        page = browserPage
      },
    })
    if (!page) {
      throw new Error('The browser page was not initialized')
    }
    expect(await browser.elementByCss('#content:visible').text()).toBe(
      `${cacheKey}:content`
    )
    expect(await browser.elementByCss('#dynamic-content:visible').text()).toBe(
      `${cacheKey}:dynamic`
    )

    await browser.elementByCss(`a[href="/hub?cacheKey=${cacheKey}"]`).click()
    expect(await browser.elementByCss('h1').text()).toBe('Hub')
    await browser.elementByCss(`a[href="/?cacheKey=${cacheKey}"]`)

    const act = createRouterAct(page)
    await act(async () => {
      await act(
        () => browser.elementByCss(`a[href="/?cacheKey=${cacheKey}"]`).click(),
        {
          includes: 'dynamic-content',
          block: true,
        }
      )

      expect(await browser.hasElementByCss('#content:visible')).toBe(true)
      expect(await browser.elementByCss('#content:visible').text()).toBe(
        `${cacheKey}:content`
      )
      expect(
        await browser.elementByCss('#dynamic-fallback:visible').text()
      ).toBe('Loading dynamic...')
      expect(await browser.hasElementByCss('#dynamic-content:visible')).toBe(
        false
      )
    })

    expect(await browser.elementByCss('#dynamic-content:visible').text()).toBe(
      `${cacheKey}:dynamic`
    )
  })
})
