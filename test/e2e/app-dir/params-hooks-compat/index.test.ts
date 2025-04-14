import { retry } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('app-dir - params hooks compat', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should only access search params with useSearchParams', async () => {
    const browser = await next.browser('/app/foobar?q=app')
    await retry(async () => {
      const appSearchparamsJSON = JSON.parse(
        await browser.elementByCss('#use-search-params').text()
      )
      expect(appSearchparamsJSON).toEqual({ q: 'app' })
    })

    await browser.get('/pages/foobar?q=pages')
    await retry(async () => {
      const pagesSearchparamsJSON = JSON.parse(
        await browser.elementByCss('#use-search-params').text()
      )
      expect(pagesSearchparamsJSON).toEqual({ q: 'pages' })
    })
  })

  it('should only access path params with useParams', async () => {
    const browser = await next.browser('/app/foobar?a=app')
    await retry(async () => {
      const appParamsJSON = JSON.parse(
        await browser.elementByCss('#use-params').text()
      )
      expect(appParamsJSON).toEqual({ slug: 'foobar' })
    })

    await browser.get('/pages/foobar?a=pages')
    await retry(async () => {
      const pagesParamsJSON = JSON.parse(
        await browser.elementByCss('#use-params').text()
      )
      expect(pagesParamsJSON).toEqual({ slug: 'foobar' })
    })
  })
})
