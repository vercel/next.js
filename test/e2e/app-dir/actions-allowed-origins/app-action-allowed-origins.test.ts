import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'
import { join } from 'path'

describe('app-dir action allowed origins', () => {
  const { next, skipped } = nextTestSetup({
    files: join(__dirname, 'safe-origins'),
    skipDeployment: true,
    dependencies: {
      react: '19.0.0-rc-f994737d14-20240522',
      'react-dom': '19.0.0-rc-f994737d14-20240522',
      'server-only': 'latest',
    },
    // An arbitrary & random port.
    forcedPort: 'random',
  })

  if (skipped) {
    return
  }

  it('should pass if localhost is set as a safe origin', async function () {
    const browser = await next.browser('/')

    await browser.elementByCss('button').click()

    await check(async () => {
      return await browser.elementByCss('#res').text()
    }, 'hi')
  })
})
