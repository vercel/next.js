import { join } from 'path'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'asset-prefix',
  {
    files: join(__dirname, 'asset-prefix'),
  },
  ({ next }) => {
    it('should load the app properly without reloading', async () => {
      const browser = await next.browser('/')
      await browser.eval(`window.__v = 1`)

      expect(await browser.elementByCss('div').text()).toBe('Hello World')

      expect(await browser.eval(`window.__v`)).toBe(1)
    })
  }
)
