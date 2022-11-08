import path from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'
import { getRedboxSource, hasRedbox } from 'next-test-utils'

describe('app-dir root layout', () => {
  const isDev = (global as any).isNextDev

  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        app: new FileRef(path.join(__dirname, 'root-layout/app')),
        'next.config.js': new FileRef(
          path.join(__dirname, 'root-layout/next.config.js')
        ),
      },
      dependencies: {
        react: 'experimental',
        'react-dom': 'experimental',
      },
    })
  })
  afterAll(() => next.destroy())

  if (isDev) {
    // TODO-APP: re-enable after reworking the error overlay.
    describe.skip('Missing required tags', () => {
      it('should error on page load', async () => {
        const browser = await webdriver(next.url, '/missing-tags', {
          waitHydration: false,
        })

        expect(await hasRedbox(browser, true)).toBe(true)
        expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
          "Please make sure to include the following tags in your root layout: <html>, <body>.

          Missing required root layout tags: html, body"
        `)
      })

      it('should error on page navigation', async () => {
        const browser = await webdriver(next.url, '/has-tags', {
          waitHydration: false,
        })
        await browser.elementByCss('a').click()

        expect(await hasRedbox(browser, true)).toBe(true)
        expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
          "Please make sure to include the following tags in your root layout: <html>, <body>.

          Missing required root layout tags: html, body"
        `)
      })

      it('should error on page load on static generation', async () => {
        const browser = await webdriver(next.url, '/static-missing-tags/slug', {
          waitHydration: false,
        })

        expect(await hasRedbox(browser, true)).toBe(true)
        expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
          "Please make sure to include the following tags in your root layout: <html>, <body>.

          Missing required root layout tags: html, body"
        `)
      })
    })
  }

  describe('Should do a mpa navigation when switching root layout', () => {
    it('should work with basic routes', async () => {
      const browser = await webdriver(next.url, '/basic-route')

      expect(await browser.elementById('basic-route').text()).toBe(
        'Basic route'
      )
      await browser.eval('window.__TEST_NO_RELOAD = true')

      // Navigate to page with same root layout
      await browser.elementByCss('a').click()
      expect(
        await browser.waitForElementByCss('#inner-basic-route').text()
      ).toBe('Inner basic route')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeTrue()

      // Navigate to page with different root layout
      await browser.elementByCss('a').click()
      expect(await browser.waitForElementByCss('#route-group').text()).toBe(
        'Route group'
      )
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeUndefined()
    })

    it('should work with route groups', async () => {
      const browser = await webdriver(next.url, '/route-group')

      expect(await browser.elementById('route-group').text()).toBe(
        'Route group'
      )
      await browser.eval('window.__TEST_NO_RELOAD = true')

      // Navigate to page with same root layout
      await browser.elementByCss('a').click()
      expect(
        await browser.waitForElementByCss('#nested-route-group').text()
      ).toBe('Nested route group')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeTrue()

      // Navigate to page with different root layout
      await browser.elementByCss('a').click()
      expect(await browser.waitForElementByCss('#parallel-one').text()).toBe(
        'One'
      )
      expect(await browser.waitForElementByCss('#parallel-two').text()).toBe(
        'Two'
      )
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeUndefined()
    })

    it('should work with parallel routes', async () => {
      const browser = await webdriver(next.url, '/with-parallel-routes')

      expect(await browser.elementById('parallel-one').text()).toBe('One')
      expect(await browser.elementById('parallel-two').text()).toBe('Two')
      await browser.eval('window.__TEST_NO_RELOAD = true')

      // Navigate to page with same root layout
      await browser.elementByCss('a').click()
      expect(
        await browser.waitForElementByCss('#parallel-one-inner').text()
      ).toBe('One inner')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeTrue()

      // Navigate to page with different root layout
      await browser.elementByCss('a').click()
      expect(await browser.waitForElementByCss('#dynamic-hello').text()).toBe(
        'dynamic hello'
      )
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeUndefined()
    })

    it('should work with dynamic routes', async () => {
      const browser = await webdriver(next.url, '/dynamic/first')

      expect(await browser.elementById('dynamic-first').text()).toBe(
        'dynamic first'
      )
      await browser.eval('window.__TEST_NO_RELOAD = true')

      // Navigate to page with same root layout
      await browser.elementByCss('a').click()
      expect(
        await browser.waitForElementByCss('#dynamic-first-second').text()
      ).toBe('dynamic first second')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeTrue()

      // Navigate to page with different root layout
      await browser.elementByCss('a').click()
      expect(
        await browser.waitForElementByCss('#inner-basic-route').text()
      ).toBe('Inner basic route')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeUndefined()
    })

    it('should work with dynamic catchall routes', async () => {
      const browser = await webdriver(next.url, '/dynamic-catchall/slug')

      expect(await browser.elementById('catchall-slug').text()).toBe(
        'catchall slug'
      )
      await browser.eval('window.__TEST_NO_RELOAD = true')

      // Navigate to page with same root layout
      await browser.elementById('to-next-url').click()
      expect(
        await browser.waitForElementByCss('#catchall-slug-slug').text()
      ).toBe('catchall slug slug')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeTrue()

      // Navigate to page with different root layout
      await browser.elementById('to-dynamic-first').click()
      expect(await browser.elementById('dynamic-first').text()).toBe(
        'dynamic first'
      )
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeUndefined()
    })

    it('should work with static routes', async () => {
      const browser = await webdriver(next.url, '/static-mpa-navigation/slug1')

      expect(await browser.elementById('static-slug1').text()).toBe(
        'static slug1'
      )
      await browser.eval('window.__TEST_NO_RELOAD = true')

      // Navigate to page with same root layout
      await browser.elementByCss('a').click()
      expect(await browser.waitForElementByCss('#static-slug2').text()).toBe(
        'static slug2'
      )
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeTrue()

      // Navigate to page with different root layout
      await browser.elementByCss('a').click()
      expect(await browser.elementById('basic-route').text()).toBe(
        'Basic route'
      )
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeUndefined()
    })
  })
})
