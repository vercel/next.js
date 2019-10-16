/* global test */
import 'testcafe'
import { renderViaHTTP } from 'next-test-utils'
import cheerio from 'cheerio'

export default function () {
  test('should render the home page', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.port, '/')
    await t.expect(html).match(/This is the home page/)
  })

  test('should render the about page', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.port, '/about')
    await t.expect(html).match(/This is the About page foobar/)
  })

  test('should render links correctly', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.port, '/')
    const $ = cheerio.load(html)
    const dynamicLink = $('#dynamic-1').prop('href')
    const filePathLink = $('#path-with-extension').prop('href')
    await t.expect(dynamicLink).eql('/dynamic/one/')
    await t.expect(filePathLink).eql('/file-name.md')
  })

  test('should render a page with getInitialProps', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.port, '/dynamic')
    await t.expect(html).match(/cool dynamic text/)
  })

  test('should render a dynamically rendered custom url page', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.port, '/dynamic/one')
    await t.expect(html).match(/next export is nice/)
  })

  test('should render pages with dynamic imports', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.port, '/dynamic-imports')
    await t.expect(html).match(/Welcome to dynamic imports/)
  })

  test('should render paths with extensions', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.port, '/file-name.md')
    await t.expect(html).match(/this file has an extension/)
  })

  test('should give empty object for query if there is no query', async t => {
    const html = await renderViaHTTP(
      t.fixtureCtx.port,
      '/get-initial-props-with-no-query'
    )
    await t.expect(html).match(/Query is: {}/)
  })

  test('should render _error on 404.html even if not provided in exportPathMap', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.port, '/404.html')
    // The default error page from the test server
    // contains "404", so need to be specific here
    await t.expect(html).match(/404.*page.*not.*found/i)
  })

  test('should not render _error on /404/index.html', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.port, '/404/index.html')
    // The default error page from the test server
    // contains "404", so need to be specific here
    await t.expect(html).notMatch(/404.*page.*not.*found/i)
  })

  test('Should serve static files', async t => {
    const data = await renderViaHTTP(t.fixtureCtx.port, '/static/data/item.txt')
    await t.expect(data).eql('item')
  })

  test('Should serve public files', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.port, '/about')
    const data = await renderViaHTTP(t.fixtureCtx.port, '/about/data.txt')
    await t.expect(html).match(/This is the About page foobar/)
    await t.expect(data).eql('data')
  })

  test('Should render dynamic files with query', async t => {
    const html = await renderViaHTTP(
      t.fixtureCtx.port,
      '/blog/nextjs/comment/test'
    )
    await t.expect(html).match(/Blog post nextjs comment test/)
  })
}
