/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  waitFor
} from 'next-test-utils'

const appDir = join(__dirname, '..')

fixture('Empty Project')
  .before(async ctx => {
    ctx.appPort = await findPort()
    const handleOutput = msg => {
      ctx.output += msg
    }
    ctx.app = await launchApp(appDir, ctx.appPort, {
      onStdout: handleOutput,
      onStderr: handleOutput
    })
  })
  .after(ctx => killApp(ctx.app))

test('It should show empty object warning on SSR', async t => {
  t.fixtureCtx.output = ''
  await renderViaHTTP(t.fixtureCtx.appPort, '/')
  await waitFor(100)
  await t
    .expect(t.fixtureCtx.output)
    .match(/returned an empty object from `getInitialProps`/)
})

test('It should not show empty object warning for page without `getInitialProps`', async t => {
  t.fixtureCtx.output = ''
  await renderViaHTTP(t.fixtureCtx.appPort, '/static')
  await waitFor(100)
  await t
    .expect(t.fixtureCtx.output)
    .notMatch(/returned an empty object from `getInitialProps`/)
})

test('should show empty object warning during client transition', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/static')
  await waitFor(1000)
  await browser.eval(`(function() {
    window.gotWarn = false
    const origWarn = console.warn
    window.console.warn = function () {
      if (arguments[0].match(/returned an empty object from \`getInitialProps\`/)) {
        window.gotWarn = true
      }
      origWarn.apply(this, arguments)
    }
    window.next.router.replace('/another')
  })()`)
  await waitFor(300)
  const gotWarn = await browser.eval(`window.gotWarn`)
  await t.expect(gotWarn).eql(true)
  await browser.close()
})
