/* eslint-env jest */
import webdriver from 'next-webdriver'
import { renderViaHTTP, getBrowserBodyText, check } from 'next-test-utils'
import cheerio from 'cheerio'

const loadJSONInPage = pageContent => {
  const page = cheerio.load(pageContent)
  return JSON.parse(page('#__next').text())
}

export default function (context) {
  describe('Render in development mode', () => {
    it('should render the home page', async () => {
      const browser = await webdriver(context.port, '/')
      await check(() => getBrowserBodyText(browser), /This is the home page/)
      browser.close()
    })

    it('should render pages only existent in exportPathMap page', async () => {
      const browser = await webdriver(context.port, '/dynamic/one')
      const text = await browser.elementByCss('#dynamic-page p').text()
      expect(text).toBe('next export is nice')
      browser.close()
    })
  })

  describe(`ExportPathMap's query in development mode`, () => {
    it('should be present in ctx.query', async () => {
      const pageContent = await renderViaHTTP(context.port, '/query')
      const json = loadJSONInPage(pageContent)
      expect(json).toEqual({ a: 'blue' })
    })

    it('should replace url query params in ctx.query when conflicting', async () => {
      const pageContent = await renderViaHTTP(context.port, '/query?a=red')
      const json = loadJSONInPage(pageContent)
      expect(json).toEqual({ a: 'blue' })
    })

    it('should be merged with url query params in ctx.query', async () => {
      const pageContent = await renderViaHTTP(context.port, '/query?b=green')
      const json = loadJSONInPage(pageContent)
      expect(json).toEqual({ a: 'blue', b: 'green' })
    })
  })
}
