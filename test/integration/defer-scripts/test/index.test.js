/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import {
  nextServer,
  runNextCommand,
  startApp,
  stopApp,
  renderViaHTTP
} from 'next-test-utils'
import cheerio from 'cheerio'
const appDir = join(__dirname, '../')

fixture('Defer Scripts')
  .before(async ctx => {
    await runNextCommand(['build', appDir])

    ctx.app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })

    ctx.server = await startApp(ctx.app)
    ctx.appPort = ctx.server.address().port
  })
  .after(ctx => stopApp(ctx.server))

test('should have defer on all script tags', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
  const $ = cheerio.load(html)
  let missing = false

  for (const script of $('script').toArray()) {
    const { defer, type } = script.attribs
    // application/json doesn't need defer
    if (type === 'application/json') {
      continue
    }

    if (defer !== '') {
      missing = true
    }
  }
  await t.expect(missing).eql(false)
})
