/* eslint-env jest */
/* global browser */
import cheerio from 'cheerio'
import { getElementText } from 'puppet-utils'
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
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/dynamic/no-chunk'))
        await check(() => getElementText(page, 'body'), /Welcome, normal/)
        await check(() => getElementText(page, 'body'), /Welcome, dynamic/)
        await page.close()
      })
    })
    describe('ssr:false option', () => {
      it('should render loading on the server side', async () => {
        const $ = await get$('/dynamic/no-ssr')
        expect($('p').text()).toBe('loading...')
      })

      it('should render the component on client side', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/dynamic/no-ssr'))
        await check(() => getElementText(page, 'body'), /Hello World 1/)
        await page.close()
      })
    })

    describe('ssr:true option', () => {
      it('should render the component on the server side', async () => {
        const $ = await get$('/dynamic/ssr-true')
        expect($('p').text()).toBe('Hello World 1')
      })

      it('should render the component on client side', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/dynamic/ssr-true'))
        await check(() => getElementText(page, 'body'), /Hello World 1/)
        await page.close()
      })
    })

    describe('custom loading', () => {
      it('should render custom loading on the server side when `ssr:false` and `loading` is provided', async () => {
        const $ = await get$('/dynamic/no-ssr-custom-loading')
        expect($('p').text()).toBe('LOADING')
      })

      it('should render the component on client side', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/dynamic/no-ssr-custom-loading'))
        await check(() => getElementText(page, 'body'), /Hello World 1/)
        await page.close()
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
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/dynamic/bundle'))
        while (true) {
          const bodyText = await getElementText(page, 'body')
          if (
            /Dynamic Bundle/.test(bodyText) &&
            /Hello World 1/.test(bodyText) &&
            !(/Hello World 2/.test(bodyText))
          ) break
          await waitFor(1000)
        }
        await page.close()
      })

      it('should render support React context', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/dynamic/bundle'))
        while (true) {
          const bodyText = await getElementText(page, 'body')
          if (
            /ZEIT Rocks/.test(bodyText)
          ) break
          await waitFor(1000)
        }
        await page.close()
      })

      it('should load new components and render for prop changes', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/dynamic/bundle'))
        await expect(page).toClick('#toggle-show-more')
        while (true) {
          const bodyText = await getElementText(page, 'body')
          if (
            /Dynamic Bundle/.test(bodyText) &&
            /Hello World 1/.test(bodyText) &&
            /Hello World 2/.test(bodyText)
          ) break
          await waitFor(1000)
        }
        await page.close()
      })
    })
  })
}
