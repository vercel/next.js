/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import cheerio from 'cheerio'
import { validateAMP } from 'amp-test-utils'
import {
  stopApp,
  startApp,
  nextBuild,
  nextServer,
  renderViaHTTP
} from 'next-test-utils'

const appDir = join(__dirname, '../')

fixture('AMP Fragment Styles')
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

test('adds styles from fragment in AMP mode correctly', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/', { amp: 1 })
  await validateAMP(html)
  const $ = cheerio.load(html)
  const styles = $('style[amp-custom]').text()
  await t.expect(styles).match(/background:(.*|)hotpink/)
  await t.expect(styles).match(/font-size:(.*|)16\.4px/)
})
