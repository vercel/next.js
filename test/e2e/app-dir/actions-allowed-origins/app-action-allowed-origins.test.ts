import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'
import { join } from 'path'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('app-dir action allowed origins', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'safe-origins'),
    dependencies: {
      'server-only': 'latest',
    },
    // An arbitrary & random port.
    forcedPort: 'random',
  })

  it('should pass if localhost is set as a safe origin', async function () {
    const browser = await next.browser('/')

    await browser.elementByCss('button').click()

    await check(async () => {
      return await browser.elementByCss('#res').text()
    }, 'hi')
  })
})
