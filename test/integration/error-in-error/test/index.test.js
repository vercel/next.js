/* global fixture, test */
import 'testcafe'

import path from 'path'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  renderViaHTTP,
  waitFor
} from 'next-test-utils'

const appDir = path.join(__dirname, '..')

fixture('Handles an Error in _error')
  .before(async ctx => {
    await nextBuild(appDir)
    ctx.port = await findPort()
    ctx.app = await nextStart(appDir, ctx.port)
  })
  .after(ctx => killApp(ctx.app))

test('Handles error during SSR', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.port, '/some-404-page')
  await t.expect(html).match(/internal server error/i)
})

test('Handles error during client transition', async t => {
  const browser = await webdriver(t.fixtureCtx.port, '/')
  await browser.elementByCss('a').click()
  await waitFor(1000)
  const html = await browser.eval('document.body.innerHTML')
  await t.expect(html).match(/internal server error/i)
})
