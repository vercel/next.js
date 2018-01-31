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

      it('should render dynamic import components', async () => {
        const $ = await get$('/dynamic/ssr')
        expect($('p').text()).toBe('Hello World 1')
      })

      it('should stop render dynamic import components', async () => {
        const $ = await get$('/dynamic/no-ssr')
        expect($('p').text()).toBe('loading...')
      })

      it('should stop render dynamic import components with custom loading', async () => {
        const $ = await get$('/dynamic/no-ssr-custom-loading')
        expect($('p').text()).toBe('LOADING')
      })

      it('should render dynamic imports bundle', async () => {
        const $ = await get$('/dynamic/bundle')
        const bodyText = $('body').text()
        expect(/Dynamic Bundle/.test(bodyText)).toBe(true)
        expect(/Hello World 1/.test(bodyText)).toBe(true)
        expect(/Hello World 2/.test(bodyText)).toBe(false)
      })

      it('should render dynamic imports bundle with additional components', async () => {
        const $ = await get$('/dynamic/bundle?showMore=1')
        const bodyText = $('body').text()
        expect(/Dynamic Bundle/.test(bodyText)).toBe(true)
        expect(/Hello World 1/.test(bodyText)).toBe(true)
        expect(/Hello World 2/.test(bodyText)).toBe(true)
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

      describe('with bundle', () => {
        it('should render components', async () => {
          const browser = await webdriver(context.appPort, '/dynamic/bundle')

          while (true) {
            const bodyText = await browser
              .elementByCss('body').text()
            if (
              /Dynamic Bundle/.test(bodyText) &&
              /Hello World 1/.test(bodyText) &&
              !(/Hello World 2/.test(bodyText))
            ) break
            await waitFor(1000)
          }

          browser.close()
        })

        it('should render support React context', async () => {
          const browser = await webdriver(context.appPort, '/dynamic/bundle')

          while (true) {
            const bodyText = await browser
              .elementByCss('body').text()
            if (
              /ZEIT Rocks/.test(bodyText)
            ) break
            await waitFor(1000)
          }

          browser.close()
        })

        it('should load new components and render for prop changes', async () => {
          const browser = await webdriver(context.appPort, '/dynamic/bundle')

          await browser
            .waitForElementByCss('#toggle-show-more')
            .elementByCss('#toggle-show-more').click()

          while (true) {
            const bodyText = await browser
              .elementByCss('body').text()
            if (
              /Dynamic Bundle/.test(bodyText) &&
              /Hello World 1/.test(bodyText) &&
              /Hello World 2/.test(bodyText)
            ) break
            await waitFor(1000)
          }

          browser.close()
        })
      })
    })
  })
}
