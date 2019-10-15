/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import {
  fetchViaHTTP,
  renderViaHTTP,
  findPort,
  launchApp,
  killApp
} from 'next-test-utils'

fixture('Compression')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.server = await launchApp(join(__dirname, '../'), ctx.appPort)

    // pre-build page at the start
    await renderViaHTTP(ctx.appPort, '/')
  })
  .after(ctx => killApp(ctx.server))

test('should compress responses by default', async t => {
  const res = await fetchViaHTTP(t.fixtureCtx.appPort, '/')

  await t.expect(res.headers.get('content-encoding')).match(/gzip/)
})
