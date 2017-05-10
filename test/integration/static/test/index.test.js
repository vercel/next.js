/* global jasmine, describe, beforeAll, afterAll */

import { join } from 'path'
import {
  nextBuild,
  nextExport,
  startStaticServer,
  stopApp
} from 'next-test-utils'

import ssr from './ssr'
import browser from './browser'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 40000
const appDir = join(__dirname, '../')
const context = {}

describe('Static Export', () => {
  beforeAll(async () => {
    const outdir = join(appDir, '.out')
    await nextBuild(appDir)
    await nextExport(appDir, { outdir })

    context.server = await startStaticServer(join(appDir, '.out'))
    context.port = context.server.address().port
  })
  afterAll(() => stopApp(context.server))

  ssr(context)
  browser(context)
})
