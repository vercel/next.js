/* global fixture, test */
import 'testcafe'

import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { findPort, launchApp, killApp, waitFor } from 'next-test-utils'

const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')

const installCheckVisible = browser => {
  return browser.eval(`(function() {
    window.checkInterval = setInterval(function() {
      let watcherDiv = document.querySelector('#__next-build-watcher')
      watcherDiv = watcherDiv.shadowRoot || watcherDiv
      window.showedBuilder = window.showedBuilder || (
        watcherDiv.querySelector('div').className.indexOf('visible') > -1
      )
      if (window.showedBuilder) clearInterval(window.checkInterval)
    }, 50)
  })()`)
}

fixture('Build Activity Indicator')

fixture('Enabled')
  .before(async ctx => {
    await fs.remove(nextConfig)
    ctx.appPort = await findPort()
    ctx.app = await launchApp(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

test('Adds the build indicator container', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/')
  await waitFor(500)
  const html = await browser.eval('document.body.innerHTML')
  await t.expect(html).match(/__next-build-watcher/)
  await browser.close()
})

test('Shows the build indicator when a page is built during navigation', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/')
  await installCheckVisible(browser)
  await browser.elementByCss('#to-a').click()
  await waitFor(500)
  const wasVisible = await browser.eval('window.showedBuilder')
  await t.expect(wasVisible).eql(true)
  await browser.close()
})

test('Shows build indicator when page is built from modifying', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/b')
  await installCheckVisible(browser)
  const pagePath = join(appDir, 'pages/b.js')
  const origContent = await fs.readFile(pagePath, 'utf8')
  const newContent = origContent.replace('b', 'c')

  await fs.writeFile(pagePath, newContent, 'utf8')
  await waitFor(500)
  const wasVisible = await browser.eval('window.showedBuilder')

  await t.expect(wasVisible).eql(true)
  await fs.writeFile(pagePath, origContent, 'utf8')
  await browser.close()
})

fixture('Disabled with next.config.js')
  .before(async ctx => {
    await fs.writeFile(
      nextConfig,
      'module.exports = { devIndicators: { buildActivity: false } }',
      'utf8'
    )
    ctx.appPort = await findPort()
    ctx.app = await launchApp(appDir, ctx.appPort)
  })
  .after(async ctx => {
    await killApp(ctx.app)
    await fs.remove(nextConfig)
  })

test('Does not add the build indicator container', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/')
  await waitFor(500)
  const html = await browser.eval('document.body.innerHTML')
  await t.expect(html).notMatch(/__next-build-watcher/)
  await browser.close()
})
