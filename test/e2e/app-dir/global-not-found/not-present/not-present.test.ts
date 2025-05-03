import { nextTestSetup } from 'e2e-utils'

// TODO(global-not-found): remove this test when the feature is stable
describe('global-not-found - not-present', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  // TODO(global-not-found): support deployment
  if (skipped) {
    return
  }

  it('should render default 404 when global-not-found is not defined but enabled', async () => {
    const browser = await next.browser('/does-not-exist')
    const bodyText = await browser.elementByCss('body').text()
    expect(bodyText).toBe('404\nThis page could not be found.')
  })
})
