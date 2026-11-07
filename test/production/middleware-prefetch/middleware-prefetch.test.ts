import { nextTestSetup } from 'e2e-utils'
import {
  retry,
  getClientBuildManifestLoaderChunkUrlPath,
} from 'next-test-utils'

describe('Middleware Production Prefetch', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      MIDDLEWARE_TEST: 'asdf',
    },
  })

  it('prefetch correctly for unexistent routes', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#made-up-link').moveTo()
    await retry(async () => {
      const scripts = await browser.elementsByCss('script')
      const attrs = await Promise.all(
        scripts.map((script) => script.getAttribute('src'))
      )
      const chunk = getClientBuildManifestLoaderChunkUrlPath(
        next.testDir,
        '/ssg-page'
      )
      expect(attrs.some((src) => src && src.includes(chunk))).toBe(true)
    })
  })

  it('does not prefetch provided path if it will be rewritten', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#ssg-page-2').moveTo()
    await retry(async () => {
      const scripts = await browser.elementsByCss('script')
      const attrs = await Promise.all(
        scripts.map((script) => script.getAttribute('src'))
      )
      const chunk = getClientBuildManifestLoaderChunkUrlPath(
        next.testDir,
        '/ssg-page-2'
      )
      expect(attrs.some((src) => src && src.includes(chunk))).toBe(false)
    })
  })
})
