import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir - params hooks compat',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should only access search params with useSearchParams', async () => {
      const browserApp = await next.browser('/app/foobar?q=app')
      const appSearchparamsJSON = JSON.parse(
        await browserApp.elementByCss('#use-search-params').text()
      )
      const browserPages = await next.browser('/pages/foobar?q=pages')
      const pagesSearchparamsJSON = JSON.parse(
        await browserPages.elementByCss('#use-search-params').text()
      )

      expect(appSearchparamsJSON).toEqual({ q: 'app' })
      expect(pagesSearchparamsJSON).toEqual({ q: 'pages' })
    })

    it('should only access path params with useParams', async () => {
      const browserApp = await next.browser('/app/foobar?a=app')
      const appParamsJSON = JSON.parse(
        await browserApp.elementByCss('#use-params').text()
      )
      const browserPages = await next.browser('/pages/foobar?a=pages')
      const pagesParamsJSON = JSON.parse(
        await browserPages.elementByCss('#use-params').text()
      )

      expect(appParamsJSON).toEqual({ slug: 'foobar' })
      expect(pagesParamsJSON).toEqual({ slug: 'foobar' })
    })
  }
)
