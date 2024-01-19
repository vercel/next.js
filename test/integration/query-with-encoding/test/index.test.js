/* eslint-env jest */

import { nextBuild, nextServer, startApp, stopApp } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '..')

let appPort
let app
let server

describe('Query String with Encoding', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      app = nextServer({
        dir: join(__dirname, '../'),
        dev: false,
        quiet: true,
      })

      server = await startApp(app)
      appPort = server.address().port
    })
    afterAll(() => stopApp(server))

    describe('new line', () => {
      it('should have correct query on SSR', async () => {
        const browser = await webdriver(appPort, '/?test=abc%0A')
        try {
          const text = await browser.elementByCss('#query-content').text()
          expect(text).toBe('{"test":"abc\\n"}')
        } finally {
          await browser.close()
        }
      })

      it('should have correct query on Router#push', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await browser.waitForCondition('!!window.next.router')
          await browser.eval(
            `window.next.router.push({pathname:'/',query:{abc:'def\\n'}})`
          )
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"abc":"def\\n"}')
        } finally {
          await browser.close()
        }
      })

      it('should have correct query on simple client-side <Link>', async () => {
        const browser = await webdriver(appPort, '/newline')
        try {
          await browser.waitForElementByCss('#hello-lf').click()
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"another":"hello\\n"}')
        } finally {
          await browser.close()
        }
      })

      it('should have correct query on complex client-side <Link>', async () => {
        const browser = await webdriver(appPort, '/newline')
        try {
          await browser.waitForElementByCss('#hello-complex').click()
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"complex":"yes\\n"}')
        } finally {
          await browser.close()
        }
      })
    })

    describe('trailing space', () => {
      it('should have correct query on SSR', async () => {
        const browser = await webdriver(appPort, '/?test=abc%20')
        try {
          const text = await browser.elementByCss('#query-content').text()
          expect(text).toBe('{"test":"abc "}')
        } finally {
          await browser.close()
        }
      })

      it('should have correct query on Router#push', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await browser.waitForCondition('!!window.next.router')
          await browser.eval(
            `window.next.router.push({pathname:'/',query:{abc:'def '}})`
          )
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"abc":"def "}')
        } finally {
          await browser.close()
        }
      })

      it('should have correct query on simple client-side <Link>', async () => {
        const browser = await webdriver(appPort, '/space')
        try {
          await browser.waitForElementByCss('#hello-space').click()
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"another":"hello "}')
        } finally {
          await browser.close()
        }
      })

      it('should have correct query on complex client-side <Link>', async () => {
        const browser = await webdriver(appPort, '/space')
        try {
          await browser.waitForElementByCss('#hello-complex').click()
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"complex":"yes "}')
        } finally {
          await browser.close()
        }
      })
    })

    describe('percent', () => {
      it('should have correct query on SSR', async () => {
        const browser = await webdriver(appPort, '/?test=abc%25')
        try {
          const text = await browser.elementByCss('#query-content').text()
          expect(text).toBe('{"test":"abc%"}')
        } finally {
          await browser.close()
        }
      })

      it('should have correct query on Router#push', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await browser.waitForCondition('!!window.next.router')
          await browser.eval(
            `window.next.router.push({pathname:'/',query:{abc:'def%'}})`
          )
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"abc":"def%"}')
        } finally {
          await browser.close()
        }
      })

      it('should have correct query on simple client-side <Link>', async () => {
        const browser = await webdriver(appPort, '/percent')
        try {
          await browser.waitForElementByCss('#hello-percent').click()
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"another":"hello%"}')
        } finally {
          await browser.close()
        }
      })

      it('should have correct query on complex client-side <Link>', async () => {
        const browser = await webdriver(appPort, '/percent')
        try {
          await browser.waitForElementByCss('#hello-complex').click()
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"complex":"yes%"}')
        } finally {
          await browser.close()
        }
      })
    })

    describe('plus', () => {
      it('should have correct query on SSR', async () => {
        const browser = await webdriver(appPort, '/?test=abc%2B')
        try {
          const text = await browser.elementByCss('#query-content').text()
          expect(text).toBe('{"test":"abc+"}')
        } finally {
          await browser.close()
        }
      })

      it('should have correct query on Router#push', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await browser.waitForCondition('!!window.next.router')
          await browser.eval(
            `window.next.router.push({pathname:'/',query:{abc:'def+'}})`
          )
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"abc":"def+"}')
        } finally {
          await browser.close()
        }
      })

      it('should have correct query on simple client-side <Link>', async () => {
        const browser = await webdriver(appPort, '/plus')
        try {
          await browser.waitForElementByCss('#hello-plus').click()
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"another":"hello+"}')
        } finally {
          await browser.close()
        }
      })

      it('should have correct query on complex client-side <Link>', async () => {
        const browser = await webdriver(appPort, '/plus')
        try {
          await browser.waitForElementByCss('#hello-complex').click()
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"complex":"yes+"}')
        } finally {
          await browser.close()
        }
      })
    })
  })
})
