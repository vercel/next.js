import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Handles an Error in _error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('Handles error during SSR', async () => {
    const html = await next.render('/some-404-page')
    expect(html).toMatch(/Internal Server Error/i)
  })

  it('Handles error during client transition', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a').click()
    await retry(async () => {
      const html = await browser.eval('document.body.innerHTML')
      expect(html).toMatch(/Internal Server Error/i)
    })
  })
})
