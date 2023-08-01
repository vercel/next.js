import { createNextDescribe } from 'e2e-utils'
import { BrowserInterface } from 'test/lib/browsers/base'

createNextDescribe(
  'Strict Mode enabled by default',
  {
    files: __dirname,
  },
  ({ next }) => {
    // Recommended for tests that need a full browser
    it('should work using browser', async () => {
      const browser: BrowserInterface = await next.browser('/')
      const logs = await browser.log()
      expect(logs.length).toBe(2)
      logs.forEach((log, i) => {
        if (log.source === 'log') {
          expect(log.message).toBe(`logged ${i + 1}`)
        }
      })
    })
  }
)
