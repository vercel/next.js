/* global describe, test, it, expect */

import cheerio from 'cheerio'

export default function ({ app }, suiteName, render) {
  async function get$ (path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }

  describe(suiteName, () => {
    test('renders a stateless component', async () => {
      const html = await render('/stateless')
      expect(html.includes('<meta charSet="utf-8" class="next-head"/>')).toBeTruthy()
      expect(html.includes('My component!')).toBeTruthy()
    })

    test('renders a stateful component', async () => {
      const $ = await get$('/stateful')
      const answer = $('#answer')
      expect(answer.text()).toBe('The answer is 42')
    })

    test('header helper renders header information', async () => {
      const html = await (render('/head'))
      expect(html.includes('<meta charSet="iso-8859-5" class="next-head"/>')).toBeTruthy()
      expect(html.includes('<meta content="my meta" class="next-head"/>')).toBeTruthy()
      expect(html.includes('I can haz meta tags')).toBeTruthy()
    })

    test('renders styled jsx', async () => {
      const $ = await get$('/styled-jsx')
      const styleId = $('#blue-box').attr('class')
      const style = $('style')

      expect(style.text().includes(`p.${styleId}{color:blue`)).toBeTruthy()
    })

    test('renders properties populated asynchronously', async () => {
      const html = await render('/async-props')
      expect(html.includes('Diego Milito')).toBeTruthy()
    })

    test('renders a link component', async () => {
      const $ = await get$('/link')
      const link = $('a[href="/about"]')
      expect(link.text()).toBe('About')
    })

    test('getInitialProps resolves to null', async () => {
      const $ = await get$('/empty-get-initial-props')
      const expectedErrorMessage = '"EmptyInitialPropsPage.getInitialProps()" should resolve to an object. But found "null" instead.'
      expect($('pre').text().includes(expectedErrorMessage)).toBeTruthy()
    })

    test('allows to import .json files', async () => {
      const html = await render('/json')
      expect(html.includes('Zeit')).toBeTruthy()
    })

    test('default export is not a React Component', async () => {
      const $ = await get$('/no-default-export')
      const pre = $('pre')
      expect(pre.text()).toMatch(/The default export is not a React Component/)
    })

    test('error', async () => {
      const $ = await get$('/error')
      expect($('pre').text()).toMatch(/This is an expected error/)
    })

    test('asPath', async () => {
      const $ = await get$('/nav/as-path', { aa: 10 })
      expect($('.as-path-content').text()).toBe('/nav/as-path?aa=10')
    })

    test('error 404', async () => {
      const $ = await get$('/non-existent')
      expect($('h1').text()).toBe('404')
      expect($('h2').text()).toBe('This page could not be found.')
    })

    describe('with the HOC based router', () => {
      it('should navigate as expected', async () => {
        const $ = await get$('/nav/with-hoc')

        expect($('#pathname').text()).toBe('Current path: /nav/with-hoc')
      })

      it('should include asPath', async () => {
        const $ = await get$('/nav/with-hoc')

        expect($('#asPath').text()).toBe('Current asPath: /nav/with-hoc')
      })
    })
  })
}
