import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('app dir - global error - with catch-all route', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render catch-all route correctly', async () => {
    expect(await next.render('/en/foo')).toContain('catch-all page')
  })

  it('should render 404 page correctly', async () => {
    expect(await next.render('/en')).toContain('This page could not be found.')
  })

  it('should render global error correctly', async () => {
    const browser = await next.browser('/en/error')

    const text = await browser.elementByCss('#global-error').text()
    expect(text).toMatchInlineSnapshot(`"global-error"`)
  })
})
