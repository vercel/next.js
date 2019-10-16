/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  renderViaHTTP
} from 'next-test-utils'

const appDir = join(__dirname, '../')

fixture('SSR Prepass')
  .before(async ctx => {
    await nextBuild(appDir)
    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

test('should not externalize when used outside Next.js', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
  await t.expect(html).match(/hello.*?world/)
})
