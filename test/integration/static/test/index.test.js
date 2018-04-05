/* global jasmine, describe, beforeAll, afterAll */

import { join } from 'path'
import {
  nextBuild,
  nextExport,
  startStaticServer,
  launchApp,
  stopApp,
  killApp,
  findPort,
  renderViaHTTP
} from 'next-test-utils'

import ssr from './ssr'
import browser from './browser'
import dev from './dev'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

const appDir = join(__dirname, '../')
const context = {}
const devContext = {}

describe('Static Export', () => {
  beforeAll(async () => {
    const outdir = join(appDir, 'out')
    await nextBuild(appDir)
    await nextExport(appDir, { outdir })

    context.server = await startStaticServer(join(appDir, 'out'))
    context.port = context.server.address().port

    devContext.appPort = await findPort()
    devContext.server = await launchApp(join(__dirname, '../'), devContext.appPort, true)

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(devContext.appPort, '/'),
      renderViaHTTP(devContext.appPort, '/dynamic/one')
    ])
  })
  afterAll(() => {
    stopApp(context.server)
    killApp(devContext.server)
  })

  ssr(context)
  browser(context)
  dev(context)
})
