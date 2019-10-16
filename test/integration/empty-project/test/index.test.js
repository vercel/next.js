/* global fixture, test */
import { t } from 'testcafe'

import { join } from 'path'
import fs from 'fs'
import { fetchViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

fixture('Empty Project')
  .before(async ctx => {
    fs.unlinkSync(join(__dirname, '..', 'pages', '.gitkeep'))
    ctx.appPort = await findPort()
    ctx.server = await launchApp(join(__dirname, '../'), ctx.appPort)
  })
  .after(ctx => {
    killApp(ctx.server)
    fs.closeSync(fs.openSync(join(__dirname, '..', 'pages', '.gitkeep'), 'w'))
  })

const fetch = (p, q) =>
  fetchViaHTTP(t.fixtureCtx.appPort, p, q, { timeout: 5000 })

test('Should not time out and return 404', async t => {
  const res = await fetch('/')
  await t.expect(res.status).eql(404)
})
