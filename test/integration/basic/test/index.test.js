/* eslint-env jest */

import { join } from 'path'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

// test suites
import hmr from './hmr'
import errorRecovery from './error-recovery'
import processEnv from './process-env'
import publicFolder from './public-folder'
import security from './security'
import developmentLogs from './development-logs'

const context = {}

describe('Basic Features', () => {
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort, {
      env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
    })
  })
  afterAll(() => killApp(context.server))

  hmr(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  errorRecovery(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  processEnv(context)
  publicFolder(context)
  security(context)
  developmentLogs(context)
})
