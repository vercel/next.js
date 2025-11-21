import { nextTestSetup } from 'e2e-utils'

describe('parallel-routes-root-slot', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('Should render the root parallel route', async () => {
    const browser = await next.browser('/')
    // both the page slot (children) and the parallel slot should be rendered at the root layout
    expect(await browser.elementByCss('body').text()).toContain(
      '@children rendered'
    )
    expect(await browser.elementByCss('body').text()).toContain(
      '@slot rendered'
    )
  })
})
