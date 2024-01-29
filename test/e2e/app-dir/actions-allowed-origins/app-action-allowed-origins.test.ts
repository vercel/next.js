import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'
import { join } from 'path'

createNextDescribe(
  'app-dir action allowed origins',
  {
    files: join(__dirname, 'safe-origins'),
    skipDeployment: true,
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
      'server-only': 'latest',
    },
    // An arbitrary & random port.
    forcedPort: '41831',
  },
  ({ next }) => {
    it('should pass if localhost is set as a safe origin', async function () {
      const browser = await next.browser('/')

      await browser.elementByCss('button').click()

      await check(async () => {
        return await browser.elementByCss('#res').text()
      }, 'hi')
    })
  }
)
