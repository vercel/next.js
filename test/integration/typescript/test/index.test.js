/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

import hmr from './hmr'
import typescript from './typescript'

const context = {}
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('TypeScript Features', () => {
  beforeAll(async () => {
    context.appPort = await findPort()
    context.appDir = join(__dirname, '../')
    context.server = await launchApp(context.appDir, context.appPort)

    // pre-build all pages at the start
    await Promise.all([renderViaHTTP(context.appPort, '/hello')])
    await Promise.all([renderViaHTTP(context.appPort, '/type-error-recover')])
  })
  afterAll(() => killApp(context.server))

  hmr(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  typescript(context, (p, q) => renderViaHTTP(context.appPort, p, q))
})
