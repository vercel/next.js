/* eslint-env jest */
/* global browser */
import cheerio from 'cheerio'
import { waitFor, check } from 'next-test-utils'
import { getElementText, getComputedCSS } from 'puppet-utils'

export default (context, render) => {
  async function get$ (path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }
  describe('Dynamic import', () => {
    describe('default behavior', () => {
      it('should render dynamic import components', async () => {
        const $ = await get$('/dynamic/ssr')
        // Make sure the client side knows it has to wait for the bundle
        expect($('body').html()).toContain('"dynamicIds":["./components/hello1.js"]')
        expect($('body').text()).toMatch(/Hello World 1/)
      })

      it('should render dynamic import components using a function as first parameter', async () => {
        const $ = await get$('/dynamic/function')
        // Make sure the client side knows it has to wait for the bundle
        expect($('body').html()).toContain('"dynamicIds":["./components/hello1.js"]')
        expect($('body').text()).toMatch(/Hello World 1/)
      })

      it('should render even there are no physical chunk exists', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/dynamic/no-chunk'))

        await check(() => getElementText(page, 'body'), /Welcome, normal/)
        await check(() => getElementText(page, 'body'), /Welcome, dynamic/)

        await page.close()
      })

      it('should hydrate nested chunks', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/dynamic/nested'))

        page.on('console', msg => {
          expect(msg.args().join('')).not.toMatch(/Expected server HTML to contain/)
        })

        await check(() => getElementText(page, 'body'), /Nested 1/)
        await check(() => getElementText(page, 'body'), /Nested 2/)
        await check(() => getElementText(page, 'body'), /Browser hydrated/)

        await page.close()
      })

      it('should render the component Head content', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/dynamic/head'))

        await check(() => getElementText(page, 'body'), /test/)
        const backgroundColor = await getComputedCSS(page, '.dynamic-style', 'background-color')
        const height = await getComputedCSS(page, '.dynamic-style', 'height')

        expect(height).toBe('200px')
        expect(backgroundColor).toBe('rgb(0, 128, 0)')

        await page.close()
      })
    })
    describe('ssr:false option', () => {
      it('should render loading on the server side', async () => {
        const $ = await get$('/dynamic/no-ssr')
        expect($('body').html()).not.toContain('"dynamicIds"')
        expect($('p').text()).toBe('loading...')
      })

      it('should render the component on client side', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/dynamic/ssr-true'))
        await check(() => getElementText(page, 'body'), /Hello World 1/)
        await page.close()
      })
    })

    describe('ssr:true option', () => {
      it('Should render the component on the server side', async () => {
        const $ = await get$('/dynamic/ssr-true')
        expect($('body').html()).toContain('"dynamicIds"')
        expect($('p').text()).toBe('Hello World 1')
      })

      it('should render the component on client side', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/dynamic/ssr-true'))
        await check(() => getElementText(page, 'body'), /Hello World 1/)
        await page.close()
      })
    })

    describe('custom chunkfilename', () => {
      it('should render the correct filename', async () => {
        const $ = await get$('/dynamic/chunkfilename')
        expect($('body').text()).toMatch(/test chunkfilename/)
        expect($('html').html()).toMatch(/hello-world\.js/)
      })

      it('should render the component on client side', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/dynamic/chunkfilename'))
        await check(() => getElementText(page, 'body'), /test chunkfilename/)
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

    describe('Multiple modules', () => {
      it('should only include the rendered module script tag', async () => {
        const $ = await get$('/dynamic/multiple-modules')
        const html = $('html').html()
        expect(html).toMatch(/hello1\.js/)
        expect(html).not.toMatch(/hello2\.js/)
      })

      it('should only load the rendered module in the browser', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/dynamic/multiple-modules'))
        const html = await page.evaluate(() => document.querySelector('html').innerHTML)
        expect(html).toMatch(/hello1\.js/)
        expect(html).not.toMatch(/hello2\.js/)
        await page.close()
      })

      it('should only render one bundle if component is used multiple times', async () => {
        const $ = await get$('/dynamic/multiple-modules')
        const html = $('html').html()
        try {
          expect(html.match(/chunks[\\/]hello1\.js/g).length).toBe(2) // one for preload, one for the script tag
          expect(html).not.toMatch(/hello2\.js/)
        } catch (err) {
          console.error(html)
          throw err
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
