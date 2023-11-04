import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'standalone mode - no app routes',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should handle pages rendering correctly', async () => {
      const browser = await next.browser('/hello')
      expect(await browser.elementByCss('#index').text()).toBe('index-page')
    })
  }
)
