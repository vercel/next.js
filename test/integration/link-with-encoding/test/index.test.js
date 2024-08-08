/* eslint-env jest */

import { findPort, killApp, launchApp, waitFor, check } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '..')

let appPort
let app

describe('Link Component with Encoding', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(app))

  describe('spaces', () => {
    it('should have correct query on SSR', async () => {
      const browser = await webdriver(
        appPort,
        encodeURI('/single/hello world ')
      )
      try {
        const text = await browser.elementByCss('#query-content').text()
        expect(text).toMatchInlineSnapshot(`"{"slug":"hello world "}"`)
      } finally {
        await browser.close()
      }
    })

    it('should have correct query on Router#push', async () => {
      const browser = await webdriver(appPort, '/')
      try {
        await waitFor(2000)
        await browser.eval(
          `window.next.router.push(
            { pathname: '/single/[slug]' },
            { pathname: encodeURI('/single/hello world ') }
          )`
        )
        await check(() => browser.hasElementByCssSelector('#query-content'), {
          test(val) {
            return Boolean(val)
          },
        })
        const text = await browser.elementByCss('#query-content').text()
        expect(text).toMatchInlineSnapshot(`"{"slug":"hello world "}"`)
      } finally {
        await browser.close()
      }
    })

    it('should have correct query on simple client-side <Link>', async () => {
      const browser = await webdriver(appPort, '/')
      try {
        await waitFor(2000)
        await browser.elementByCss('#single-spaces').click()
        await check(() => browser.hasElementByCssSelector('#query-content'), {
          test(val) {
            return Boolean(val)
          },
        })
        const text = await browser.elementByCss('#query-content').text()
        expect(text).toMatchInlineSnapshot(`"{"slug":"hello world "}"`)
      } finally {
        await browser.close()
      }
    })
  })

  describe('percent', () => {
    it('should have correct query on SSR', async () => {
      const browser = await webdriver(appPort, encodeURI('/single/hello%world'))
      try {
        const text = await browser.elementByCss('#query-content').text()
        expect(text).toMatchInlineSnapshot(`"{"slug":"hello%world"}"`)
      } finally {
        await browser.close()
      }
    })

    it('should have correct query on Router#push', async () => {
      const browser = await webdriver(appPort, '/')
      try {
        await waitFor(2000)
        await browser.eval(
          `window.next.router.push(
            { pathname: '/single/[slug]' },
            { pathname: encodeURI('/single/hello%world') }
          )`
        )
        await check(() => browser.hasElementByCssSelector('#query-content'), {
          test(val) {
            return Boolean(val)
          },
        })
        const text = await browser.elementByCss('#query-content').text()
        expect(text).toMatchInlineSnapshot(`"{"slug":"hello%world"}"`)
      } finally {
        await browser.close()
      }
    })

    it('should have correct query on simple client-side <Link>', async () => {
      const browser = await webdriver(appPort, '/')
      try {
        await waitFor(2000)
        await browser.elementByCss('#single-percent').click()
        await check(() => browser.hasElementByCssSelector('#query-content'), {
          test(val) {
            return Boolean(val)
          },
        })
        const text = await browser.elementByCss('#query-content').text()
        expect(text).toMatchInlineSnapshot(`"{"slug":"hello%world"}"`)
      } finally {
        await browser.close()
      }
    })
  })

  describe('forward slash', () => {
    it('should have correct query on SSR', async () => {
      const browser = await webdriver(
        appPort,
        `/single/hello${encodeURIComponent('/')}world`
      )
      try {
        const text = await browser.elementByCss('#query-content').text()
        expect(text).toMatchInlineSnapshot(`"{"slug":"hello/world"}"`)
      } finally {
        await browser.close()
      }
    })

    it('should have correct query on Router#push', async () => {
      const browser = await webdriver(appPort, '/')
      try {
        await waitFor(2000)
        await browser.eval(
          `window.next.router.push(
            { pathname: '/single/[slug]' },
            { pathname: '/single/hello${encodeURIComponent('/')}world' }
          )`
        )
        await check(() => browser.hasElementByCssSelector('#query-content'), {
          test(val) {
            return Boolean(val)
          },
        })
        const text = await browser.elementByCss('#query-content').text()
        expect(text).toMatchInlineSnapshot(`"{"slug":"hello/world"}"`)
      } finally {
        await browser.close()
      }
    })

    it('should have correct query on simple client-side <Link>', async () => {
      const browser = await webdriver(appPort, '/')
      try {
        await waitFor(2000)
        await browser.elementByCss('#single-slash').click()
        await check(() => browser.hasElementByCssSelector('#query-content'), {
          test(val) {
            return Boolean(val)
          },
        })
        const text = await browser.elementByCss('#query-content').text()
        expect(text).toMatchInlineSnapshot(`"{"slug":"hello/world"}"`)
      } finally {
        await browser.close()
      }
    })
  })

  describe('double quote', () => {
    it('should have correct query on SSR', async () => {
      const browser = await webdriver(
        appPort,
        `/single/hello${encodeURIComponent('"')}world`
      )
      try {
        const text = await browser.elementByCss('#query-content').text()
        expect(JSON.parse(text)).toMatchInlineSnapshot(`
          {
            "slug": "hello"world",
          }
        `)
      } finally {
        await browser.close()
      }
    })

    it('should have correct query on Router#push', async () => {
      const browser = await webdriver(appPort, '/')
      try {
        await waitFor(2000)
        await browser.eval(
          `window.next.router.push(
            { pathname: '/single/[slug]' },
            { pathname: '/single/hello${encodeURIComponent('"')}world' }
          )`
        )
        await check(() => browser.hasElementByCssSelector('#query-content'), {
          test(val) {
            return Boolean(val)
          },
        })
        const text = await browser.elementByCss('#query-content').text()
        expect(JSON.parse(text)).toMatchInlineSnapshot(`
          {
            "slug": "hello"world",
          }
        `)
      } finally {
        await browser.close()
      }
    })

    it('should have correct query on simple client-side <Link>', async () => {
      const browser = await webdriver(appPort, '/')
      try {
        await waitFor(2000)
        await browser.elementByCss('#single-double-quote').click()
        await check(() => browser.hasElementByCssSelector('#query-content'), {
          test(val) {
            return Boolean(val)
          },
        })
        const text = await browser.elementByCss('#query-content').text()
        expect(JSON.parse(text)).toMatchInlineSnapshot(`
          {
            "slug": "hello"world",
          }
        `)
      } finally {
        await browser.close()
      }
    })
  })

  describe('colon', () => {
    it('should have correct query on SSR', async () => {
      const browser = await webdriver(
        appPort,
        `/single/hello${encodeURIComponent(':')}world`
      )
      try {
        const text = await browser.elementByCss('#query-content').text()
        expect(text).toMatchInlineSnapshot(`"{"slug":"hello:world"}"`)
      } finally {
        await browser.close()
      }
    })

    it('should have correct query on Router#push', async () => {
      const browser = await webdriver(appPort, '/')
      try {
        await waitFor(2000)
        await browser.eval(
          `window.next.router.push(
            { pathname: '/single/[slug]' },
            { pathname: '/single/hello${encodeURIComponent(':')}world' }
          )`
        )
        await check(() => browser.hasElementByCssSelector('#query-content'), {
          test(val) {
            return Boolean(val)
          },
        })
        const text = await browser.elementByCss('#query-content').text()
        expect(text).toMatchInlineSnapshot(`"{"slug":"hello:world"}"`)
      } finally {
        await browser.close()
      }
    })

    it('should have correct query on simple client-side <Link>', async () => {
      const browser = await webdriver(appPort, '/')
      try {
        await waitFor(2000)
        await browser.elementByCss('#single-colon').click()
        await check(() => browser.hasElementByCssSelector('#query-content'), {
          test(val) {
            return Boolean(val)
          },
        })
        const text = await browser.elementByCss('#query-content').text()
        expect(text).toMatchInlineSnapshot(`"{"slug":"hello:world"}"`)
      } finally {
        await browser.close()
      }
    })

    it('should have correct parsing of url query params', async () => {
      const browser = await webdriver(appPort, '/')
      try {
        await browser.waitForElementByCss('#url-param').click()
        const content = await browser
          .waitForElementByCss('#query-content')
          .text()
        const query = JSON.parse(content)
        expect(query).toHaveProperty('id', 'http://example.com/')
      } finally {
        await browser.close()
      }
    })
  })
})
