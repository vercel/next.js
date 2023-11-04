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
      const userLogs = logs.filter(
        (log) => log.source === 'log' && log.message.match(/logged \d times/)
      )
      expect(userLogs.length).toBe(2)
      userLogs.forEach((log, i) => {
        expect(log.message).toBe(`logged ${i + 1} times`)
      })
    })
  }
)
