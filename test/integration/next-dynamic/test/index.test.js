/* global fixture, test */
import 'testcafe'

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
  stopApp
} from 'next-test-utils'

const appDir = join(__dirname, '../')

function runTests () {
  test('should render server value', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
    await t.expect(html).match(/the-server-value/i)
  })

  test('should render dynamic server rendered values on client mount', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/')
    await waitFor(5000)
    const text = await browser.elementByCss('#first-render').text()

    // Failure case is 'Index<!-- -->3<!-- --><!-- -->'
    await t.expect(text).eql('Index<!-- -->1<!-- -->2<!-- -->3')
  })
}

fixture('next/dynamic')

fixture('dev mode')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.app = await launchApp(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

runTests(true)

fixture('production mode')
  .before(async ctx => {
    await runNextCommand(['build', appDir])

    ctx.app = nextServer({
      dir: appDir,
      dev: false,
      quiet: true
    })

    ctx.server = await startApp(ctx.app)
    ctx.appPort = ctx.server.address().port
  })
  .after(ctx => stopApp(ctx.server))

runTests()
