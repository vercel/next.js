import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('RSC binary serialization', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      'server-only': 'latest',
    },
  })
  if (skipped) return

  afterEach(async () => {
    await next.stop()
  })

  it('should correctly encode/decode binaries and hydrate', async function () {
    const browser = await next.browser('/')
    await retry(
      async () => {
        const content = await browser.elementByCss('body').text()

        return content.includes('utf8 binary: hello') &&
          content.includes('arbitrary binary: 255,0,1,2,3') &&
          content.includes('hydrated: true')
          ? 'success'
          : 'fail'
      },
      30000,
      1000
    )
  })
})
