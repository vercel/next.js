import { nextTestSetup } from 'e2e-utils'

describe('rewrites destination query', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should contain all values passed in param as array', async () => {
    const browser = await next.browser('/some-page')
    expect(await browser.elementByCss('#items').text()).toBe('1,2')
  })
})
