/* global fixture, test */
import 'testcafe'

import webdriver from 'next-webdriver'
import path from 'path'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  waitFor
} from 'next-test-utils'

const appDir = path.join(__dirname, '..')

fixture('Auto Export Serverless')

test('Refreshes query on mount', async t => {
  await nextBuild(appDir)
  const appPort = await findPort()
  const app = await nextStart(appDir, appPort)

  const browser = await webdriver(appPort, '/post-1')
  await waitFor(500)
  const html = await browser.eval('document.body.innerHTML')
  await t.expect(html).match(/post.*post-1/)
  await t.expect(html).match(/nextExport/)

  await killApp(app)
  await browser.close()
})
