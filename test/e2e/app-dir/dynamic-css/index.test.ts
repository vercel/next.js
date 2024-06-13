import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app dir - dynamic css', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should preload all chunks of dynamic component during SSR', async () => {
    const $ = await next.render$('/ssr')
    const cssLinks = $('link[rel="stylesheet"][data-precedence="dynamic"]')
    expect(cssLinks.attr('href')).toContain('.css')

    const preloadJsChunks = $('link[rel="preload"]')
    expect(preloadJsChunks.attr('as')).toBe('script')
    expect(preloadJsChunks.attr('fetchpriority')).toContain(`low`)
  })

  it('should only apply corresponding css for page loaded that /ssr', async () => {
    const browser = await next.browser('/ssr')
    await retry(async () => {
      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('.text')).color`
        )
      ).toBe('rgb(255, 0, 0)')
      // Default border width, which is not effected by bar.css that is not loaded in /ssr
      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('.text')).borderWidth`
        )
      ).toBe('0px')
    })
  })

  it('should only apply corresponding css for page loaded in edge runtime', async () => {
    const browser = await next.browser('/ssr/edge')
    await retry(async () => {
      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('.text')).color`
        )
      ).toBe('rgb(255, 0, 0)')
      // Default border width, which is not effected by bar.css that is not loaded in /ssr
      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('.text')).borderWidth`
        )
      ).toBe('0px')
    })
  })

  it('should only apply corresponding css for page loaded that /another', async () => {
    const browser = await next.browser('/another')
    await retry(async () => {
      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('.text')).color`
        )
      ).not.toBe('rgb(255, 0, 0)')
      // Default border width, which is not effected by bar.css that is not loaded in /ssr
      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('.text')).borderWidth`
        )
      ).toBe('1px')
    })
  })

  it('should not throw with accessing to ALS in preload css', async () => {
    const output = next.cliOutput
    expect(output).not.toContain('was called outside a request scope')
  })
})
