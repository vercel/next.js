/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  killApp,
  findPort,
  launchApp,
  fetchViaHTTP,
  renderViaHTTP
} from 'next-test-utils'

const appDir = join(__dirname, '../')

fixture('AMP Bind Initial Data')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.server = await launchApp(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.server))

test('responds with json with accept header on page', async t => {
  const data = await fetchViaHTTP(t.fixtureCtx.appPort, '/', null, {
    headers: {
      accept: 'application/amp.bind+json'
    }
  }).then(res => res.ok && res.text())

  let isJSON = false
  try {
    JSON.parse(data)
    isJSON = true
  } catch (_) {}
  await t.expect(isJSON).eql(true)
})

test('renders the data during SSR', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
  await t.expect(html).match(/The uptime of the server is.*?\d.*?\d/)
})

test('renders a page without data', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/about')
  await t.expect(html).match(/<a.*?home/)
})

test('navigates to a page with data correctly', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/about')
  await browser.elementByCss('a').click()
  await browser.waitForElementByCss('h1')
  const h1Text = await browser.elementByCss('h1').text()
  await t.expect(h1Text).match(/The uptime of the server is.*?\d.*?\d/)
  await browser.close()
})
