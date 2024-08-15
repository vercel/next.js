/* eslint-env jest */

import { join } from 'path'
import { nextBuild, findPort, nextStart, killApp } from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')

let appPort
let app

describe('Polyfills', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      let output = ''

      beforeAll(async () => {
        const { stdout, stderr } = await nextBuild(appDir, [], {
          stdout: true,
          stderr: true,
        })
        output = (stderr || '') + (stdout + '')
        console.log(stdout)
        console.error(stderr)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      it('should alias fetch', async () => {
        const browser = await webdriver(appPort, '/fetch')
        const text = await browser.elementByCss('#test-status').text()

        expect(text).toBe('pass')

        await browser.close()
      })

      it('should allow using process.env when there is an element with `id` of `process`', async () => {
        const browser = await webdriver(appPort, '/process')
        const text = await browser.elementByCss('#process').text()

        expect(text).toBe('Hello, stranger')

        await browser.close()
      })

      it('should contain generated page count in output', async () => {
        expect(output).toContain('Generating static pages (0/5)')
        expect(output).toContain('Generating static pages (5/5)')
        // we should only have 1 segment and the initial message logged out
        expect(output.match(/Generating static pages/g).length).toBe(5)
      })
    }
  )
})
