import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely controls the local Next.js build or server lifecycle.
// @force-gate !deploy
describe('RSC binary serialization', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'server-only': 'latest',
    },
  })

  afterEach(async () => {
    await next.stop()
  })

  it('should correctly encode/decode binaries and hydrate', async function () {
    const browser = await next.browser('/')
    await check(async () => {
      const content = await browser.elementByCss('body').text()

      return content.includes('utf8 binary: hello') &&
        content.includes('arbitrary binary: 255,0,1,2,3') &&
        content.includes('hydrated: true')
        ? 'success'
        : 'fail'
    }, 'success')
  })
})
