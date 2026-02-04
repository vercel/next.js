import { nextTestSetup } from 'e2e-utils'

describe('catchall-specificity', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should match the generic catchall correctly', async () => {
    const browser = await next.browser('/foo')

    expect(await browser.elementByCss('body').text()).toContain('Generic Page')
  })

  it('should match the specific catchall correctly', async () => {
    const browser = await next.browser('/specific')

    expect(await browser.elementByCss('body').text()).toContain('Specific Page')
  })
})
