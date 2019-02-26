/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { renderViaHTTP, runNextDev } from 'next-test-utils'

// test suite
import clientNavigation from './client-navigation'

const context = {}
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Client 404', () => {
  beforeAll(async () => {
    context.server = await runNextDev(join(__dirname, '../'))
    context.appPort = context.server.port

    // pre-build page at the start
    await renderViaHTTP(context.appPort, '/')
  })
  afterAll(() => context.server.close())

  clientNavigation(context, (p, q) => renderViaHTTP(context.appPort, p, q))
})
