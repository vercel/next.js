/* global fixture */
import { t } from 'testcafe'

import { join } from 'path'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

// test suite
import clientNavigation from './client-navigation'

fixture('Client 404')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.server = await launchApp(join(__dirname, '../'), ctx.appPort)

    // pre-build page at the start
    await renderViaHTTP(ctx.appPort, '/')
  })
  .after(ctx => killApp(ctx.server))

clientNavigation((p, q) => renderViaHTTP(t.fixtureCtx.appPort, p, q))
