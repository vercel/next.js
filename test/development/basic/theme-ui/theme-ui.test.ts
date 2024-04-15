import { join } from 'path'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'theme-ui SWC option',
  {
    files: join(__dirname, 'fixture'),
    dependencies: {
      'theme-ui': '0.12.0',
    },
  },
  ({ next }) => {
    it('should have theme provided styling', async () => {
      const browser = await next.browser('/')
      const color = await browser.elementByCss('#hello').getComputedCss('color')
      expect(color).toBe('rgb(51, 51, 238)')
    })
  }
)
