import { nextTestSetup } from 'e2e-utils'

describe('parallel-routes-dynamic-static-match', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should match dynamic parallel route for dynamic path', async () => {
    const browser = await next.browser('/test/dynamic-val')

    // The children slot should render the dynamic [testParam] page
    expect(await browser.elementById('children').text()).toContain(
      'Children: dynamic-val'
    )

    // The parallel slot should also match via [testParam]
    expect(await browser.elementById('parallel').text()).toContain(
      'Parallel: dynamic-val'
    )
  })

  it('should match dynamic parallel route for static path', async () => {
    const browser = await next.browser('/test/static')

    // The children slot should render the static page
    expect(await browser.elementById('children').text()).toContain(
      'Children: Static Page'
    )

    // The parallel slot should match via [testParam] with value "static",
    // NOT fall back to the default.
    // Bug #62656: this currently shows "Parallel: Default Fallback" instead.
    expect(await browser.elementById('parallel').text()).toContain(
      'Parallel: static'
    )
  })
})
