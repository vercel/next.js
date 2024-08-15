import { nextTestSetup } from 'e2e-utils'

// This test case doesn't indicate rendering duplicate head in _document is valid,
// but it's a way to reproduce the performance mark crashing.
describe('pages performance mark', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should render the page correctly without crashing with performance mark', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('h1').text()).toBe('home')
  })
})
