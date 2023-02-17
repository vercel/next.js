import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'redirect-root-layout',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should work using browser', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('p').text()).toBe('hello world')
    })
  }
)
