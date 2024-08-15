import { nextTestSetup } from 'e2e-utils'

describe('standalone mode - no app routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should handle pages rendering correctly', async () => {
    const browser = await next.browser('/hello')
    expect(await browser.elementByCss('#index').text()).toBe('index-page')
  })
})
