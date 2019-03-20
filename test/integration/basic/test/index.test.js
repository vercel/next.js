/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp
} from 'next-test-utils'

// test suits
import hmr from './hmr'
import errorRecovery from './error-recovery'
import dynamic from './dynamic'
import processEnv from './process-env'

const context = {}
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Basic Features', () => {
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort)

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(context.appPort, '/process-env'),

      renderViaHTTP(context.appPort, '/hmr/about'),
      renderViaHTTP(context.appPort, '/hmr/style'),
      renderViaHTTP(context.appPort, '/hmr/contact'),
      renderViaHTTP(context.appPort, '/hmr/counter')
    ])
  })
  afterAll(() => killApp(context.server))

  dynamic(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  hmr(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  errorRecovery(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  processEnv(context)
})
