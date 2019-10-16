/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

fixture('Configuration')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.server = await launchApp(join(__dirname, '../'), ctx.appPort)
  })
  .after(async ctx => {
    await killApp(ctx.server)
  })

test('should render an MDX page correctly', async t => {
  await t
    .expect(await renderViaHTTP(t.fixtureCtx.appPort, '/'))
    .match(/Hello MDX/)
})

test('should render an MDX page with component correctly', async t => {
  await t
    .expect(await renderViaHTTP(t.fixtureCtx.appPort, '/button'))
    .match(/Look, a button!/)
})
