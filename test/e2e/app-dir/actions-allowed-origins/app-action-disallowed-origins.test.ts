import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'
import { join } from 'path'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('app-dir action disallowed origins', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'unsafe-origins'),
    dependencies: {
      'server-only': 'latest',
    },
  })

  // Origin should be localhost
  it('should error if x-forwarded-host does not match the origin', async function () {
    const browser = await next.browser('/')

    await browser.elementByCss('button').click()

    await check(async () => {
      const t = await browser.elementByCss('#res').text()
      return t.includes('Invalid Server Actions request.') ||
        // In prod the message is hidden
        t.includes('https://react.dev/errors/441')
        ? 'yes'
        : 'no'
    }, 'yes')
  })
})
