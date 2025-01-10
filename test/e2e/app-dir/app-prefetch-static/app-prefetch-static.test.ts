import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

describe('app-prefetch-static', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('should skip next dev', () => {})
    return
  }

  it('should correctly navigate between static & dynamic pages', async () => {
    const browser = await next.browser('/')
    // Ensure the page is prefetched
    await waitFor(1000)

    await browser.elementByCss('#static-prefetch').click()

    expect(await browser.elementByCss('#static-prefetch-page').text()).toBe(
      'Hello from Static Prefetch Page'
    )

    await browser.elementByCss('#dynamic-prefetch').click()

    expect(await browser.elementByCss('#dynamic-prefetch-page').text()).toBe(
      'Hello from Dynamic Prefetch Page'
    )

    await browser.elementByCss('#static-prefetch').click()

    expect(await browser.elementByCss('#static-prefetch-page').text()).toBe(
      'Hello from Static Prefetch Page'
    )
  })
})
