/* global describe, it, expect */
import { renderViaHTTP } from 'next-test-utils'
import cheerio from 'cheerio'

export default function (context) {
  describe('Render via SSR', () => {
    it('should render the home page', async () => {
      const html = await renderViaHTTP(context.port, '/')
      expect(html).toMatch(/This is the home page/)
    })

    it('should render links correctly', async () => {
      const html = await renderViaHTTP(context.port, '/')
      const $ = cheerio.load(html)
      const dynamicLink = $('#dynamic-1').prop('href')
      const filePathLink = $('#path-with-extension').prop('href')
      expect(dynamicLink).toEqual('/dynamic/one/')
      expect(filePathLink).toEqual('/file-name.md')
    })

    it('should render a page with getInitialProps', async () => {
      const html = await renderViaHTTP(context.port, '/dynamic')
      expect(html).toMatch(/cool dynamic text/)
    })

    it('should render a dynamically rendered custom url page', async () => {
      const html = await renderViaHTTP(context.port, '/dynamic/one')
      expect(html).toMatch(/next export is nice/)
    })

    it('should render pages with dynamic imports', async () => {
      const html = await renderViaHTTP(context.port, '/dynamic-imports')
      expect(html).toMatch(/Welcome to dynamic imports/)
    })

    it('should render paths with extensions', async () => {
      const html = await renderViaHTTP(context.port, '/file-name.md')
      expect(html).toMatch(/this file has an extension/)
    })

    it('should give empty object for query if there is no query', async () => {
      const html = await renderViaHTTP(context.port, '/get-initial-props-with-no-query')
      expect(html).toMatch(/Query is: {}/)
    })

    it('should handle next/asset properly', async () => {
      const html = await renderViaHTTP(context.port, '/asset')
      const $ = cheerio.load(html)
      expect($('img').attr('src')).toBe('/static/myimage.png')
    })
  })
}
