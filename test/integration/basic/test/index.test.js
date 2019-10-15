/* global fixture */
import { t } from 'testcafe'
import { join } from 'path'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

// test suits
import hmr from './hmr'
import errorRecovery from './error-recovery'
import dynamic from './dynamic'
import processEnv from './process-env'
import publicFolder from './public-folder'

fixture('Basic Features')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.server = await launchApp(join(__dirname, '../'), ctx.appPort)

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(ctx.appPort, '/process-env'),

      renderViaHTTP(ctx.appPort, '/hmr/about'),
      renderViaHTTP(ctx.appPort, '/hmr/style'),
      renderViaHTTP(ctx.appPort, '/hmr/contact'),
      renderViaHTTP(ctx.appPort, '/hmr/counter')
    ])
  })
  .after(ctx => killApp(ctx.server))

const render = (path, query) => {
  return renderViaHTTP(t.fixtureCtx.appPort, path, query)
}

dynamic(render)
hmr(render)
errorRecovery(render)
processEnv()
publicFolder()
