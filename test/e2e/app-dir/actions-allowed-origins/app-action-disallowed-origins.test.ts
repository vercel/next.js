import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'
import { join } from 'path'

describe('app-dir action disallowed origins', () => {
  const { next, skipped } = nextTestSetup({
    files: join(__dirname, 'unsafe-origins'),
    skipDeployment: true,
    dependencies: {
      'server-only': 'latest',
    },
  })

  if (skipped) {
    return
  }

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
})
