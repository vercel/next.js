import { nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'
import cheerio from 'cheerio'

/**
 * Regression test for https://github.com/vercel/next.js/issues/86048 with a
 * configured `basePath`. The locale prefix must be preserved for App Router
 * routes, while the basePath is still stripped before downstream rendering
 * (i.e. the matcher must receive `/en-US/test`, not `/docs/en-US/test`).
 */
describe('i18n-app-pages-domain-base-path', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const fetch = (path: string, host: string) =>
    fetchViaHTTP(next.appPort, path, undefined, { headers: { host } })

  it('serves the Pages Router home under basePath', async () => {
    const res = await fetch('/docs', 'nl.example.local')
    expect(res.status).toBe(200)
    const $ = cheerio.load(await res.text())
    expect($('#pages-home').text()).toBe('Pages Router Home')
    expect($('#pages-locale').text()).toBe('nl-NL')
  })

  it('serves the App Router /test page via proxy rewrite under basePath', async () => {
    const res = await fetch('/docs/test', 'nl.example.local')
    expect(res.status).toBe(200)
    const $ = cheerio.load(await res.text())
    expect($('#test-page').text()).toBe('App Router Test Page')
    expect($('#test-locale').text()).toBe('nl-NL')
  })

  it('serves the App Router /test page via a direct locale-prefixed URL under basePath', async () => {
    const res = await fetch('/docs/en-US/test', 'en.example.local')
    expect(res.status).toBe(200)
    const $ = cheerio.load(await res.text())
    expect($('#test-page').text()).toBe('App Router Test Page')
    expect($('#test-locale').text()).toBe('en-US')
  })
})
