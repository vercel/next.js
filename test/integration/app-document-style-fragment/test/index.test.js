/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import cheerio from 'cheerio'
import {
  stopApp,
  startApp,
  nextBuild,
  nextServer,
  renderViaHTTP
} from 'next-test-utils'

const appDir = join(__dirname, '../')

fixture('Custom Document Fragment Styles')
  .before(async ctx => {
    await nextBuild(appDir)
    ctx.app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })

    ctx.server = await startApp(ctx.app)
    ctx.appPort = ctx.server.address().port
  })
  .after(ctx => stopApp(ctx.server))

test('correctly adds styles from fragment styles key', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
  const $ = cheerio.load(html)

  const styles = $('style').text()
  await t.expect(styles).match(/background:(.*|)hotpink/)
  await t.expect(styles).match(/font-size:(.*|)16\.4px/)
})
