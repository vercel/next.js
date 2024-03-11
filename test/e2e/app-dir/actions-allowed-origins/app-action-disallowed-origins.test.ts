import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'
import { join } from 'path'

createNextDescribe(
  'app-dir action disallowed origins',
  {
    files: join(__dirname, 'unsafe-origins'),
    skipDeployment: true,
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
      'server-only': 'latest',
    },
  },
  ({ next }) => {
    // Origin should be localhost
    it('should error if x-forwarded-host does not match the origin', async function () {
      const browser = await next.browser('/')

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
  }
)
