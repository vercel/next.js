import { nextTestSetup } from 'e2e-utils'

describe('crossOrigin config with page chunk scripts', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should use the same crossOrigin for every script tag of a chunk after client navigation', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/about"]').click()
    await browser.waitForElementByCss('#about')

    // A request with a different CORS mode has a different cache key, so the
    // same chunk would be downloaded twice.
    const modesBySrc: Record<string, string[]> = await browser.eval(() => {
      const modes: Record<string, string[]> = {}
      for (const script of document.querySelectorAll<HTMLScriptElement>(
        'script[src^="/_next/static/"]'
      )) {
        const src = script.getAttribute('src')
        modes[src] = modes[src] || []
        modes[src].push(script.crossOrigin)
      }
      return modes
    })

    expect(Object.keys(modesBySrc).length).toBeGreaterThan(0)
    for (const [src, modes] of Object.entries(modesBySrc)) {
      expect({ src, modes: [...new Set(modes)] }).toEqual({
        src,
        modes: ['anonymous'],
      })
    }
  })
})
