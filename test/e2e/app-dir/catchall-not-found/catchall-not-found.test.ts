import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'Catchall not-found.tsx',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('/not-found should be used when available', async () => {
      const browser = await next.browser('/missing-page')
      expect(await browser.elementByCss('p#not-found').text()).toBe('/')
    })
  }
)
