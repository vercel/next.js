/* eslint-env jest */
/* global browser */
import cheerio from 'cheerio'
import { getElementText } from 'puppet-utils'
import { renderViaHTTP, check } from 'next-test-utils'

const loadJSONInPage = pageContent => {
  const page = cheerio.load(pageContent)
  return JSON.parse(page('#__next').text())
}

export default function (context) {
  describe('Render in development mode', () => {
    it('should render the home page', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/'))
      await check(() => getElementText(page, 'body'), /This is the home page/)
      await page.close()
    })

    it('should render pages only existent in exportPathMap page', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/dynamic/one'))
      await expect(page).toMatchElement('#dynamic-page p', { text: 'next export is nice' })
      await page.close()
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
