import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - front redirect issue',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should redirect', async () => {
      const browser = await next.browser('/vercel-user')
      expect(
        await browser
          .waitForElementByCss('#home-page')
          .elementByCss('h1')
          .text()
      ).toBe('Hello!')
      expect(await browser.url()).toBe(`${next.url}/vercel-user`)
    })
  }
)
