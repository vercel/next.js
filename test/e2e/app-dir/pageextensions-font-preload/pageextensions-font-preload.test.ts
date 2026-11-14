import { nextTestSetup } from 'e2e-utils'

describe('pageextensions-font-preload', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // Font preload tags are only emitted for statically prerendered output.
  const skipInDev = isNextDev ? it.skip : it

  skipInDev(
    'should emit font preload tags for routes using multi-part pageExtensions',
    async () => {
      const html = await (await next.fetch('/')).text()

      // eslint-disable-next-line jest/no-standalone-expect
      expect(html).toContain('<p>hello world</p>')
      // eslint-disable-next-line jest/no-standalone-expect
      expect(html).toMatch(/<link[^>]+rel="preload"[^>]+as="font"/)
      // eslint-disable-next-line jest/no-standalone-expect
      expect(html).toContain('font/woff2')
    }
  )
  skipInDev(
    'should emit font preload tags for routes with dots in path segments',
    async () => {
      const html = await (await next.fetch('/docs.v1')).text()

      // eslint-disable-next-line jest/no-standalone-expect
      expect(html).toContain('<p>dotted segment page</p>')
      // eslint-disable-next-line jest/no-standalone-expect
      expect(html).toMatch(/<link[^>]+rel="preload"[^>]+as="font"/)
    }
  )

  it('should apply the font from the layout', async () => {
    const browser = await next.browser('/')
    const fontFamily = await browser.eval(
      'getComputedStyle(document.body).fontFamily'
    )
    expect(fontFamily).not.toBe('')
  })
})
