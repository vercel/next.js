/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  launchApp,
  renderViaHTTP
} from 'next-test-utils'

const appDir = join(__dirname, '../app')

function runTests () {
  test('should render styles during CSR', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/')
    const color = await browser.eval(
      `getComputedStyle(document.querySelector('button')).color`
    )

    await t.expect(color).contains('0, 255, 255')
  })

  test('should render styles during CSR (AMP)', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/amp')
    const color = await browser.eval(
      `getComputedStyle(document.querySelector('button')).color`
    )

    await t.expect(color).contains('0, 255, 255')
  })

  test('should render styles during SSR', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
    await t.expect(html).match(/color:.*?cyan/)
  })

  test('should render styles during SSR (AMP)', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/amp')
    await t.expect(html).match(/color:.*?cyan/)
  })
}

fixture('styled-jsx using in node_modules')

fixture('Production')
  .before(async ctx => {
    await nextBuild(appDir)
    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

runTests()

fixture('Development')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.app = await launchApp(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

runTests()
