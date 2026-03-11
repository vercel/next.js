import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('interception-dynamic-segment-middleware', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work when interception route is paired with a dynamic segment & middleware', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('[href="/foo/p/1"]').click()
    await retry(async () => {
      expect(await browser.elementById('modal').text()).toMatch(/intercepted/)
    })
    await browser.refresh()
    await retry(async () => {
      expect(await browser.elementById('modal').text()).toBe('default')
    })
    await retry(async () => {
      expect(await browser.elementById('children').text()).toMatch(
        /not intercepted/
      )
    })
  })

  it('should intercept with back/forward navigation with middleware', async () => {
    // Test that interception works correctly with middleware and browser navigation
    const browser = await next.browser('/')

    // Navigate with interception
    await browser.elementByCss('[href="/foo/p/1"]').click()
    await retry(async () => {
      expect(await browser.elementById('modal').text()).toMatch(/intercepted/)
    })

    // Go back to root
    await browser.back()
    await retry(async () => {
      const url = await browser.url()
      expect(url).toContain('/')
    })

    // Go forward - should show intercepted version
    await browser.forward()
    await retry(async () => {
      expect(await browser.elementById('modal').text()).toMatch(/intercepted/)
    })
  })

  it('should intercept multiple times with middleware active', async () => {
    // Test that repeated interception works when middleware is involved
    const browser = await next.browser('/')

    for (let i = 0; i < 2; i++) {
      await browser.elementByCss('[href="/foo/p/1"]').click()
      await retry(async () => {
        expect(await browser.elementById('modal').text()).toMatch(/intercepted/)
      })

      await browser.back()
      await retry(async () => {
        const url = await browser.url()
        expect(url).toMatch(/\/$/)
      })
    }
  })
})
