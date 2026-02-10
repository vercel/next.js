import { nextTestSetup } from 'e2e-utils'

const isAdapterTest = Boolean(process.env.NEXT_ENABLE_ADAPTER)

describe('not-found-with-pages-i18n', () => {
  const { next, isNextStart, isNextDeploy } = nextTestSetup({
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

  // When using the builder, pages router is incorrectly preferred. This is already fixed when using the adapter
  const SKIP_TEST_FOR_BUILDER = isNextDeploy ? !isAdapterTest : false

  if (!SKIP_TEST_FOR_BUILDER) {
    it.each(['/app-dir/foo', '/foo'])(
      'should prefer the app router 404 over the pages router 404 when both are present - browser %s',
      async (s) => {
        const browser = await next.browser(s)
        expect(await browser.elementByCss('h1').text()).toBe(
          'APP ROUTER - 404 PAGE'
        )

        await browser.loadPage(next.url)
        expect(await browser.elementByCss('h1').text()).toBe(
          'APP ROUTER - 404 PAGE'
        )
      }
    )
  }

  it.each(SKIP_TEST_FOR_BUILDER ? ['/app-dir/foo'] : ['/app-dir/foo', '/foo'])(
    'should prefer the app router 404 over the pages router 404 when both are present - SSR %s',
    async (s) => {
      const ssr = await next.fetch(s)
      expect(ssr.status).toEqual(404)
      expect(await ssr.text()).toContain('APP ROUTER - 404 PAGE')
    }
  )
})
