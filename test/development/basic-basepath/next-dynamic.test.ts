import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { renderViaHTTP, check } from 'next-test-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('basic next/dynamic usage', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        components: new FileRef(join(__dirname, 'next-dynamic/components')),
        pages: new FileRef(join(__dirname, 'next-dynamic/pages')),
      },
      nextConfig: {
        basePath: '/docs',
      },
    })
  })
  afterAll(() => next.destroy())

  async function get$(path, query?: any) {
    const html = await renderViaHTTP(next.appPort, path, query)
    return cheerio.load(html)
  }

  describe('Dynamic import', () => {
    describe('default behavior', () => {
      it('should render dynamic import components', async () => {
        const $ = await get$('/docs/dynamic/ssr')
        // Make sure the client side knows it has to wait for the bundle
        expect(JSON.parse($('#__NEXT_DATA__').html()).dynamicIds).toContain(
          './components/hello1.js'
        )
        expect($('body').text()).toMatch(/Hello World 1/)
      })

      it('should render dynamic import components using a function as first parameter', async () => {
        const $ = await get$('/docs/dynamic/function')
        // Make sure the client side knows it has to wait for the bundle
        expect(JSON.parse($('#__NEXT_DATA__').html()).dynamicIds).toContain(
          './components/hello1.js'
        )
        expect($('body').text()).toMatch(/Hello World 1/)
      })

      it('should render even there are no physical chunk exists', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/docs/dynamic/no-chunk')
          await check(
            () => browser.elementByCss('body').text(),
            /Welcome, normal/
          )
          await check(
            () => browser.elementByCss('body').text(),
            /Welcome, dynamic/
          )
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      it('should hydrate nested chunks', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/docs/dynamic/nested')
          await check(() => browser.elementByCss('body').text(), /Nested 1/)
          await check(() => browser.elementByCss('body').text(), /Nested 2/)
          await check(
            () => browser.elementByCss('body').text(),
            /Browser hydrated/
          )

          if ((global as any).browserName === 'chrome') {
            const logs = await browser.log('browser')

            logs.forEach((logItem) => {
              expect(logItem.message).not.toMatch(
                /Expected server HTML to contain/
              )
            })
          }
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      it('should render the component Head content', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/docs/dynamic/head')
          await check(() => browser.elementByCss('body').text(), /test/)
          const backgroundColor = await browser
            .elementByCss('.dynamic-style')
            .getComputedCss('background-color')
          const height = await browser
            .elementByCss('.dynamic-style')
            .getComputedCss('height')
          expect(height).toBe('200px')
          expect(backgroundColor).toMatch(/rgba?\(0, 128, 0/)
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })
    })
    describe('ssr:false option', () => {
      it('should not render loading on the server side', async () => {
        const $ = await get$('/docs/dynamic/no-ssr')
        expect($('body').html()).not.toContain('"dynamicIds"')
        expect($('body').text()).not.toMatch('loading...')
      })

      it('should render the component on client side', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/docs/dynamic/no-ssr')
          await check(
            () => browser.elementByCss('body').text(),
            /Hello World 1/
          )
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })
    })

    describe('ssr:true option', () => {
      it('Should render the component on the server side', async () => {
        const $ = await get$('/docs/dynamic/ssr-true')
        expect($('body').html()).toContain('"dynamicIds"')
        expect($('p').text()).toBe('Hello World 1')
      })

      it('should render the component on client side', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/docs/dynamic/ssr-true')
          await check(
            () => browser.elementByCss('body').text(),
            /Hello World 1/
          )
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })
    })

    describe('custom chunkfilename', () => {
      it('should render the correct filename', async () => {
        const $ = await get$('/docs/dynamic/chunkfilename')
        expect($('body').text()).toMatch(/test chunkfilename/)
        expect($('html').html()).toMatch(/hello-world\.js/)
      })

      it('should render the component on client side', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/docs/dynamic/chunkfilename')
          await check(
            () => browser.elementByCss('body').text(),
            /test chunkfilename/
          )
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })
    })

    describe('custom loading', () => {
      it('should render custom loading on the server side when `ssr:false` and `loading` is provided', async () => {
        const $ = await get$('/docs/dynamic/no-ssr-custom-loading')
        expect($('p').text()).toBe('LOADING')
      })

      it('should render the component on client side', async () => {
        let browser
        try {
          browser = await webdriver(
            next.appPort,
            '/docs/dynamic/no-ssr-custom-loading'
          )
          await check(
            () => browser.elementByCss('body').text(),
            /Hello World 1/
          )
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })
    })

    describe('Multiple modules', () => {
      it('should only include the rendered module script tag', async () => {
        const $ = await get$('/docs/dynamic/multiple-modules')
        const html = $('html').html()
        expect(html).toMatch(/hello1\.js/)
        expect(html).not.toMatch(/hello2\.js/)
      })

      it('should only load the rendered module in the browser', async () => {
        let browser
        try {
          browser = await webdriver(
            next.appPort,
            '/docs/dynamic/multiple-modules'
          )
          const html = await browser.eval('document.documentElement.innerHTML')
          expect(html).toMatch(/hello1\.js/)
          expect(html).not.toMatch(/hello2\.js/)
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      it('should only render one bundle if component is used multiple times', async () => {
        const $ = await get$('/docs/dynamic/multiple-modules')
        const html = $('html').html()
        try {
          expect(html.match(/chunks[\\/]hello1\.js/g).length).toBe(1)
          expect(html).not.toMatch(/hello2\.js/)
        } catch (err) {
          console.error(html)
          throw err
        }
      })
    })
  })
})
