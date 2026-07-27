import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import {
  getClientBuildManifestLoaderChunkUrlPath,
  retry,
} from 'next-test-utils'

describe('Link ref forwarding', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function noError(pathname: string) {
    const browser = await next.browser('/')
    await browser.eval(`(function() {
      window.caughtErrors = []
      const origError = window.console.error
      window.console.error = function (format) {
        window.caughtErrors.push(format)
        origError(arguments)
      }
      window.next.router.replace('${pathname}')
    })()`)
    await retry(async () => {
      const errors = await browser.eval(`window.caughtErrors`)
      expect(errors).toEqual([])
    })
    await browser.close()
  }

  async function didPrefetch(pathname: string) {
    const browser = await next.browser(pathname)
    const chunk = getClientBuildManifestLoaderChunkUrlPath(next.testDir, '/')

    await retry(async () => {
      const links = await browser.elementsByCss('link[rel=prefetch]')
      const hrefs = await Promise.all(
        links.map((link) => link.getAttribute('href'))
      )
      // Same as integration: prefetch hrefs must include the client build manifest loader chunk for `/`.
      expect(hrefs).toEqual(
        expect.arrayContaining([expect.stringContaining(chunk)])
      )
    })

    await browser.close()
  }

  function runCommonTests() {
    it('should not have a race condition with a click handler', async () => {
      const browser = await next.browser('/click-away-race-condition')
      await browser.elementByCss('#click-me').click()
      await browser.waitForElementByCss('#the-menu')
    })
  }

  ;(isNextDev ? describe : describe.skip)('development mode', () => {
    runCommonTests()

    it('should not show error for function component with forwardRef', async () => {
      await noError('/function')
    })

    it('should not show error for class component as child of next/link', async () => {
      await noError('/class')
    })

    it('should handle child ref with React.createRef', async () => {
      await noError('/child-ref')
    })

    it('should handle child ref that is a function', async () => {
      await noError('/child-ref-func')
    })

    it('should handle child ref that is a function that returns a cleanup function', async () => {
      await noError('/child-ref-func-cleanup')
    })
  })
  ;(isNextStart ? describe : describe.skip)('production mode', () => {
    runCommonTests()

    it('should preload with forwardRef', async () => {
      await didPrefetch('/function')
    })

    it('should preload with child ref with React.createRef', async () => {
      await didPrefetch('/child-ref')
    })

    it('should preload with child ref with function', async () => {
      await didPrefetch('/child-ref-func')
    })

    it('should preload with child ref with function that returns a cleanup function', async () => {
      await didPrefetch('/child-ref-func-cleanup')
    })
  })
})
