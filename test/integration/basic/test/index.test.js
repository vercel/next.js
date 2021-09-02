/* eslint-env jest */

import { join } from 'path'
import { findPort, launchApp, killApp } from 'next-test-utils'

// test suites
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

  processEnv(context)
  publicFolder(context)
  security(context)
  developmentLogs(context)
})
