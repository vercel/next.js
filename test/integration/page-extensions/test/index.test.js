/* global fixture */
import { t } from 'testcafe'

import { join } from 'path'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

// test suits
import hmr from './hmr'

fixture('Page Extensions')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.server = await launchApp(join(__dirname, '../'), ctx.appPort)

    // pre-build all pages at the start
    await Promise.all([renderViaHTTP(ctx.appPort, '/hmr/some-page')])
  })
  .after(ctx => killApp(ctx.server))

hmr((p, q) => renderViaHTTP(t.fixtureCtx.appPort, p, q))
