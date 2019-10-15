/* global fixture, test */
import 'testcafe'

import webdriver from 'next-webdriver'
import path from 'path'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  launchApp,
  waitFor
} from 'next-test-utils'

const appDir = path.join(__dirname, '..')

const runTests = () => {
  test('Supports commonjs 1', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/commonjs1')
    const html = await browser.eval('document.body.innerHTML')
    await t.expect(html).match(/test1/)
    await t.expect(html).match(/nextExport/)
    await browser.close()
  })

  test('Supports commonjs 2', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/commonjs2')
    const html = await browser.eval('document.body.innerHTML')
    await t.expect(html).match(/test2/)
    await t.expect(html).match(/nextExport/)
    await browser.close()
  })

  test('Refreshes query on mount', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/post-1')
    const html = await browser.eval('document.body.innerHTML')
    await t.expect(html).match(/post.*post-1/)
    await t.expect(html).match(/nextExport/)
  })

  test('should update asPath after mount', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/zeit/cmnt-2')
    await waitFor(500)
    const html = await browser.eval(`document.documentElement.innerHTML`)
    await t.expect(html).match(/\/zeit\/cmnt-2/)
  })

  test('should not replace URL with page name while asPath is delayed', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/zeit/cmnt-1')
    await waitFor(500)
    const val = await browser.eval(`!!window.pathnames.find(function(p) {
      return p !== '/zeit/cmnt-1'
    })`)
    await t.expect(val).eql(false)
  })
}

fixture('Auto Export')

fixture('production')
  .before(async ctx => {
    await nextBuild(appDir)
    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })

  .after(async ctx => {
    await killApp(ctx.app)
  })

runTests()

fixture('dev')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.app = await launchApp(appDir, ctx.appPort)
  })

  .after(ctx => killApp(ctx.app))

runTests()

test('should not show hydration warning from mismatching asPath', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/zeit/cmnt-1')
  await waitFor(500)

  const numCaught = await browser.eval(`window.caughtWarns.length`)
  await t.expect(numCaught).eql(0)
})
