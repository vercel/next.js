import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('interception-segments-two-levels-above', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work when interception route is paired with segments two levels above', async () => {
    const browser = await next.browser('/foo/bar')

    await browser.elementByCss('[href="/hoge"]').click()
    await retry(async () => {
      expect(await browser.elementById('intercepted').text()).toMatch(
        /intercepted/
      )
    })
  })

  it('should intercept consistently with back/forward navigation', async () => {
    // Test that interception works correctly with browser back/forward
    const browser = await next.browser('/foo/bar')

    // Navigate with interception
    await browser.elementByCss('[href="/hoge"]').click()
    await retry(async () => {
      expect(await browser.elementById('intercepted').text()).toMatch(
        /intercepted/
      )
    })

    // Go back
    await browser.back()
    await retry(async () => {
      const url = await browser.url()
      expect(url).toContain('/foo/bar')
    })

    // Go forward - should show the intercepted version again
    await browser.forward()
    await retry(async () => {
      expect(await browser.elementById('intercepted').text()).toMatch(
        /intercepted/
      )
    })
  })

  it('should intercept multiple times from same route', async () => {
    // Test that repeated interception works
    const browser = await next.browser('/foo/bar')

    for (let i = 0; i < 2; i++) {
      await retry(async () => {
        await browser.elementByCss('[href="/hoge"]').click()
      })

      await retry(async () => {
        expect(await browser.elementById('intercepted').text()).toMatch(
          /intercepted/
        )
      })

      await browser.back()

      await retry(async () => {
        const url = await browser.url()
        expect(url).toContain('/foo/bar')

        await browser.elementByCss('[href="/hoge"]')
      })
    }
  })
})
