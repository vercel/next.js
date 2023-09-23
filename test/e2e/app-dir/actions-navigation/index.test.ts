import { createNextDescribe } from 'e2e-utils'
import { check, waitFor } from 'next-test-utils'

createNextDescribe(
  'app-dir action handling',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should handle actions correctly after navigation / redirection events', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('#middleware-redirect').click()

      expect(await browser.elementByCss('#form').text()).not.toContain(
        'Loading...'
      )

      await browser.elementByCss('#submit').click()

      await check(() => {
        return browser.elementByCss('#form').text()
      }, /Loading.../)

      // wait for 2 seconds, since the action takes a second to resolve
      await waitFor(2000)

      expect(await browser.elementByCss('#form').text()).not.toContain(
        'Loading...'
      )

      expect(await browser.elementByCss('#result').text()).toContain(
        'RESULT FROM SERVER ACTION'
      )
    })
  }
)
