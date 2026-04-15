import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Link ref forwarding', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
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

    await retry(async () => {
      const links = await browser.elementsByCss('link[rel=prefetch]')
      const hrefs = await Promise.all(
        links.map((link) => link.getAttribute('href'))
      )
      expect(hrefs.length).toBeGreaterThan(0)
    })

    await browser.close()
  }

  it('should not have a race condition with a click handler', async () => {
    const browser = await next.browser('/click-away-race-condition')
    await browser.elementByCss('#click-me').click()
    await browser.waitForElementByCss('#the-menu')
  })

  it('should not show error for function component with forwardRef', async () => {
    if (!isNextDev) return
    await noError('/function')
  })

  it('should not show error for class component as child of next/link', async () => {
    if (!isNextDev) return
    await noError('/class')
  })

  it('should handle child ref with React.createRef', async () => {
    if (!isNextDev) return
    await noError('/child-ref')
  })

  it('should handle child ref that is a function', async () => {
    if (!isNextDev) return
    await noError('/child-ref-func')
  })

  it('should handle child ref that is a function that returns a cleanup function', async () => {
    if (!isNextDev) return
    await noError('/child-ref-func-cleanup')
  })

  it('should preload with forwardRef', async () => {
    if (!isNextStart) return
    await didPrefetch('/function')
  })

  it('should preload with child ref with React.createRef', async () => {
    if (!isNextStart) return
    await didPrefetch('/child-ref')
  })

  it('should preload with child ref with function', async () => {
    if (!isNextStart) return
    await didPrefetch('/child-ref-func')
  })

  it('should preload with child ref with function that returns a cleanup function', async () => {
    if (!isNextStart) return
    await didPrefetch('/child-ref-func-cleanup')
  })
})
