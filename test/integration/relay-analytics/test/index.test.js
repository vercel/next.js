/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import webdriver from 'next-webdriver'
import { killApp, findPort, launchApp } from 'next-test-utils'

const appDir = join(__dirname, '../')

fixture('Analytics relayer')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.server = await launchApp(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.server))

test('Relays the data to user code', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/')
  await browser.waitForElementByCss('h1')
  const h1Text = await browser.elementByCss('h1').text()
  const data = parseFloat(
    await browser.eval('localStorage.getItem("Next.js-hydration")')
  )
  const firstPaint = parseFloat(
    await browser.eval('localStorage.getItem("first-paint")')
  )
  const firstContentfulPaint = parseFloat(
    await browser.eval('localStorage.getItem("first-contentful-paint")')
  )
  await t.expect(h1Text).match(/Hello!/)
  await t.expect(isNaN(data)).notOk()
  await t.expect(data > 0).ok()
  await t.expect(isNaN(firstPaint)).notOk()
  await t.expect(firstPaint > 0).ok()
  await t.expect(isNaN(firstContentfulPaint)).notOk()
  await t.expect(firstContentfulPaint > 0).ok()
  await browser.close()
})
