import { nextTestSetup, isNextDev } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Auto Export', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('Supports commonjs 1', async () => {
    const browser = await next.browser('/commonjs1')
    const html = await browser.eval('document.body.innerHTML')
    expect(html).toMatch(/test1/)
    expect(html).toMatch(/nextExport/)
  })

  it('Supports commonjs 2', async () => {
    const browser = await next.browser('/commonjs2')
    const html = await browser.eval('document.body.innerHTML')
    expect(html).toMatch(/test2/)
    expect(html).toMatch(/nextExport/)
  })

  it('Refreshes query on mount', async () => {
    const browser = await next.browser('/post-1')
    await retry(async () => {
      const html = await browser.eval('document.body.innerHTML')
      expect(html).toMatch(/post.*post-1/)
    })
    const html = await browser.eval('document.body.innerHTML')
    expect(html).toMatch(/nextExport/)
  })

  it('should update asPath after mount', async () => {
    const browser = await next.browser('/zeit/cmnt-2')
    await retry(async () => {
      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).toMatch(/\/zeit\/cmnt-2/)
    })
  })

  it('should not replace URL with page name while asPath is delayed', async () => {
    const browser = await next.browser('/zeit/cmnt-1')
    const val = await browser.eval(`!!window.pathnames.find(function(p) {
      return p !== '/zeit/cmnt-1'
    })`)
    expect(val).toBe(false)
  })

  if (isNextDev) {
    it('should not show hydration warning from mismatching asPath', async () => {
      const browser = await next.browser('/zeit/cmnt-1')
      const caughtWarns = await browser.eval('window.caughtWarns')
      expect(caughtWarns).toEqual([])
    })
  }
})
