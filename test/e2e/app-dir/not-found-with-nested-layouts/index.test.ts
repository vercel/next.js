import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox } from 'next-test-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('app dir - not found with nested layouts', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the custom not-found page when notFound() is thrown from a page', async () => {
    const browser = await next.browser('/')
    await waitForNoRedbox(browser)
    const heading = await browser.elementByCss('h1#not-found-heading')
    expect(await heading.text()).toBe('Custom Not Found Page')
  })
})
