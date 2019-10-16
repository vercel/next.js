/* global test */
import 'testcafe'
import webdriver from 'next-webdriver'
import { renderViaHTTP, getBrowserBodyText, check } from 'next-test-utils'
import cheerio from 'cheerio'

const loadJSONInPage = pageContent => {
  const page = cheerio.load(pageContent)
  return JSON.parse(page('#__next').text())
}

export default function () {
  test('should render the home page', async t => {
    const browser = await webdriver(t.fixtureCtx.devPort, '/')
    await check(() => getBrowserBodyText(browser), /This is the home page/)
    await browser.close()
  })

  test('should render pages only existent in exportPathMap page', async t => {
    const browser = await webdriver(t.fixtureCtx.devPort, '/dynamic/one')
    const text = await browser.elementByCss('#dynamic-page p').text()
    await t.expect(text).eql('next export is nice')
    await browser.close()
  })

  test('should be present in ctx.query', async t => {
    const pageContent = await renderViaHTTP(t.fixtureCtx.devPort, '/query')
    const json = loadJSONInPage(pageContent)
    await t.expect(json).eql({ a: 'blue' })
  })

  test('should replace url query params in ctx.query when conflicting', async t => {
    const pageContent = await renderViaHTTP(
      t.fixtureCtx.devPort,
      '/query?a=red'
    )
    const json = loadJSONInPage(pageContent)
    await t.expect(json).eql({ a: 'blue' })
  })

  test('should be merged with url query params in ctx.query', async t => {
    const pageContent = await renderViaHTTP(
      t.fixtureCtx.devPort,
      '/query?b=green'
    )
    const json = loadJSONInPage(pageContent)
    await t.expect(json).eql({ a: 'blue', b: 'green' })
  })
}
