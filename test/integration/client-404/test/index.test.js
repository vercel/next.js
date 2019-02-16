/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

// test suite
import clientNavigation from './client-navigation'

const context = {}
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Client 404', () => {
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort)

    // pre-build page at the start
    await renderViaHTTP(context.appPort, '/')
  })
  afterAll(() => killApp(context.server))

  clientNavigation(context, (p, q) => renderViaHTTP(context.appPort, p, q))
})
