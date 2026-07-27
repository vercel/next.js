import { nextTestSetup } from 'e2e-utils'

describe('app dir - middleware with custom matcher', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should match /:id (without asterisk)', async () => {
    const browser = await next.browser('/chat/123')
    expect(await browser.elementByCss('p').text()).toBe('Home')
  })
})
