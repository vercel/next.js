import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - parallel routes missing slot',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should only render the children slot when the custom slot is missing', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('body').text()).toBe(
        '@children rendered'
      )
      expect(await browser.hasElementByCssSelector('#children-slot')).toBe(true)
    })
  }
)
