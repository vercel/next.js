/* eslint-env jest */

import path from 'path'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  nextStart,
  findPort,
  launchApp,
  killApp,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'

const appDir = path.join(__dirname, '..')
let appPort
let app

const runTests = () => {
  it('should provide router context in AppTree on SSR', async () => {
    let html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/page:.*?\//)

    html = await renderViaHTTP(appPort, '/another')
    expect(html).toMatch(/page:.*?\/another/)
  })

  it('should provide router context in AppTree on CSR', async () => {
    const browser = await webdriver(appPort, '/')
    let html = await browser.eval(`document.documentElement.innerHTML`)
    expect(html).toMatch(/page:.*?\//)

    browser.elementByCss('#another').click()
    await waitFor(500)
    html = await browser.eval(`document.documentElement.innerHTML`)
    expect(html).toMatch(/page:.*?\//)

    browser.elementByCss('#home').click()
    await waitFor(500)
    html = await browser.eval(`document.documentElement.innerHTML`)
    expect(html).toMatch(/page:.*?\/another/)
  })

  it('should pass AppTree to NextPageContext', async () => {
    const html = await renderViaHTTP(appPort, '/hello')
    expect(html).toMatch(/saved:.*?Hello world/)
  })
}

describe('AppTree', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests()
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests()
  })
})
