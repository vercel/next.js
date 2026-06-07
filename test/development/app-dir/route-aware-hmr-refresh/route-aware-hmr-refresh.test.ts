import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('route-aware-hmr-refresh', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('refreshes only when the active route changed', async () => {
    const browser = await next.browser('/a')
    await retry(async () => {
      expect(await browser.elementById('marker').text()).toBe('a-initial')
    })

    await browser.elementById('to-b').click()
    await retry(async () => {
      expect(await browser.elementById('marker').text()).toBe('b-initial')
    })

    await browser.eval(() => {
      const originalFetch = window.fetch
      ;(window as any).__hmrRscRequestCount = 0
      window.fetch = (input, init) => {
        const headers = new Headers(init?.headers)
        if (headers.get('next-hmr-refresh') === '1') {
          ;(window as any).__hmrRscRequestCount++
        }
        return originalFetch(input, init)
      }
    })

    await next.patchFile('app/a/page.tsx', (source) =>
      source.replace('a-initial', 'a-updated')
    )

    const routeAHtml = await next.render('/a')
    expect(routeAHtml).toContain('a-updated')

    expect(await browser.elementById('marker').text()).toBe('b-initial')
    expect(await browser.eval(() => (window as any).__hmrRscRequestCount)).toBe(
      0
    )

    await browser.elementById('to-a').click()
    await retry(async () => {
      expect(await browser.elementById('marker').text()).toBe('a-updated')
    })
    expect(await browser.eval(() => (window as any).__hmrRscRequestCount)).toBe(
      0
    )

    await browser.elementById('to-b').click()
    await retry(async () => {
      expect(await browser.elementById('marker').text()).toBe('b-initial')
    })

    await next.patchFile('app/b/page.tsx', (source) =>
      source.replace('b-initial', 'b-updated')
    )

    await retry(async () => {
      expect(await browser.elementById('marker').text()).toBe('b-updated')
      expect(
        await browser.eval(() => (window as any).__hmrRscRequestCount)
      ).toBe(1)
    })
  })
})
