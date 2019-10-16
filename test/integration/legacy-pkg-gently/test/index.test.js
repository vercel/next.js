/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import {
  renderViaHTTP,
  runNextCommand,
  nextServer,
  startApp,
  stopApp
} from 'next-test-utils'

const appDir = join(__dirname, '../')

fixture('Legacy Packages')
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

test('should support `node-gently` packages', async t => {
  const res = await renderViaHTTP(t.fixtureCtx.appPort, '/api/hello')
  await t.expect(res).match(/hello world/i)
})
