import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('RSC binary serialization', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      react: '19.0.0-beta-04b058868c-20240508',
      'react-dom': '19.0.0-beta-04b058868c-20240508',
      'server-only': 'latest',
    },
  })
  if (skipped) return

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
