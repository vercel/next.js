/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import { renderViaHTTP, launchApp, findPort, killApp } from 'next-test-utils'

fixture('Dynamic require')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.server = await launchApp(join(__dirname, '../'), ctx.appPort)
  })
  .after(ctx => killApp(ctx.server))

test('should not throw error when dynamic require is used', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
  await t.expect(html).match(/If you can see this then we are good/)
})
