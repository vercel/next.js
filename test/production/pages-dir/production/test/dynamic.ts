/* eslint-env jest */
import webdriver from 'next-webdriver'
import cheerio from 'cheerio'
import { check } from 'next-test-utils'
import { NextInstance } from 'e2e-utils'

// These tests are similar to ../../basic/test/dynamic.js
export default (next: NextInstance, render) => {
  async function get$(path: string, query?: any) {
    const html = await render(path, query)
    return cheerio.load(html)
  }
  describe('Dynamic import', () => {
    describe('default behavior', () => {
      it('should render dynamic import components', async () => {
        const $ = await get$('/dynamic/ssr')
        expect($('body').text()).toMatch(/Hello World 1/)
      })

      it('should render one dynamically imported component and load its css files', async () => {
        const $ = await get$('/dynamic/css')
        const cssFiles = $('link[rel=stylesheet]')
        expect(cssFiles.length).toBe(1)
      })

      it('should render three dynamically imported components and load their css files', async () => {
        const $ = await get$('/dynamic/many-dynamic-css')
        const cssFiles = $('link[rel=stylesheet]')
        expect(cssFiles.length).toBe(3)
      })

      it('should bundle two css modules for one dynamically imported component into one css file', async () => {
        const $ = await get$('/dynamic/many-css-modules')
        const cssFiles = $('link[rel=stylesheet]')
        expect(cssFiles.length).toBe(1)
      })

      it('should bundle two css modules for nested components into one css file', async () => {
        const $ = await get$('/dynamic/nested-css')
        const cssFiles = $('link[rel=stylesheet]')
        expect(cssFiles.length).toBe(1)
      })

      it('should not remove css styles for same css file between page transitions', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/dynamic/pagechange1')
          await check(() => browser.elementByCss('body').text(), /PageChange1/)
          const firstElement = await browser.elementById('with-css')
          const css1 = await firstElement.getComputedCss('display')
          expect(css1).toBe('flex')
          await browser.eval(function () {
            // @ts-expect-error window.next exists
            window.next.router.push('/dynamic/pagechange2')
          })
          await check(() => browser.elementByCss('body').text(), /PageChange2/)
          const secondElement = await browser.elementById('with-css')
          const css2 = await secondElement.getComputedCss('display')
          expect(css2).toBe(css1)
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      // It seem to be abnormal, dynamic CSS modules are completely self-sufficient, so shared styles are copied across files
      it('should output two css files even in case of three css module files while one is shared across files', async () => {
        const $ = await get$('/dynamic/shared-css-module')
        const cssFiles = $('link[rel=stylesheet]')
        expect(cssFiles.length).toBe(2)
      })

      it('should render one dynamically imported component without any css files', async () => {
        const $ = await get$('/dynamic/no-css')
        const cssFiles = $('link[rel=stylesheet]')
        expect(cssFiles.length).toBe(0)
      })

      it('should render even there are no physical chunk exists', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/dynamic/no-chunk')
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
    })
    describe('ssr:false option', () => {
      it('should not render loading on the server side', async () => {
        const $ = await get$('/dynamic/no-ssr')
        expect($('body').text()).not.toMatch('loading...')
      })

      it('should render the component on client side', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/dynamic/no-ssr')
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
      it('should render the component on the server side', async () => {
        const $ = await get$('/dynamic/ssr-true')
        expect($('p').text()).toBe('Hello World 1')
      })

      it('should render the component on client side', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/dynamic/ssr-true')
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

    describe('custom loading', () => {
      it('should render custom loading on the server side when `ssr:false` and `loading` is provided', async () => {
        const $ = await get$('/dynamic/no-ssr-custom-loading')
        expect($('p').text()).toBe('LOADING')
      })

      it('should render the component on client side', async () => {
        let browser
        try {
          browser = await webdriver(
            next.appPort,
            '/dynamic/no-ssr-custom-loading'
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
  })
}
