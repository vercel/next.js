/* eslint-env jest */

import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  runNextCommand,
  nextServer,
  startApp,
  stopApp,
} from 'next-test-utils'

let app
let appPort
let server
const appDir = join(__dirname, '../')

function runTests() {
  it('should render server value', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/the-server-value/i)
    expect(html).toMatch(/the-second-server-value/i)
  })

  it('should render dynamic server rendered values before hydration', async () => {
    const browser = await webdriver(appPort, '/')
    const text = await browser.elementByCss('#before-hydration').text()

    expect(text).toMatch(
      /^Index<!--\/?(\$|\s)-->1(<!--\/?(\$|\s)-->)+2(<!--\/?(\$|\s)-->)+3(<!--\/?(\$|\s)-->)+4(<!--\/?(\$|\s)-->)+4$/
    )
    expect(await browser.eval('window.caughtErrors')).toBe('')
  })

  it('should render dynamic server rendered values on client mount', async () => {
    const browser = await webdriver(appPort, '/')
    const text = await browser.elementByCss('#first-render').text()

    expect(text).toMatch(
      /^Index<!--\/?(\$|\s)-->1(<!--\/?(\$|\s)-->)+2(<!--\/?(\$|\s)-->)+3(<!--\/?(\$|\s)-->)+4(<!--\/?(\$|\s)-->)+4$/
    )
    expect(await browser.eval('window.caughtErrors')).toBe('')
  })
}

// This test is not needed for Turbopack as it relies on an experimental webpack feature.
;(process.env.TURBOPACK ? describe.skip : describe)(
  'next/dynamic lazy compilation',
  () => {
    describe('dev mode', () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests(true)
    })
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        beforeAll(async () => {
          await runNextCommand(['build', appDir])

          app = nextServer({
            dir: appDir,
            dev: false,
            quiet: true,
          })

          server = await startApp(app)
          appPort = server.address().port
        })
        afterAll(() => stopApp(server))

        runTests()
      }
    )
  }
)
