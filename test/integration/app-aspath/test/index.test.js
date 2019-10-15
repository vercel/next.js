/* global fixture, test */
import 'testcafe'

import { readFileSync, writeFileSync } from 'fs'
import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  waitFor
} from 'next-test-utils'

fixture('App asPath')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.server = await launchApp(join(__dirname, '../'), ctx.appPort)

    // pre-build all pages at the start
    await Promise.all([renderViaHTTP(ctx.appPort, '/')])
  })
  .after(ctx => killApp(ctx.server))

test('should not have any changes in asPath after a bundle rebuild', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/')
  const appPath = join(__dirname, '../', 'pages', '_app.js')
  const originalContent = readFileSync(appPath, 'utf8')

  const text = await browser.elementByCss('body').text()
  await t
    .expect(text)
    .contains('{ "url": { "query": {}, "pathname": "/", "asPath": "/" } }')

  const editedContent = originalContent.replace(
    'find this',
    'replace with this'
  )

  // Change the content to trigger a bundle rebuild
  await writeFileSync(appPath, editedContent, 'utf8')

  // Wait for the bundle rebuild
  await waitFor(5000)

  const newContent = await browser.elementByCss('body').text()
  await t
    .expect(newContent)
    .contains('{ "url": { "query": {}, "pathname": "/", "asPath": "/" } }')

  // Change back to the original content
  writeFileSync(appPath, originalContent, 'utf8')
  await browser.close()
})
