/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

// test suits
import dynamic from './dynamic'

const context = {}
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Basic Features', () => {
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort)

    // pre-build all pages at the start
    await Promise.all([
      // renderViaHTTP(context.appPort, '/process-env'),
    ])
  })
  afterAll(() => killApp(context.server))

  dynamic(context, (p, q) => renderViaHTTP(context.appPort, p, q))
})
