/* eslint-env jest */

import { nextBuild, nextServer, startApp, stopApp } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '..')

let appPort
let app
let server

describe('Query String with Encoding', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
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
          const text = await browser.elementByCss('#query-content').text()
          expect(text).toBe('{"test":"abc\\n"}')
        })

        it('should have correct query on Router#push', async () => {
          const browser = await webdriver(appPort, '/')
          await browser.waitForCondition('!!window.next.router')
          await browser.eval(
            `window.next.router.push({pathname:'/',query:{abc:'def\\n'}})`
          )
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"abc":"def\\n"}')
        })

        it('should have correct query on simple client-side <Link>', async () => {
          const browser = await webdriver(appPort, '/newline')
          await browser.waitForElementByCss('#hello-lf').click()
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"another":"hello\\n"}')
        })

        it('should have correct query on complex client-side <Link>', async () => {
          const browser = await webdriver(appPort, '/newline')
          await browser.waitForElementByCss('#hello-complex').click()
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"complex":"yes\\n"}')
        })
      })

      describe('trailing space', () => {
        it('should have correct query on SSR', async () => {
          const browser = await webdriver(appPort, '/?test=abc%20')
          const text = await browser.elementByCss('#query-content').text()
          expect(text).toBe('{"test":"abc "}')
        })

        it('should have correct query on Router#push', async () => {
          const browser = await webdriver(appPort, '/')
          await browser.waitForCondition('!!window.next.router')
          await browser.eval(
            `window.next.router.push({pathname:'/',query:{abc:'def '}})`
          )
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"abc":"def "}')
        })

        it('should have correct query on simple client-side <Link>', async () => {
          const browser = await webdriver(appPort, '/space')
          await browser.waitForElementByCss('#hello-space').click()
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"another":"hello "}')
        })

        it('should have correct query on complex client-side <Link>', async () => {
          const browser = await webdriver(appPort, '/space')
          await browser.waitForElementByCss('#hello-complex').click()
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"complex":"yes "}')
        })
      })

      describe('percent', () => {
        it('should have correct query on SSR', async () => {
          const browser = await webdriver(appPort, '/?test=abc%25')
          const text = await browser.elementByCss('#query-content').text()
          expect(text).toBe('{"test":"abc%"}')
        })

        it('should have correct query on Router#push', async () => {
          const browser = await webdriver(appPort, '/')
          await browser.waitForCondition('!!window.next.router')
          await browser.eval(
            `window.next.router.push({pathname:'/',query:{abc:'def%'}})`
          )
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"abc":"def%"}')
        })

        it('should have correct query on simple client-side <Link>', async () => {
          const browser = await webdriver(appPort, '/percent')
          await browser.waitForElementByCss('#hello-percent').click()
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"another":"hello%"}')
        })

        it('should have correct query on complex client-side <Link>', async () => {
          const browser = await webdriver(appPort, '/percent')
          await browser.waitForElementByCss('#hello-complex').click()
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"complex":"yes%"}')
        })
      })

      describe('plus', () => {
        it('should have correct query on SSR', async () => {
          const browser = await webdriver(appPort, '/?test=abc%2B')
          const text = await browser.elementByCss('#query-content').text()
          expect(text).toBe('{"test":"abc+"}')
        })

        it('should have correct query on Router#push', async () => {
          const browser = await webdriver(appPort, '/')
          await browser.waitForCondition('!!window.next.router')
          await browser.eval(
            `window.next.router.push({pathname:'/',query:{abc:'def+'}})`
          )
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"abc":"def+"}')
        })

        it('should have correct query on simple client-side <Link>', async () => {
          const browser = await webdriver(appPort, '/plus')
          await browser.waitForElementByCss('#hello-plus').click()
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"another":"hello+"}')
        })

        it('should have correct query on complex client-side <Link>', async () => {
          const browser = await webdriver(appPort, '/plus')
          await browser.waitForElementByCss('#hello-complex').click()
          const text = await browser
            .waitForElementByCss('#query-content')
            .text()
          expect(text).toBe('{"complex":"yes+"}')
        })
      })
    }
  )
})
