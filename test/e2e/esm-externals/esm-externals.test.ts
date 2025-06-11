import { nextTestSetup } from 'e2e-utils'

function normalize(str: string) {
  return str.replace(/<!-- -->/g, '')
}

describe('esm-externals', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  // Pages
  describe.each(['/static', '/ssr', '/ssg'])('pages url %s', (url) => {
    // For invalid esm packages that have "import" pointing to a non-esm-flagged module
    // webpack is using the CJS version instead, but Turbopack is opting out of
    // externalizing and bundling the non-esm-flagged module.
    const expectedHtml = isTurbopack
      ? 'Hello World+World+World+World+World+World'
      : url === '/static'
        ? 'Hello World+World+Alternative+World+World+World'
        : 'Hello World+World+Alternative+World+World+Alternative'

    // On the client side, webpack always bundles, so it uses the non-esm-flagged module too.
    const expectedText =
      isTurbopack || url === '/static'
        ? 'Hello World+World+World+World+World+World'
        : 'Hello World+World+World+World+World+Alternative'

    it('should return the correct SSR HTML', async () => {
      const $ = await next.render$(url)
      const body = $('body p').html()
      expect(normalize(body)).toEqual(expectedHtml)
    })

    it('should render the correct page', async () => {
      const browser = await next.browser(url)
      expect(await browser.elementByCss('body p').text()).toEqual(expectedText)
    })
  })

  // App dir
  describe.each(['/server', '/client'])('app dir url %s', (url) => {
    const expectedHtml = isTurbopack
      ? 'Hello World+World+World'
      : 'Hello World+World+Alternative'

    const expectedText = isTurbopack
      ? 'Hello World+World+World'
      : url === '/client'
        ? 'Hello World+World+World'
        : 'Hello World+World+Alternative'

    it('should return the correct SSR HTML', async () => {
      const $ = await next.render$(url)
      const body = $('body > p').html()
      expect(normalize(body)).toEqual(expectedHtml)
    })

    it('should render the correct page', async () => {
      const browser = await next.browser(url)
      expect(await browser.elementByCss('body > p').text()).toEqual(
        expectedText
      )
    })
  })
})
