import { nextTestSetup } from 'e2e-utils'

describe('parallel-routes-kebab-case-slot', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('Should render the parallel route if the slot name is not a valid JavaScript variable name', async () => {
    const browser = await next.browser('/')
    // both the page slot (children) and the parallel slot should be rendered at the root layout
    expect(await browser.elementByCss('body').text()).toContain(
      '@children rendered'
    )
    expect(await browser.elementByCss('body').text()).toContain(
      '@slot-name rendered'
    )
  })
})
