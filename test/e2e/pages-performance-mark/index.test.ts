import { nextTestSetup } from 'e2e-utils'

// This test case doesn't indicate rendering duplicate head in _document is valid,
// but it's a way to reproduce the performance mark crashing.
// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('pages performance mark', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the page correctly without crashing with performance mark', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('h1').text()).toBe('home')
  })
})
