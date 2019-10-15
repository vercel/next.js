/* global fixture, test */
import { t } from 'testcafe'

import { join } from 'path'
import {
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp
} from 'next-test-utils'
import fetch from 'node-fetch'

// test suits
import rendering from './rendering'
import client from './client'

fixture('Configuration')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.server = await launchApp(join(__dirname, '../'), ctx.appPort)

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(ctx.appPort, '/next-config'),
      renderViaHTTP(ctx.appPort, '/build-id'),
      renderViaHTTP(ctx.appPort, '/webpack-css'),
      renderViaHTTP(ctx.appPort, '/module-only-component')
    ])
  })
  .after(ctx => {
    killApp(ctx.server)
  })

test('should disable X-Powered-By header support', async t => {
  const url = `http://localhost:${t.fixtureCtx.appPort}/`
  const header = (await fetch(url)).headers.get('X-Powered-By')
  await t.expect(header).notEql('Next.js')
})

rendering(
  (p, q) => renderViaHTTP(t.fixtureCtx.appPort, p, q),
  (p, q) => fetchViaHTTP(t.fixtureCtx.appPort, p, q)
)
client()
