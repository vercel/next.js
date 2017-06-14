/* global describe, it, expect */
import webdriver from 'next-webdriver'
import cheerio from 'cheerio'
import { waitFor } from 'next-test-utils'

export default (context, render) => {
  describe('Dynamic import', () => {
    describe('with SSR', () => {
      async function get$ (path, query) {
        const html = await render(path, query)
        return cheerio.load(html)
      }

      it('should render dynmaic import components', async () => {
        const $ = await get$('/dynamic/ssr')
        expect($('p').text()).toBe('Hello World 1')
      })

      it('should stop render dynmaic import components', async () => {
        const $ = await get$('/dynamic/no-ssr')
        expect($('p').text()).toBe('loading...')
      })

      it('should stop render dynmaic import components with custom loading', async () => {
        const $ = await get$('/dynamic/no-ssr-custom-loading')
        expect($('p').text()).toBe('LOADING')
      })
    })

    describe('with browser', () => {
      it('should render the page client side', async () => {
        const browser = await webdriver(context.appPort, '/dynamic/no-ssr-custom-loading')

        while (true) {
          const bodyText = await browser
            .elementByCss('body').text()
          if (/Hello World 1/.test(bodyText)) break
          await waitFor(1000)
        }

        browser.close()
      })

      it('should render even there are no physical chunk exists', async () => {
        const browser = await webdriver(context.appPort, '/dynamic/no-chunk')

        while (true) {
          const bodyText = await browser
            .elementByCss('body').text()
          if (
            /Welcome, normal/.test(bodyText) &&
            /Welcome, dynamic/.test(bodyText)
          ) break
          await waitFor(1000)
        }

        browser.close()
      })
    })
  })
}
