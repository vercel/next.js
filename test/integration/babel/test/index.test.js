/* global fixture */
import { t } from 'testcafe'

import { join } from 'path'
import {
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp
} from 'next-test-utils'

// test suits
import rendering from './rendering'

fixture('Babel')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.server = await launchApp(join(__dirname, '../'), ctx.appPort)

    // pre-build all pages at the start
    await Promise.all([renderViaHTTP(ctx.appPort, '/')])
  })
  .after(ctx => killApp(ctx.server))

rendering(
  (p, q) => renderViaHTTP(t.fixtureCtx.appPort, p, q),
  (p, q) => fetchViaHTTP(t.fixtureCtx.appPort, p, q)
)
