/* eslint-env jest */

import { nextBuild, nextServer, startApp, stopApp } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 2)

let appPort
let app
let server

describe('Top Level Error', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        const appDir = join(__dirname, '../')
        await nextBuild(appDir)
        app = nextServer({
          dir: appDir,
          dev: false,
          quiet: true,
        })

        server = await startApp(app)
        appPort = server.address().port
      })
      afterAll(() => stopApp(server))

      it('should render error page with getInitialProps', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          const text = await browser.waitForElementByCss('#error-p').text()
          expect(text).toBe('Error Rendered with: top level error')
        } finally {
          await browser.close()
        }
      })
    }
  )
})
