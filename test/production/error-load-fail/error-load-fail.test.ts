import { nextTestSetup } from 'e2e-utils'
import {
  getClientBuildManifestLoaderChunkUrlPath,
  retry,
} from 'next-test-utils'

describe('Failing to load _error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('handles failing to load _error correctly', async () => {
    const chunk = getClientBuildManifestLoaderChunkUrlPath(
      next.testDir,
      '/_error'
    )

    const browser = await next.browser('/', {
      beforePageLoad(page) {
        page.route(`**/${chunk}*`, (route) => {
          route.abort('blockedbyclient')
        })
      },
    })

    await browser.eval(`window.beforeNavigate = true`)
    await browser.elementByCss('#to-broken').click()

    await retry(async () => {
      const beforeNavigate = await browser.eval('window.beforeNavigate')
      expect(beforeNavigate).toBeFalsy()
    })
  })
})
