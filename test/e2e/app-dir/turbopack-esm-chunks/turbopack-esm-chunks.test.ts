import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('turbopack-esm-chunks', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  if (!isTurbopack) {
    it('skip for webpack', () => {})
    return
  }

  it('should render a page with client components', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#home-title').text()).toBe('Home')
    expect(await browser.elementByCss('#count').text()).toBe('Count: 0')
  })

  it('should support client-side interactivity', async () => {
    const browser = await next.browser('/')
    // Wrap in retry in case React hydration (async with ESM chunks) isn't
    // complete yet when the click fires.
    await retry(async () => {
      await browser.elementByCss('#increment').click()
      expect(await browser.elementByCss('#count').text()).toBe('Count: 1')
    })
    // Hydration confirmed; subsequent clicks work immediately.
    await browser.elementByCss('#increment').click()
    await retry(async () => {
      expect(await browser.elementByCss('#count').text()).toBe('Count: 2')
    })
  })

  it('should load next/dynamic components', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('#lazy-loaded').text()).toBe(
        'Lazy component loaded'
      )
    })
  })

  it('should navigate between pages', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#home-title').text()).toBe('Home')

    // Navigate to the other page
    await browser.elementByCss('#to-other').click()
    await retry(async () => {
      expect(await browser.elementByCss('#other-title').text()).toBe(
        'Other Page'
      )
    })
    expect(await browser.elementByCss('#other-content').text()).toBe(
      'This is the other page'
    )

    // Navigate back
    await browser.elementByCss('#to-home').click()
    await retry(async () => {
      expect(await browser.elementByCss('#home-title').text()).toBe('Home')
    })
  })
})
