/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import cheerio from 'cheerio'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  renderViaHTTP
} from 'next-test-utils'

const appDir = join(__dirname, '../')

fixture('De-dedupes scripts in _document')
  .before(async ctx => {
    await nextBuild(appDir)
    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

test('Does not have duplicate script references', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
  const $ = cheerio.load(html)
  let foundDuplicate = false
  const srcs = new Set()

  for (const script of $('script').toArray()) {
    const { src } = script.attribs
    if (!src || !src.startsWith('/_next/static')) continue
    if (srcs.has(src)) {
      console.error(`Found duplicate script ${src}`)
      foundDuplicate = true
    }
    srcs.add(src)
  }
  await t.expect(foundDuplicate).eql(false)
})
