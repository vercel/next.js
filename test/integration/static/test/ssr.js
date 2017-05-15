/* global describe, it, expect */
import { renderViaHTTP } from 'next-test-utils'

export default function (context) {
  describe('Render via SSR', () => {
    it('should render the home page', async () => {
      const html = await renderViaHTTP(context.port, '/')
      expect(html).toMatch(/This is the home page/)
    })

    it('should render a page with getInitialProps', async() => {
      const html = await renderViaHTTP(context.port, '/dynamic')
      expect(html).toMatch(/cool dynamic text/)
    })

    it('should render a dynamically rendered custom url page', async() => {
      const html = await renderViaHTTP(context.port, '/dynamic/one')
      expect(html).toMatch(/next export is nice/)
    })

    it('should render pages with dynamic imports', async() => {
      const html = await renderViaHTTP(context.port, '/dynamic-imports')
      expect(html).toMatch(/Welcome to dynamic imports./)
    })
  })
}
