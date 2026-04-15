import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('route cancel via CSS', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('should cancel slow page loads on re-navigation', async () => {
    const browser = await next.browser('/')
    await waitFor(5000)

    await browser.elementByCss('#link-1').click()
    await waitFor(1000)
    await browser.elementByCss('#link-2').click()

    await retry(async () => {
      const text = await browser.elementByCss('#page-text').text()
      expect(text).toMatch(/2/)
      expect(await browser.eval('window.routeCancelled')).toBe('yes')
    })
  })
})
