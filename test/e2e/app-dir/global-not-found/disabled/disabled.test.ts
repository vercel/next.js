import { nextTestSetup } from 'e2e-utils'

// TODO(global-not-found): remove this test when the feature is stable
describe('global-not-found - disabled', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not pick up global-not-found when it is disabled', async () => {
    const browser = await next.browser('/does-not-exist')
    const bodyText = await browser.elementByCss('body').text()

    // Does not contain "global-not-found" text
    expect(bodyText).toBe('404\nThis page could not be found.')
  })
})
