import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'
import { join } from 'path'

describe('app-root-param-getters - generateStaticParams', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'generate-static-params'),
  })

  it('should be statically prerenderable', async () => {
    const response = await next.fetch('/en/us')
    expect(response.status).toBe(200)
    expect(
      response.headers.get(isNextDeploy ? 'x-vercel-cache' : 'x-nextjs-cache')
    ).toBe('HIT')
    const $ = cheerio.load(await response.text())
    expect($('p').text()).toBe(
      `hello world ${JSON.stringify({ lang: 'en', locale: 'us' })}`
    )
  })

  it('should be part of the static shell', async () => {
    const browser = await next.browser('/en/us/other/1', {
      // prevent streaming (dynamic) content from being inserted into the DOM
      disableJavaScript: true,
    })
    expect(await browser.elementByCss('main > p#root-params').text()).toBe(
      JSON.stringify({ lang: 'en', locale: 'us' })
    )
  })

  it('should allow reading root params that were not prerendered', async () => {
    const $ = await next.render$('/sth/else')
    expect($('p').text()).toBe(
      `hello world ${JSON.stringify({ lang: 'sth', locale: 'else' })}`
    )
  })
})
