import { join } from 'path'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'emotion SWC option',
  {
    files: join(__dirname, 'fixture'),
    dependencies: {
      '@emotion/cache': '^10.0.29',
      '@emotion/core': '^10.0.35',
      '@emotion/styled': '^10.0.27',
    },
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
