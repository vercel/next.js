/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import { existsSync } from 'fs'
import { BUILD_ID_FILE } from 'next/constants'
import {
  nextServer,
  nextBuild,
  startApp,
  stopApp,
  renderViaHTTP
} from 'next-test-utils'

const appDir = join(__dirname, '../')

fixture('Production Usage')
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

test('should render the page', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
  await t.expect(html).match(/Hello World/)
})

test('should build the app within the given `dist` directory', async t => {
  await t.expect(existsSync(join(__dirname, `/../dist/${BUILD_ID_FILE}`))).ok()
})
test('should not build the app within the default `.next` directory', async t => {
  await t
    .expect(existsSync(join(__dirname, `/../.next/${BUILD_ID_FILE}`)))
    .notOk()
})
