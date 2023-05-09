/* eslint-env jest */

import {
  nextServer,
  runNextCommand,
  startApp,
  stopApp,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

let app
let appPort
let server
const appDir = join(__dirname, '../')

function runTests() {
  it('should cancel slow page loads on re-navigation', async () => {
    const browser = await webdriver(appPort, '/')

    await browser.elementByCss('#link-1').click()
    await waitFor(3000)
    expect(await browser.hasElementByCssSelector('#page-text')).toBeFalsy()

    await browser.elementByCss('#link-2').click()
    await waitFor(3000)

    const text2 = await browser.elementByCss('#page-text').text()
    expect(text2).toMatch(/2/)
    expect(await browser.eval('window.routeCancelled')).toBe('yes')
  })
}

describe('route cancel via CSS', () => {
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
