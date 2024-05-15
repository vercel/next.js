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
    // [TODO] currently turbopack-generated output takes long time between
    // navigation, we'll optimize it in the future
    const waitTime = process.env.TURBOPACK_BUILD ? 5000 : 500

    const browser = await webdriver(appPort, '/')
    let html = await browser.eval(`document.documentElement.innerHTML`)
    expect(html).toMatch(/page:.*?\//)

    browser.elementByCss('#another').click()
    await waitFor(waitTime)
    html = await browser.eval(`document.documentElement.innerHTML`)
    expect(html).toMatch(/page:.*?\//)

    browser.elementByCss('#home').click()
    await waitFor(waitTime)
    html = await browser.eval(`document.documentElement.innerHTML`)
    expect(html).toMatch(/page:.*?\/another/)
  })

  it('should pass AppTree to NextPageContext', async () => {
    const html = await renderViaHTTP(appPort, '/hello')
    expect(html).toMatch(/saved:.*?Hello world/)
  })
}

describe('AppTree', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))
      runTests()
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))
      runTests()
    }
  )
})
