/* global fixture, test */
import 'testcafe'

import path from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  nextStart,
  findPort,
  launchApp,
  killApp,
  renderViaHTTP,
  waitFor
} from 'next-test-utils'

const appDir = path.join(__dirname, '..')
const nextConfig = path.join(appDir, 'next.config.js')

const runTests = () => {
  test('should provide router context in AppTree on SSR', async t => {
    let html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
    await t.expect(html).match(/page:.*?\//)

    html = await renderViaHTTP(t.fixtureCtx.appPort, '/another')
    await t.expect(html).match(/page:.*?\/another/)
  })

  test('should provide router context in AppTree on CSR', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/')
    let html = await browser.eval(`document.documentElement.innerHTML`)
    await t.expect(html).match(/page:.*?\//)

    browser.elementByCss('#another').click()
    await waitFor(500)
    html = await browser.eval(`document.documentElement.innerHTML`)
    await t.expect(html).match(/page:.*?\//)

    browser.elementByCss('#home').click()
    await waitFor(500)
    html = await browser.eval(`document.documentElement.innerHTML`)
    await t.expect(html).match(/page:.*?\/another/)
  })

  test('should pass AppTree to NextPageContext', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/hello')
    await t.expect(html).match(/saved:.*?Hello world/)
  })
}

fixture('AppTree')

fixture('dev mode')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.app = await launchApp(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

runTests()

fixture('production mode')
  .before(async ctx => {
    await nextBuild(appDir)
    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

runTests()

fixture('serverless mode')
  .before(async ctx => {
    await fs.writeFile(nextConfig, `module.exports = { target: 'serverless' }`)
    await nextBuild(appDir)
    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })
  .after(async ctx => {
    await killApp(ctx.app)
    await fs.remove(nextConfig)
  })

runTests()
