/* eslint-env jest */
/* global jasmine */
import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  waitFor,
  runNextCommand,
  nextServer,
  startApp,
  stopApp,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

let app
let appPort
let server
const appDir = join(__dirname, '../')

function runTests() {
  it('should render server value', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/the-server-value/i)
  })

  it('should render dynamic server rendered values on client mount', async () => {
    const browser = await webdriver(appPort, '/')
    await waitFor(5000)
    const text = await browser.elementByCss('#first-render').text()

    // Failure case is 'Index<!-- -->3<!-- --><!-- -->'
    expect(text).toBe('Index<!-- -->1<!-- -->2<!-- -->3')
  })
}

describe('next/dynamic', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests(true)
  })

  describe('production mode', () => {
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
  })
})
