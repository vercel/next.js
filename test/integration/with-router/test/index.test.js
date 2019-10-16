/* global fixture, test */
import 'testcafe'

import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  getReactErrorOverlayContent,
  nextServer,
  launchApp,
  findPort,
  killApp,
  nextBuild,
  startApp,
  stopApp,
  waitFor
} from 'next-test-utils'

const appDir = join(__dirname, '../')

fixture('withRouter')
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

test('allows observation of navigation events using withRouter', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/a')
  await browser.waitForElementByCss('#page-a')

  let activePage = await browser.elementByCss('.active').text()
  await t.expect(activePage).eql('Foo')

  await browser.elementByCss('button').click()
  await browser.waitForElementByCss('#page-b')

  activePage = await browser.elementByCss('.active').text()
  await t.expect(activePage).eql('Bar')

  await browser.close()
})

test('allows observation of navigation events using top level Router', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/a')
  await browser.waitForElementByCss('#page-a')

  let activePage = await browser.elementByCss('.active-top-level-router').text()
  await t.expect(activePage).eql('Foo')

  await browser.elementByCss('button').click()
  await browser.waitForElementByCss('#page-b')

  activePage = await browser.elementByCss('.active-top-level-router').text()
  await t.expect(activePage).eql('Bar')

  await browser.close()
})

test('allows observation of navigation events using top level Router deprecated behavior', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/a')
  await browser.waitForElementByCss('#page-a')

  let activePage = await browser
    .elementByCss('.active-top-level-router-deprecated-behavior')
    .text()
  await t.expect(activePage).eql('Foo')

  await browser.elementByCss('button').click()
  await browser.waitForElementByCss('#page-b')

  activePage = await browser
    .elementByCss('.active-top-level-router-deprecated-behavior')
    .text()
  await t.expect(activePage).eql('Bar')

  await browser.close()
})

fixture('withRouter SSR')
  .before(async ctx => {
    ctx.port = await findPort()
    ctx.server = await launchApp(join(__dirname, '..'), ctx.port)
  })
  .after(async ctx => {
    await killApp(ctx.server)
  })

test('should show an error when trying to use router methods during SSR', async t => {
  const browser = await webdriver(t.fixtureCtx.port, '/router-method-ssr')
  await waitFor(1000)
  await t
    .expect(await getReactErrorOverlayContent(browser))
    .contains(
      `No router instance found. you should only use "next/router" inside the client side of your app. https://err.sh/`
    )
  await browser.close()
})
