import { nextTestSetup } from 'e2e-utils'

// TODO(global-not-found): remove this test when the feature is stable
describe('global-not-found - not-present', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render default 404 when global-not-found is not defined but enabled', async () => {
    const browser = await next.browser('/does-not-exist')
    const bodyText = await browser.elementByCss('body').text()
    expect(bodyText).toBe('404\nThis page could not be found.')
  })

  it('should render custom not-found.js boundary when global-not-found is not defined but enabled', async () => {
    const browser = await next.browser('/call-not-found')
    const bodyText = await browser.elementByCss('body').text()
    const htmlLang = await browser.elementByCss('html').getAttribute('lang')
    // Render the root layout
    expect(htmlLang).toBe('en')
    // Render the not-found.js boundary
    expect(bodyText).toBe('not-found.js')
  })
})
