import { join } from 'path'
import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'asset-prefix',
  {
    files: join(__dirname, 'fixture'),
  },
  ({ next }) => {
    it('should load the app properly without reloading', async () => {
      const browser = await next.browser('/')
      await browser.eval(`window.__v = 1`)

      expect(await browser.elementByCss('div').text()).toBe('Hello World')

      await check(async () => {
        const logs = await browser.log()
        const hasError = logs.some((log) =>
          log.message.includes('Failed to fetch')
        )
        return hasError ? 'error' : 'success'
      }, 'success')

      expect(await browser.eval(`window.__v`)).toBe(1)
    })
  }
)
