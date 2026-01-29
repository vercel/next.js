import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'
import { join } from 'path'
import { getCacheHeader } from 'next-test-utils'

describe('app-root-param-getters - generateStaticParams', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'generate-static-params'),
  })

  it('should be statically prerenderable', async () => {
    const params = { lang: 'en', locale: 'us' }
    const response = await next.fetch(`/${params.lang}/${params.locale}`)
    expect(response.status).toBe(200)
    expect(getCacheHeader(response)).toBeOneOf(['HIT', 'PRERENDER'])
    const $ = cheerio.load(await response.text())
    expect($('p').text()).toBe(`hello world ${JSON.stringify(params)}`)
  })

  it('should be part of the static shell', async () => {
    const params = { lang: 'en', locale: 'us' }
    const browser = await next.browser(
      `/${params.lang}/${params.locale}/other/1`,
      {
        // prevent streaming (dynamic) content from being inserted into the DOM
        disableJavaScript: true,
      }
    )
    expect(await browser.elementByCss('main > p#root-params').text()).toBe(
      JSON.stringify(params)
    )
  })

  it('should allow reading root params that were not prerendered', async () => {
    const params = { lang: 'sth', locale: 'else' }
    const $ = await next.render$(`/${params.lang}/${params.locale}`)
    expect($('p').text()).toBe(`hello world ${JSON.stringify(params)}`)
  })
})
