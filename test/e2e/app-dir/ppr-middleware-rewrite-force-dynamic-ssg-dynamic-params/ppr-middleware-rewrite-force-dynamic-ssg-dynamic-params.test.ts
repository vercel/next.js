import { nextTestSetup } from 'e2e-utils'
import { expectedParams as expected } from './expected'

// TODO(NAR-423): Migrate to Cache Components.
describe.skip('ppr-middleware-rewrite-force-dynamic-generate-static-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const expectedParams = JSON.stringify(expected)

  it('should have correct dynamic params', async () => {
    // should be rewritten with /en
    const browser = await next.browser('/')
    expect(await browser.elementByCss('a').text()).toBe('Go to /1/2')

    // navigate to /1/2
    await browser.elementByCss('a').click()

    // should be rewritten with /en/1/2 with correct params
    expect(await browser.elementByCss('p').text()).toBe(expectedParams)

    // reloading the page should have the same params
    await browser.refresh()
    expect(await browser.elementByCss('p').text()).toBe(expectedParams)
  })
})
