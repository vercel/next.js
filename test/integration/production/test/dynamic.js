/* eslint-env jest */
import webdriver from 'next-webdriver'
import cheerio from 'cheerio'
import { waitFor, check } from 'next-test-utils'

// These tests are similar to ../../basic/test/dynamic.js
export default (context, render) => {
  async function get$ (path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }
  describe('Dynamic import', () => {
    describe('default behavior', () => {
      it('should render dynamic import components', async () => {
        const $ = await get$('/dynamic/ssr')
        expect($('body').text()).toMatch(/Hello World 1/)
      })

      it('should render even there are no physical chunk exists', async () => {
        let browser
        try {
          browser = await webdriver(context.appPort, '/dynamic/no-chunk')
          await check(() => browser.elementByCss('body').text(), /Welcome, normal/)
          await check(() => browser.elementByCss('body').text(), /Welcome, dynamic/)
        } finally {
          if (browser) {
            browser.close()
          }
        }
      })
    })
    describe('ssr:false option', () => {
      it('Should render loading on the server side', async () => {
        const $ = await get$('/dynamic/no-ssr')
        expect($('p').text()).toBe('loading...')
      })

      it('should render the component on client side', async () => {
        let browser
        try {
          browser = await webdriver(context.appPort, '/dynamic/no-ssr')
          await check(() => browser.elementByCss('body').text(), /Hello World 1/)
        } finally {
          if (browser) {
            browser.close()
          }
        }
      })
    })

    describe('custom loading', () => {
      it('should render custom loading on the server side when `ssr:false` and `loading` is provided', async () => {
        const $ = await get$('/dynamic/no-ssr-custom-loading')
        expect($('p').text()).toBe('LOADING')
      })

      it('should render the component on client side', async () => {
        let browser
        try {
          browser = await webdriver(context.appPort, '/dynamic/no-ssr-custom-loading')
          await check(() => browser.elementByCss('body').text(), /Hello World 1/)
        } finally {
          if (browser) {
            browser.close()
          }
        }
      })
    })

    describe('Import mapping', () => {
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
}
