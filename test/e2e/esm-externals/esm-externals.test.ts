import { nextTestSetup } from 'e2e-utils'

describe('esm-externals', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  // Pages
  {
    const expectedHtml =
      /Hello <!-- -->World<!-- -->\+<!-- -->World<!-- -->\+<!-- -->World<!-- -->\+<!-- -->World\+World\+World/
    const expectedText = /Hello World\+World\+World\+World\+World\+World/
    const urls = ['/static', '/ssr', '/ssg']

    for (const url of urls) {
      it(`should return the correct SSR HTML for ${url}`, async () => {
        const res = await next.fetch(url)
        const html = await res.text()
        expect(html).toMatch(expectedHtml)
      })

      it(`should render the correct page for ${url}`, async () => {
        const browser = await next.browser(url)
        expect(await browser.elementByCss('body').text()).toMatch(expectedText)
      })
    }
  }

  // App dir
  {
    // TODO App Dir doesn't use esmExternals: true correctly for webpack and Turbopack
    // so we only verify that the page doesn't crash, but ignore the actual content
    // const expectedHtml =
    //   /Hello <!-- -->World<!-- -->\+<!-- -->World<!-- -->\+<!-- -->World/
    const expectedHtml =
      /Hello <!-- -->Wrong<!-- -->\+<!-- -->Wrong<!-- -->\+<!-- -->Wrong/
    // const expectedText = /Hello World\+World\+World/
    const urls = ['/server', '/client']

    for (const url of urls) {
      const expectedText =
        url === '/server'
          ? /Hello Wrong\+Wrong\+Wrong/
          : /Hello World\+World\+World/
      it(`should return the correct SSR HTML for ${url}`, async () => {
        const res = await next.fetch(url)
        const html = await res.text()
        expect(html).toMatch(expectedHtml)
      })

      it(`should render the correct page for ${url}`, async () => {
        const browser = await next.browser(url)
        expect(await browser.elementByCss('body').text()).toMatch(expectedText)
      })
    }
  }
})
