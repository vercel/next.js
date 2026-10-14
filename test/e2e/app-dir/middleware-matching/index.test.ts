import { nextTestSetup } from 'e2e-utils'

describe('app dir - middleware with custom matcher', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should match /:id (without asterisk)', async () => {
    const browser = await next.browser('/chat/123')
    expect(await browser.elementByCss('p').text()).toBe('Home')
  })
})
