/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import {
  killApp,
  findPort,
  nextBuild,
  nextStart,
  renderViaHTTP
} from 'next-test-utils'

const appDir = join(__dirname, '../')

fixture('External Assets')
  .before(async ctx => {
    await nextBuild(appDir, [])
    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

test('should support Firebase', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/about/history')
  await t.expect(html).match(/Hello Firebase: <!-- -->0/)
})
