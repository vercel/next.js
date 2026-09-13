import { nextTestSetup } from 'e2e-utils'

describe('hash navigation', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
  })

  if (skipped) return

  it('should scroll again when navigating to the same hash', async () => {
    const browser = await next.browser('/')

    // First click
    await browser.elementByCss('#section').click()
    const firstScroll = await browser.eval(() => window.scrollY)
    expect(firstScroll).toBeGreaterThan(0)

    // Scroll back to top
    await browser.eval(() => window.scrollTo(0, 0))
    const resetScroll = await browser.eval(() => window.scrollY)
    expect(resetScroll).toBe(0)

    // Second click
    await browser.elementByCss('#section').click()
    const secondScroll = await browser.eval(() => window.scrollY)
    expect(secondScroll).toBeGreaterThan(0)
  })
})
