import { nextTestSetup } from 'e2e-utils'

describe('not-found-with-pages', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  if (isNextStart) {
    it('should write all locales to the pages manifest', async () => {
      const pagesManifest = JSON.parse(
        await next.readFile('.next/server/pages-manifest.json')
      )

      expect(pagesManifest['/404']).toBe('pages/404.html')
      expect(pagesManifest['/en/404']).toBe('pages/404.html')
      expect(pagesManifest['/en-GB/404']).toBe('pages/404.html')
    })
  }

  it('should prefer the app router 404 over the pages router 404 when both are present', async () => {
    const browser = await next.browser('/app-dir/foo')
    expect(await browser.elementByCss('h1').text()).toBe(
      'APP ROUTER - 404 PAGE'
    )

    await browser.loadPage(next.url)
    expect(await browser.elementByCss('h1').text()).toBe(
      'APP ROUTER - 404 PAGE'
    )
  })
})
