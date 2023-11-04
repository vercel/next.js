import { join } from 'path'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'emotion SWC option',
  {
    files: join(__dirname, 'fixture'),
  },
  ({ next }) => {
    it('should have styling from the css prop', async () => {
      const browser = await next.browser('/')

      const color = await browser
        .elementByCss('#test-element')
        .getComputedCss('background-color')
      expect(color).toBe('rgb(255, 192, 203)')
    })
  }
)
