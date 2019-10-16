/* global fixture, test */
import { t } from 'testcafe'

import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  waitFor,
  nextServer,
  nextBuild,
  startApp,
  stopApp,
  runNextCommand
} from 'next-test-utils'

const appDir = join(__dirname, '../')

async function testBrowser () {
  const browser = await webdriver(t.fixtureCtx.appPort, '/')
  await waitFor(500)
  const element = await browser.elementByCss('#mounted')
  const text = await element.text()
  await t.expect(text).match(/ComponentDidMount executed on client\./)
  await t.expect(await element.getComputedCss('font-size')).eql('40px')
  await t.expect(await element.getComputedCss('color')).eql('rgb(255, 0, 0)')
  await browser.close()
}

fixture('Production Config Usage')
  .before(async ctx => {
    await nextBuild(appDir)
    const app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })
    ctx.server = await startApp(app)
    ctx.appPort = ctx.server.address().port
  })
  .after(ctx => stopApp(ctx.server))

test('should load styles', async t => {
  // Try 3 times as the breaking happens intermittently
  await testBrowser()
  await testBrowser()
  await testBrowser()
})

test('should fail with leading __ in env key', async t => {
  const result = await runNextCommand(['build', appDir], {
    env: { ENABLE_ENV_FAIL_UNDERSCORE: true },
    stdout: true,
    stderr: true
  })

  await t.expect(result.stderr).match(/The key "__NEXT_MY_VAR" under/)
})

test('should fail with NODE_ in env key', async t => {
  const result = await runNextCommand(['build', appDir], {
    env: { ENABLE_ENV_FAIL_NODE: true },
    stdout: true,
    stderr: true
  })

  await t.expect(result.stderr).match(/The key "NODE_ENV" under/)
})

test('should allow __ within env key', async t => {
  const result = await runNextCommand(['build', appDir], {
    env: { ENABLE_ENV_WITH_UNDERSCORES: true },
    stdout: true,
    stderr: true
  })

  await t.expect(result.stderr).notMatch(/The key "SOME__ENV__VAR" under/)
})

test('should add the custom buildid', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/')
  await waitFor(500)
  const text = await browser.elementByCss('#mounted').text()
  await t.expect(text).match(/ComponentDidMount executed on client\./)

  const html = await browser.elementByCss('html').getAttribute('innerHTML')
  await t.expect(html).contains('custom-buildid')
  await browser.close()
})
