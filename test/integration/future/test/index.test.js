/* global fixture, test */
import 'testcafe'

import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  nextBuild,
  nextServer,
  startApp,
  stopApp,
  renderViaHTTP,
  waitFor
} from 'next-test-utils'

const appDir = join(__dirname, '../')

fixture('future.excludeDefaultMomentLocales')
  .before(async ctx => {
    await nextBuild(appDir)
    ctx.app = nextServer({
      dir: appDir,
      dev: false,
      quiet: true
    })
    ctx.server = await startApp(ctx.app)
    ctx.appPort = ctx.server.address().port
    // wait for it to start up:
    await renderViaHTTP(ctx.appPort, '/')
  })
  .after(ctx => stopApp(ctx.server))

test('should load momentjs', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/')
  await waitFor(5000)
  await t.expect(await browser.elementByCss('h1').text()).match(/current time/i)
  await t.expect(await browser.eval('moment.locales()')).eql(['en'])
  await browser.close()
})
