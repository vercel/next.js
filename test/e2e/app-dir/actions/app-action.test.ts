import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'app-dir action handling',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should create the server reference manifest', async () => {
      const content = await next.readFile(
        '.next/server/server-reference-manifest.json'
      )
      // Make sure it's valid JSON
      JSON.parse(content)
      expect(content.length > 0).toBeTrue()
    })

    it('should handle basic actions correctly', async () => {
      const browser = await next.browser('/server')

      const cnt = await browser.elementByCss('h1').text()
      expect(cnt).toBe('0')

      await browser.elementByCss('#inc').click()
      await check(() => browser.elementByCss('h1').text(), '1')

      await browser.elementByCss('#dec').click()
      await check(() => browser.elementByCss('h1').text(), '0')
    })
  }
)
