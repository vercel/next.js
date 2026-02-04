import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('global-not-found - cache-components', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render global-not-found for 404 routes', async () => {
    await next.fetch('/does-not-exist')
    expect(next.cliOutput).not.toContain(
      'did not produce a static shell and Next.js was unable to determine a reason. This is a bug in Next.js'
    )
  })

  it('should render not-found boundary when calling notFound() in a page', async () => {
    const browser = await next.browser('/action')
    // submit form with #not-found-btn button
    await browser.elementByCss('#not-found-btn').click()

    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Global Not Found')
    })
    expect(next.cliOutput).not.toContain(
      'did not produce a static shell and Next.js was unable to determine a reason. This is a bug in Next.js'
    )
  })
})
