import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'app-dir action allowed fowarding hosts',
  {
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
      'server-only': 'latest',
    },
  },
  ({ next }) => {
    it('should error if setting an invalid x-forwarded-host header', async function () {
      const browser = await next.browser('/safe-hosts')

      await browser.eval(`window.__override_forwarded_host = 'bad.com'`)
      await browser.elementByCss('button').click()

      await check(async () => {
        const t = await browser.elementByCss('#res').text()
        return t.includes('Invalid Server Actions request.') ||
          // In prod the message is hidden
          t.includes('An error occurred in the Server Components render.')
          ? 'yes'
          : 'no'
      }, 'yes')
    })

    it('should pass if using an allowed host', async function () {
      const browser = await next.browser('/safe-hosts')

      await browser.eval(`window.__override_forwarded_host = 'safe.com'`)
      await browser.elementByCss('button').click()

      await check(() => {
        return browser.elementByCss('#res').text()
      }, 'hi')
    })
  }
)
