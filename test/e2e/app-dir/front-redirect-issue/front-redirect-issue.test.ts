import { nextTestSetup } from 'e2e-utils'

describe('app dir - front redirect issue', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should redirect', async () => {
    const browser = await next.browser('/vercel-user')
    expect(
      await browser.waitForElementByCss('#home-page').elementByCss('h1').text()
    ).toBe('Hello!')
    expect(await browser.url()).toBe(`${next.url}/vercel-user`)
  })
})
