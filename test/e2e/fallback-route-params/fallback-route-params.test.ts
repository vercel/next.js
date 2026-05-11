import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

describe('Fallback Dynamic Route Params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have correct fallback query (skeleton)', async () => {
    const html = await next.render('/first')
    const $ = cheerio.load(html)
    const { query } = JSON.parse($('#__NEXT_DATA__').text())
    expect(query).toEqual({})
  })

  it('should have correct fallback query (hydration)', async () => {
    const browser = await next.browser('/second')
    const initialSlug = await browser.eval(() => (window as any).initialSlug)
    expect(initialSlug).toBeFalsy()

    await browser.waitForElementByCss('#query')

    const hydratedQuery = JSON.parse(
      await browser.elementByCss('#query').text()
    )
    expect(hydratedQuery).toEqual({ slug: 'second' })
  })
})
