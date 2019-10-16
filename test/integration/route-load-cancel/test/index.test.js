/* global fixture, test */
import 'testcafe'

import webdriver from 'next-webdriver'
import { join } from 'path'
import {
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
  test('should cancel slow page loads on re-navigation', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/')
    await waitFor(5000)

    await browser.elementByCss('#link-1').click()
    await waitFor(1000)
    await browser.elementByCss('#link-2').click()
    await waitFor(1000)

    const text = await browser.elementByCss('#page-text').text()
    await t.expect(text).match(/2/)
    await t.expect(await browser.eval('window.routeCancelled')).eql('yes')
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
